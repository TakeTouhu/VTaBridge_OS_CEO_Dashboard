"use strict";
/* APIスモークテスト: サーバーを一時DBで起動し、主要フローを検証する。
   実行: npm test */
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vtab-test-"));

const server = spawn(process.execPath, [path.join(__dirname, "server.js")], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_EMAIL: "test@example.com", ADMIN_PASSWORD: "test-password-1", ANTHROPIC_API_KEY: "" },
  stdio: "ignore",
});

let cookie = "";
async function api(method, p, body) {
  const res = await fetch(BASE + p, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

let failures = 0;
function check(name, cond, extra) {
  console.log(`${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
}

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(BASE + "/healthz");
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("server did not start");
}

(async () => {
  await waitForServer();

  // 未認証は401
  let r = await api("GET", "/api/dashboard");
  check("未認証アクセスは401", r.status === 401);

  // ログイン
  r = await api("POST", "/api/auth/login", { email: "wrong@example.com", password: "x" });
  check("誤認証は401", r.status === 401);
  r = await api("POST", "/api/auth/login", { email: "test@example.com", password: "test-password-1" });
  check("ログイン成功", r.status === 200 && r.data.user.email === "test@example.com");

  // ダッシュボード(空データでも壊れない)
  r = await api("GET", "/api/dashboard");
  check("ダッシュボード取得", r.status === 200 && Array.isArray(r.data.monthlySales) && r.data.monthlySales.length === 6);

  // 案件CRUD
  r = await api("POST", "/api/projects", { name: "テスト案件", client: "テスト社", amount: 1000000, status: "開発中" });
  check("案件作成", r.status === 201);
  const pid = r.data.project.id;
  r = await api("PATCH", `/api/projects/${pid}`, { progress: 50 });
  check("案件更新", r.status === 200 && r.data.project.progress === 50);
  r = await api("POST", `/api/projects/${pid}/tasks`, { title: "テストタスク", due: "2099-01-01" });
  check("タスク追加", r.status === 201);
  r = await api("GET", `/api/projects/${pid}`);
  const taskId = r.data.project.tasks[0].id;
  r = await api("PATCH", `/api/tasks/${taskId}`, { done: true });
  check("タスク完了", r.status === 200);

  // 請求書: 発行 → 入金 → KPI反映
  r = await api("POST", `/api/projects/${pid}/invoices`, { amount: 300000, issue: true });
  check("請求書発行", r.status === 201 && r.data.invoice.issued_at);
  const invId = r.data.invoice.id;
  r = await api("PATCH", `/api/invoices/${invId}`, { action: "paid" });
  check("入金消込", r.status === 200 && r.data.invoice.paid_at);
  r = await api("GET", "/api/dashboard");
  check("KPIに請求・入金が反映", r.data.kpi.invoicedAmount === 300000 && r.data.kpi.paidAmount === 300000);

  // 商談: 作成 → 受注 → 案件自動作成
  r = await api("POST", "/api/deals", { client: "新規商事", title: "新規開発", amount: 2000000, stage: "商談中" });
  check("商談作成", r.status === 201);
  const dealId = r.data.deal.id;
  r = await api("PATCH", `/api/deals/${dealId}`, { stage: "受注" });
  check("受注→案件自動作成", r.status === 200 && r.data.createdProjectId);
  r = await api("GET", "/api/dashboard");
  check("受注額KPIに反映", r.data.kpi.orderAmount === 2000000);

  // AI議事録抽出(キーなし → ルールベースフォールバック)
  r = await api("POST", "/api/ai/extract", { text: "・見積書を7/20までに提出する\n・単なる情報共有" });
  check("議事録抽出(フォールバック)", r.status === 200 && r.data.source === "rules" && r.data.todos.length >= 1);

  // AI秘書(フォールバック)
  r = await api("POST", "/api/ai/chat", { question: "今月の売上は?" });
  check("AI秘書応答(フォールバック)", r.status === 200 && typeof r.data.reply === "string" && r.data.reply.length > 0);

  // 書類作成
  r = await api("POST", "/api/documents", { type: "quote", deal_id: dealId });
  check("見積書番号採番", r.status === 201 && /^Q-\d{4}-\d{4}$/.test(r.data.number));

  // 設定
  r = await api("PATCH", "/api/settings", { unpaidDays: "3" });
  check("設定変更", r.status === 200 && r.data.settings.unpaidDays === "3");
  r = await api("PATCH", "/api/settings", { evil: "1" });
  check("不明な設定キーは400", r.status === 400);

  // メール機能
  r = await api("GET", "/api/mail");
  check("メール一覧取得(空)", r.status === 200 && Array.isArray(r.data.emails) && r.data.unrepliedCount === 0);
  r = await api("POST", "/api/mail/sync");
  check("アカウント未登録の同期は400", r.status === 400);
  r = await api("POST", "/api/mail/accounts", { provider: "gmail", username: "test@example.com", password: "app-pass" });
  check("メールアカウント作成(プリセット適用)", r.status === 201 && r.data.account.imap_host === "imap.gmail.com" && r.data.account.password === undefined);
  const accId = r.data.account.id;
  r = await api("PATCH", `/api/mail/accounts/${accId}`, { active: false });
  check("アカウント停止", r.status === 200 && r.data.account.active === 0);
  r = await api("POST", "/api/mail/999/draft");
  check("存在しないメールのドラフトは404", r.status === 404);
  r = await api("DELETE", `/api/mail/accounts/${accId}`);
  check("アカウント削除", r.status === 200);
  r = await api("GET", "/api/customers");
  check("顧客リレーション取得", r.status === 200 && Array.isArray(r.data.customers));
  r = await api("GET", "/api/dashboard");
  check("AI Inboxカウント", r.data.inbox && typeof r.data.inbox.urgent === "number");

  // パスワード変更 → 旧パスワードは無効
  r = await api("POST", "/api/auth/password", { current: "test-password-1", next: "new-password-99" });
  check("パスワード変更", r.status === 200);
  cookie = "";
  r = await api("POST", "/api/auth/login", { email: "test@example.com", password: "test-password-1" });
  check("旧パスワードは無効", r.status === 401);
  r = await api("POST", "/api/auth/login", { email: "test@example.com", password: "new-password-99" });
  check("新パスワードで再ログイン", r.status === 200);

  console.log(failures === 0 ? "\nすべてのテストに合格しました 🎉" : `\n${failures}件のテストが失敗しました`);
  server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error("smoke-test error:", e);
  server.kill();
  process.exit(1);
});
