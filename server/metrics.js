"use strict";
/* KPI・危険検知・今日の優先タスクを実データから計算する。
   設計原則: 社長に表示する優先タスクは最大3件。AIは判断、RPAは入力。 */
const { db, getSettings } = require("./db");

const ACTIVE_STAGES = ["リード", "商談中", "見積提出", "契約待ち"];

function today() { return new Date().toISOString().slice(0, 10); }
function monthOf(dateStr) { return (dateStr || "").slice(0, 7); } // YYYY-MM
function thisMonth() { return today().slice(0, 7); }
function daysBetween(a, b) { return Math.floor((new Date(b) - new Date(a)) / 86400000); }

/* ===== KPI(設計書 §KPI) ===== */
function kpis() {
  const m = thisMonth();
  const prevM = new Date(); prevM.setMonth(prevM.getMonth() - 1);
  const pm = prevM.toISOString().slice(0, 7);
  const t = today();

  const won = db.prepare("SELECT COALESCE(SUM(amount),0) AS v FROM deals WHERE won_at IS NOT NULL AND substr(won_at,1,7) = ?");
  const invoiced = db.prepare("SELECT COALESCE(SUM(amount),0) AS v FROM invoices WHERE issued_at IS NOT NULL AND substr(issued_at,1,7) = ?");
  const paid = db.prepare("SELECT COALESCE(SUM(amount),0) AS v FROM invoices WHERE paid_at IS NOT NULL AND substr(paid_at,1,7) = ?");
  const stageCount = db.prepare("SELECT COUNT(*) AS n FROM deals WHERE stage = ?");

  const overdueUnpaid = db.prepare(
    "SELECT COALESCE(SUM(amount),0) AS v, COUNT(*) AS n FROM invoices WHERE issued_at IS NOT NULL AND paid_at IS NULL AND due_date IS NOT NULL AND due_date < ?"
  ).get(t);

  return {
    orderAmount: won.get(m).v,
    orderAmountPrev: won.get(pm).v,
    invoicedAmount: invoiced.get(m).v,
    paidAmount: paid.get(m).v,
    paidAmountPrev: paid.get(pm).v,
    unpaidAmount: overdueUnpaid.v,
    unpaidCount: overdueUnpaid.n,
    dealCount: db.prepare(`SELECT COUNT(*) AS n FROM deals WHERE stage IN (${ACTIVE_STAGES.map(() => "?").join(",")})`).all(...ACTIVE_STAGES)[0].n,
    quoteCount: stageCount.get("見積提出").n,
    awaitingContract: stageCount.get("契約待ち").n,
    inDevelopment: db.prepare("SELECT COUNT(*) AS n FROM projects WHERE status = '開発中'").get().n,
    activeEngineers: db.prepare("SELECT COUNT(*) AS n FROM engineers WHERE active = 1 AND load > 0").get().n,
  };
}

/* ===== 月次売上(直近nヶ月: 受注/請求/入金) ===== */
function monthlySales(n = 6) {
  const months = [];
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - (n - 1));
  for (let i = 0; i < n; i++) {
    const ym = d.toISOString().slice(0, 7);
    months.push({ ym, month: `${Number(ym.slice(5, 7))}月` });
    d.setMonth(d.getMonth() + 1);
  }
  const won = db.prepare("SELECT COALESCE(SUM(amount),0) AS v FROM deals WHERE won_at IS NOT NULL AND substr(won_at,1,7) = ?");
  const inv = db.prepare("SELECT COALESCE(SUM(amount),0) AS v FROM invoices WHERE issued_at IS NOT NULL AND substr(issued_at,1,7) = ?");
  const paid = db.prepare("SELECT COALESCE(SUM(amount),0) AS v FROM invoices WHERE paid_at IS NOT NULL AND substr(paid_at,1,7) = ?");
  return months.map(({ ym, month }) => ({
    month,
    order: Math.round(won.get(ym).v / 10000),
    invoice: Math.round(inv.get(ym).v / 10000),
    paid: Math.round(paid.get(ym).v / 10000),
  }));
}

/* ===== 営業パイプライン ===== */
function pipeline() {
  const m = thisMonth();
  const rows = db.prepare("SELECT stage, COUNT(*) AS count, COALESCE(SUM(amount),0) AS amount FROM deals WHERE stage != '失注' AND (won_at IS NULL OR substr(won_at,1,7) = ?) GROUP BY stage").all(m);
  const byStage = Object.fromEntries(rows.map((r) => [r.stage, r]));
  return [...ACTIVE_STAGES, "受注"].map((stage) => ({
    stage,
    count: byStage[stage]?.count || 0,
    amount: Math.round((byStage[stage]?.amount || 0) / 10000),
  }));
}

/* ===== 危険検知(未返信・未請求・納期遅延・未回収) ===== */
function detectRisks() {
  const s = getSettings();
  if (s.riskDetect !== "1") return [];
  const t = today();
  const risks = [];

  // 納期遅延: 開発中で期限超過
  for (const p of db.prepare("SELECT * FROM projects WHERE status = '開発中' AND deadline IS NOT NULL AND deadline < ? AND progress < 100").all(t)) {
    const days = daysBetween(p.deadline, t);
    risks.push({
      level: days >= 5 ? "critical" : "serious", type: "納期遅延",
      text: `${p.name}(${p.client})が納期を${days}日超過(進捗${p.progress}%)`,
      link: `#/projects/${p.id}`, sort: 100 + days,
    });
  }
  // 未回収: 発行済み・未入金・期日超過
  const unpaidDays = Number(s.unpaidDays) || 7;
  for (const r of db.prepare(`
      SELECT i.*, p.name AS pname, p.client FROM invoices i JOIN projects p ON p.id = i.project_id
      WHERE i.issued_at IS NOT NULL AND i.paid_at IS NULL AND i.due_date IS NOT NULL AND i.due_date < ?`).all(t)) {
    const days = daysBetween(r.due_date, t);
    risks.push({
      level: days >= unpaidDays ? "critical" : "warning", type: "未回収",
      text: `${r.client} 請求書 ${r.number}(${Math.round(r.amount / 10000)}万円)が支払期日${days}日超過`,
      link: `#/projects/${r.project_id}`, sort: 90 + days,
    });
  }
  // 未請求: ドラフトのまま3日以上の請求書
  for (const r of db.prepare(`
      SELECT i.*, p.name AS pname, p.client FROM invoices i JOIN projects p ON p.id = i.project_id
      WHERE i.issued_at IS NULL AND date(i.created_at) <= date('now', '-3 days')`).all()) {
    risks.push({
      level: "serious", type: "未請求",
      text: `${r.client}(${r.pname})の請求書 ${r.number}(${Math.round(r.amount / 10000)}万円)が未発行のままです`,
      link: `#/projects/${r.project_id}`, sort: 60,
    });
  }
  // 返信漏れ: 要返信メールが一定時間未対応
  const replyHours = Number(s.mailReplyHours) || 24;
  for (const m of db.prepare(`
      SELECT * FROM emails WHERE needs_reply = 1 AND status = 'open'
      AND datetime(received_at) <= datetime('now', ?)`).all(`-${replyHours} hours`)) {
    const hours = Math.floor((Date.now() - new Date(m.received_at)) / 3600000);
    risks.push({
      level: ["至急", "高"].includes(m.urgency) ? "critical" : "serious", type: "返信漏れ",
      text: `${m.from_name || m.from_address}「${m.subject}」(${m.category})に${hours}時間未返信`,
      link: `#/mail/${m.id}`, sort: 70 + (["至急", "高"].includes(m.urgency) ? 30 : 0) + Math.min(hours, 48),
    });
  }
  // クレームの兆候: クレーム分類の未対応メールは経過時間に関わらず即検知
  for (const m of db.prepare("SELECT * FROM emails WHERE category = 'クレーム' AND status = 'open'").all()) {
    risks.push({
      level: "critical", type: "クレーム",
      text: `${m.from_name || m.from_address}からクレームの可能性: 「${m.subject}」`,
      link: `#/mail/${m.id}`, sort: 130,
    });
  }
  // 放置案件: 開発中なのに2週間更新がない
  for (const p of db.prepare("SELECT * FROM projects WHERE status = '開発中' AND datetime(updated_at) <= datetime('now', '-14 days')").all()) {
    const days = daysBetween(p.updated_at.slice(0, 10), t);
    risks.push({
      level: "warning", type: "放置案件",
      text: `${p.name}(${p.client})が${days}日間更新されていません`,
      link: `#/projects/${p.id}`, sort: 25 + Math.min(days, 30),
    });
  }
  // 契約未締結: 契約待ちの案件が1週間以上滞留
  for (const p of db.prepare("SELECT * FROM projects WHERE status = '契約待ち' AND datetime(updated_at) <= datetime('now', '-7 days')").all()) {
    const days = daysBetween(p.updated_at.slice(0, 10), t);
    risks.push({
      level: "serious", type: "契約未締結",
      text: `${p.name}(${p.client})の契約が${days}日間未締結のままです`,
      link: `#/projects/${p.id}`, sort: 55 + Math.min(days, 30),
    });
  }
  // フォロー滞留: 活動が止まっている進行中の商談(未返信の検知)
  const noReplyDays = Number(s.noReplyDays) || 3;
  for (const d of db.prepare(`
      SELECT * FROM deals WHERE stage IN ('商談中','見積提出','契約待ち')
      AND datetime(last_activity_at) <= datetime('now', ?)`).all(`-${noReplyDays} days`)) {
    const days = daysBetween(d.last_activity_at.slice(0, 10), t);
    risks.push({
      level: "warning", type: "未返信・滞留",
      text: `${d.client}「${d.title}」の対応が${days}日止まっています(${d.stage})`,
      link: `#/deals/${d.id}`, sort: 30 + days,
    });
  }
  return risks.sort((a, b) => b.sort - a.sort).map(({ sort, ...r }) => r);
}

/* ===== 今日やること(最大3件・優先度スコアリング) ===== */
function todayTasks() {
  const t = today();
  const candidates = [];

  for (const r of db.prepare(`
      SELECT pt.*, p.name AS pname, p.client, p.amount FROM project_tasks pt
      JOIN projects p ON p.id = pt.project_id WHERE pt.done = 0`).all()) {
    let score = 10 + Math.min(r.amount / 1000000, 10);
    let why = `${r.client}「${r.pname}」のタスク`;
    if (r.due) {
      const dd = daysBetween(t, r.due);
      if (dd < 0) { score += 60; why = `期限を${-dd}日超過。${why}`; }
      else if (dd === 0) { score += 50; why = `期限は本日。${why}`; }
      else if (dd <= 3) { score += 30 - dd * 5; why = `期限まであと${dd}日。${why}`; }
    }
    candidates.push({ id: r.id, kind: "task", title: r.title, why, link: `#/projects/${r.project_id}`, score });
  }
  // 緊急度の高い未返信メール
  for (const m of db.prepare("SELECT * FROM emails WHERE needs_reply = 1 AND status = 'open' AND urgency IN ('至急', '高')").all()) {
    const hours = Math.floor((Date.now() - new Date(m.received_at)) / 3600000);
    candidates.push({
      id: null, kind: "mail", title: `${m.from_name || m.from_address}「${m.subject}」への返信`,
      why: `緊急度「${m.urgency}」の${m.category}メール。受信から${hours}時間経過`,
      link: `#/mail/${m.id}`, score: (m.urgency === "至急" ? 70 : 55) + Math.min(hours, 24),
    });
  }
  // 契約待ちの商談は成約直前 → 高優先
  for (const d of db.prepare("SELECT * FROM deals WHERE stage = '契約待ち'").all()) {
    const days = daysBetween(d.last_activity_at.slice(0, 10), t);
    candidates.push({
      id: null, kind: "deal", title: `${d.client}「${d.title}」の契約手続き`,
      why: `契約待ち${days}日目・${Math.round(d.amount / 10000)}万円。長期化は失注リスク`,
      link: `#/deals/${d.id}`, score: 45 + Math.min(days * 2, 20) + Math.min(d.amount / 1000000, 10),
    });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 3).map(({ score, ...c }) => c); // 設計原則: 最大3件
}

/* ===== AIからの提案(データドリブンのルール群) ===== */
function suggestions() {
  const out = [];
  const k = kpis();
  const t = today();

  const hot = db.prepare("SELECT * FROM engineers WHERE active = 1 AND load >= 90").all();
  const free = db.prepare("SELECT * FROM engineers WHERE active = 1 AND load < 50").all();
  if (hot.length && free.length) {
    out.push({
      icon: "⚠️",
      text: `${hot.map((e) => e.name).join("・")}の稼働が90%超です。${free.map((e) => e.name).join("・")}のアサインを検討してください。`,
      reason: "稼働状況の偏りを検知",
    });
  }
  if (k.unpaidAmount > 0) {
    out.push({
      icon: "💰",
      text: `期日超過の未回収が${Math.round(k.unpaidAmount / 10000)}万円(${k.unpaidCount}件)あります。督促を優先してください。`,
      reason: "請求・入金データの差分",
    });
  }
  const quotes = db.prepare("SELECT * FROM deals WHERE stage = '見積提出' ORDER BY amount DESC LIMIT 1").get();
  if (quotes) {
    out.push({
      icon: "🎯",
      text: `見積提出中の最大案件は${quotes.client}「${quotes.title}」(${Math.round(quotes.amount / 10000)}万円・確度${quotes.probability}%)。フォローで受注確度を高めましょう。`,
      reason: "パイプライン金額の分析",
    });
  }
  const drafts = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(amount),0) AS v FROM invoices WHERE issued_at IS NULL").get();
  if (drafts.n > 0) {
    out.push({
      icon: "📄",
      text: `未発行の請求書が${drafts.n}件(${Math.round(drafts.v / 10000)}万円)あります。今週発行すれば来月の入金見込みが改善します。`,
      reason: "請求書ドラフトの滞留検知",
    });
  }
  // 営業アドバイス: 見積提出後のフォロー
  const s2 = getSettings();
  const quoteDays = Number(s2.quoteFollowDays) || 5;
  for (const d of db.prepare(`SELECT * FROM deals WHERE stage = '見積提出' AND datetime(last_activity_at) <= datetime('now', ?) LIMIT 2`).all(`-${quoteDays} days`)) {
    const days = Math.floor((Date.now() - new Date(d.last_activity_at)) / 86400000);
    out.push({
      icon: "📞",
      text: `${d.client}「${d.title}」は見積提出後${days}日経過しています。フォロー連絡を推奨します。返信が遅れると失注リスクが高まります。`,
      reason: "見積提出後の経過日数",
    });
  }
  // 営業アドバイス: 疎遠になっている顧客のフォロー
  const custList = customers();
  const follow = custList.filter((c) => c.follow_recommended).slice(0, 1);
  for (const c of follow) {
    out.push({
      icon: "🤝",
      text: `${c.client}は最終接触から${c.days_since_contact}日経過しています。フォローを推奨します。`,
      reason: "顧客リレーション分析",
    });
  }
  // 営業アドバイス: 返信速度が遅く失注リスク(進行中商談の顧客宛の未返信メールが滞留)
  const slowReplyHours = Number(s2.mailReplyHours) || 24;
  const slow = db.prepare(`
    SELECT e.from_name, e.from_address, e.subject, e.received_at, d.client, d.title
    FROM emails e
    JOIN deals d ON (e.from_name != '' AND instr(e.from_name, d.client) > 0) OR e.project_id IN (SELECT id FROM projects WHERE client = d.client)
    WHERE e.needs_reply = 1 AND e.status = 'open'
      AND d.stage IN ('商談中','見積提出','契約待ち')
      AND datetime(e.received_at) <= datetime('now', ?)
    ORDER BY e.received_at LIMIT 1`).get(`-${slowReplyHours} hours`);
  if (slow) {
    const hours = Math.floor((Date.now() - new Date(slow.received_at)) / 3600000);
    out.push({
      icon: "⏱️",
      text: `商談中の${slow.client}への返信が${hours}時間滞っています。返信速度が遅いと失注リスクが高まります。早めの対応を推奨します。`,
      reason: "進行中商談の返信滞留を検知",
    });
  }
  // 営業アドバイス: 追加提案(アップセル)の機会 — 保守中で開発案件がなく、直近クレームもない顧客
  const upsell = db.prepare(`
    SELECT DISTINCT p.client FROM projects p
    WHERE p.status = '保守'
      AND NOT EXISTS (SELECT 1 FROM projects p2 WHERE p2.client = p.client AND p2.status = '開発中')
      AND NOT EXISTS (SELECT 1 FROM emails e WHERE e.category = 'クレーム' AND e.status = 'open' AND (e.from_name != '' AND instr(e.from_name, p.client) > 0))
    LIMIT 1`).get();
  if (upsell) {
    const c = custList.find((x) => x.client === upsell.client);
    out.push({
      icon: "💡",
      text: `${upsell.client}は保守フェーズで関係が安定しています${c && c.sales ? `(累計入金 ${Math.round(c.sales / 10000)}万円)` : ""}。追加開発や新サービスの提案ができそうです。`,
      reason: "案件状況からアップセル機会を分析",
    });
  }
  return out.slice(0, 5);
}

/* ===== AI Inbox: 今日対応すべき件数のサマリー ===== */
function inbox() {
  const cnt = (u) => db.prepare("SELECT COUNT(*) AS n FROM emails WHERE needs_reply = 1 AND status = 'open' AND urgency = ?").get(u).n;
  const followCount = customers().filter((c) => c.follow_recommended).length
    + db.prepare(`SELECT COUNT(*) AS n FROM deals WHERE stage = '見積提出' AND datetime(last_activity_at) <= datetime('now', ?)`)
        .get(`-${Number(getSettings().quoteFollowDays) || 5} days`).n;
  return {
    urgent: cnt("至急"),
    today: cnt("高"),
    thisWeek: cnt("中"),
    follow: followCount,
  };
}

/* ===== AI Relationship Manager: 顧客ごとの接触状況・実績集計 ===== */
function customers() {
  const followDays = Number(getSettings().followDays) || 30;
  const names = db.prepare(`
    SELECT client FROM projects WHERE client != ''
    UNION SELECT client FROM deals WHERE client != ''`).all().map((r) => r.client);
  return names.map((client) => {
    const projects = db.prepare("SELECT id, name, status FROM projects WHERE client = ?").all(client);
    const pids = projects.map((p) => p.id);
    const dealAgg = db.prepare("SELECT COUNT(*) AS n, MAX(last_activity_at) AS last FROM deals WHERE client = ?").get(client);
    const wonCount = db.prepare("SELECT COUNT(*) AS n FROM deals WHERE client = ? AND won_at IS NOT NULL").get(client).n;
    const sales = pids.length
      ? db.prepare(`SELECT COALESCE(SUM(amount),0) AS v FROM invoices WHERE paid_at IS NOT NULL AND project_id IN (${pids.map(() => "?").join(",")})`).all(...pids)[0].v
      : 0;
    const lastMail = db.prepare(`
      SELECT MAX(received_at) AS last FROM emails
      WHERE (project_id IN (${pids.length ? pids.map(() => "?").join(",") : "NULL"}))
         OR (from_name != '' AND instr(?, from_name) > 0)`)
      .get(...pids, client)?.last || null;
    const lastEvent = pids.length
      ? db.prepare(`SELECT MAX(date) AS last FROM project_events WHERE project_id IN (${pids.map(() => "?").join(",")})`).all(...pids)[0].last
      : null;
    const contacts = [dealAgg.last, lastMail, lastEvent].filter(Boolean).map((d) => new Date(d).getTime());
    const lastContact = contacts.length ? new Date(Math.max(...contacts)) : null;
    const daysSince = lastContact ? Math.floor((Date.now() - lastContact) / 86400000) : null;
    const activeStatus = projects.find((p) => p.status !== "完了")?.status || (dealAgg.n ? "商談のみ" : "-");
    return {
      client,
      projectCount: projects.length,
      dealCount: dealAgg.n,
      wonCount,
      sales,
      lastDealAt: dealAgg.last ? dealAgg.last.slice(0, 10) : null,
      lastMailAt: lastMail ? lastMail.slice(0, 10) : null,
      lastContactAt: lastContact ? lastContact.toISOString().slice(0, 10) : null,
      days_since_contact: daysSince,
      status: activeStatus,
      follow_recommended: daysSince !== null && daysSince >= followDays,
    };
  }).sort((a, b) => (b.follow_recommended - a.follow_recommended) || (b.sales - a.sales));
}

/* AI用のビジネスコンテキスト要約(チャットのグラウンディングに使用) */
function businessContext() {
  const k = kpis();
  const risks = detectRisks();
  const tasks = todayTasks();
  const pipe = pipeline();
  const eng = db.prepare("SELECT name, current_project, load FROM engineers WHERE active = 1").all();
  const unreplied = db.prepare("SELECT COUNT(*) AS n FROM emails WHERE needs_reply = 1 AND status = 'open'").get().n;
  const man = (v) => Math.round(v / 10000) + "万円";
  return [
    `本日: ${today()}`,
    `今月KPI: 受注${man(k.orderAmount)} / 請求${man(k.invoicedAmount)} / 入金${man(k.paidAmount)} / 期日超過未回収${man(k.unpaidAmount)}(${k.unpaidCount}件)`,
    `商談: 進行中${k.dealCount}件(見積提出${k.quoteCount}・契約待ち${k.awaitingContract}) / 開発中案件${k.inDevelopment}件 / 稼働エンジニア${k.activeEngineers}名`,
    `パイプライン: ` + pipe.map((p) => `${p.stage}${p.count}件${p.amount}万円`).join(" / "),
    `今日の優先タスク: ` + (tasks.map((t) => `${t.title}(${t.why})`).join(" / ") || "なし"),
    `危険案件: ` + (risks.map((r) => `[${r.type}] ${r.text}`).join(" / ") || "なし"),
    `エンジニア稼働: ` + eng.map((e) => `${e.name}${e.load}%${e.current_project ? `(${e.current_project})` : ""}`).join(" / "),
    `未返信メール: ${unreplied}件`,
  ].join("\n");
}

module.exports = { kpis, monthlySales, pipeline, detectRisks, todayTasks, suggestions, inbox, customers, businessContext, ACTIVE_STAGES };
