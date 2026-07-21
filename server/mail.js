"use strict";
/* メール連携: IMAPで受信を取り込み、AIで分類し、SMTPで返信を送る。
   Gmail / Outlook はプリセットのホスト設定で接続(認証はアプリパスワード等)。 */
const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const nodemailer = require("nodemailer");
const { db, getSettings } = require("./db");
const ai = require("./ai");

const PROVIDER_PRESETS = {
  gmail: { imap_host: "imap.gmail.com", imap_port: 993, smtp_host: "smtp.gmail.com", smtp_port: 465, smtp_secure: 1 },
  outlook: { imap_host: "outlook.office365.com", imap_port: 993, smtp_host: "smtp.office365.com", smtp_port: 587, smtp_secure: 0 },
  custom: {},
};

const MAX_BODY_CHARS = 8000;
const FIRST_SYNC_COUNT = 20; // 初回同期で取り込む直近メール数

function imapClient(acc) {
  return new ImapFlow({
    host: acc.imap_host,
    port: acc.imap_port,
    secure: true,
    auth: { user: acc.username, pass: acc.password },
    logger: false,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
  });
}

function smtpTransport(acc) {
  return nodemailer.createTransport({
    host: acc.smtp_host,
    port: acc.smtp_port,
    secure: Boolean(acc.smtp_secure),
    auth: { user: acc.username, pass: acc.password },
    connectionTimeout: 15000,
  });
}

/* 接続テスト(IMAPログイン + SMTP検証)。保存前の設定確認に使う */
async function testAccount(acc) {
  const result = { imap: false, smtp: false, error: "" };
  try {
    const client = imapClient(acc);
    await client.connect();
    await client.logout();
    result.imap = true;
  } catch (e) {
    result.error = `IMAP接続失敗: ${e.responseText || e.message}`;
    return result;
  }
  try {
    await smtpTransport(acc).verify();
    result.smtp = true;
  } catch (e) {
    result.error = `SMTP接続失敗: ${e.message}`;
  }
  return result;
}

/* 1アカウント分の新着を取り込む。戻り値: 取り込んだ件数 */
async function syncAccount(acc) {
  const client = imapClient(acc);
  const inserted = [];
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uidNext = client.mailbox.uidNext || 1;
      let startUid = acc.last_uid + 1;
      if (acc.last_uid === 0) startUid = Math.max(1, uidNext - FIRST_SYNC_COUNT); // 初回は直近のみ
      let maxUid = acc.last_uid;

      if (startUid < uidNext) {
        for await (const msg of client.fetch(`${startUid}:*`, { uid: true, envelope: true, source: true }, { uid: true })) {
          if (msg.uid <= acc.last_uid) continue;
          maxUid = Math.max(maxUid, msg.uid);
          let parsed = null;
          try { parsed = await simpleParser(msg.source); } catch { /* パース失敗時はenvelopeのみで登録 */ }
          const env = msg.envelope || {};
          const fromObj = (env.from && env.from[0]) || {};
          const addrList = (list) => (list || []).map((a) => a.address).filter(Boolean).join(", ").slice(0, 500);
          const body = (parsed?.text || parsed?.html?.replace(/<[^>]+>/g, " ") || "").trim().slice(0, MAX_BODY_CHARS);
          const attachments = JSON.stringify((parsed?.attachments || []).map((a) => a.filename || "添付ファイル").slice(0, 20));
          const threadRef = (env.inReplyTo || parsed?.references?.[0] || "").slice(0, 300);
          const receivedAt = (env.date ? new Date(env.date) : new Date()).toISOString();
          try {
            const info = db.prepare(`
              INSERT OR IGNORE INTO emails (account_id, uid, message_id, from_address, from_name, to_addresses, cc_addresses, subject, body, attachments, thread_ref, received_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
              .run(acc.id, msg.uid, env.messageId || "", fromObj.address || "", fromObj.name || "",
                addrList(env.to), addrList(env.cc), env.subject || "(件名なし)", body, attachments, threadRef, receivedAt);
            if (info.changes > 0) inserted.push(info.lastInsertRowid);
          } catch (e) {
            console.error("[mail] insert failed:", e.message);
          }
        }
      }
      db.prepare("UPDATE mail_accounts SET last_uid = ?, last_sync_at = datetime('now'), last_error = '' WHERE id = ?")
        .run(maxUid, acc.id);
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    const message = (e.responseText || e.message || "不明なエラー").slice(0, 300);
    db.prepare("UPDATE mail_accounts SET last_error = ?, last_sync_at = datetime('now') WHERE id = ?").run(message, acc.id);
    console.error(`[mail] sync failed (${acc.label}):`, message);
    try { await client.logout(); } catch { /* already closed */ }
  }

  // 取り込んだメールをAIで分類(1件ずつ・失敗はルールベースに落ちる)
  for (const id of inserted) {
    const mail = db.prepare("SELECT * FROM emails WHERE id = ?").get(id);
    if (!mail) continue;
    try {
      const c = await ai.classifyEmail(mail);
      db.prepare("UPDATE emails SET category = ?, urgency = ?, summary = ?, needs_reply = ?, classified_by = ?, project_id = COALESCE(?, project_id) WHERE id = ?")
        .run(c.category, c.urgency, c.summary, c.needs_reply ? 1 : 0, c.source, c.project_id || null, id);
    } catch (e) {
      console.error("[mail] classify failed:", e.message);
    }
  }
  return inserted.length;
}

/* 全アカウント同期 */
let syncing = false;
async function syncAll() {
  if (syncing) return { skipped: true };
  syncing = true;
  try {
    const accounts = db.prepare("SELECT * FROM mail_accounts WHERE active = 1").all();
    let total = 0;
    for (const acc of accounts) total += await syncAccount(acc);
    return { accounts: accounts.length, fetched: total };
  } finally {
    syncing = false;
  }
}

/* 返信送信 */
async function sendReply(email, text) {
  const acc = db.prepare("SELECT * FROM mail_accounts WHERE id = ?").get(email.account_id);
  if (!acc) throw new Error("送信元アカウントが見つかりません(サンプルメールには送信できません)");
  const subject = /^re:/i.test(email.subject) ? email.subject : `Re: ${email.subject}`;
  await smtpTransport(acc).sendMail({
    from: acc.username,
    to: email.from_address,
    subject,
    text,
    inReplyTo: email.message_id || undefined,
    references: email.message_id || undefined,
  });
  db.prepare("UPDATE emails SET status = 'replied', replied_at = datetime('now'), reply_text = ? WHERE id = ?")
    .run(text, email.id);
}

/* 定期ポーリング(mailPollMinutes間隔・アカウントがある時のみ) */
let lastPoll = 0;
function startPolling() {
  setInterval(async () => {
    try {
      const minutes = Number(getSettings().mailPollMinutes) || 5;
      if (Date.now() - lastPoll < minutes * 60000) return;
      const count = db.prepare("SELECT COUNT(*) AS n FROM mail_accounts WHERE active = 1").get().n;
      if (count === 0) return;
      lastPoll = Date.now();
      const res = await syncAll();
      if (res.fetched) console.log(`[mail] ${res.fetched}件の新着メールを取り込みました`);
    } catch (e) {
      console.error("[mail] poll error:", e.message);
    }
  }, 60000).unref();
}

module.exports = { PROVIDER_PRESETS, testAccount, syncAll, sendReply, startPolling };
