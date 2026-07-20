'use strict';

/* 一時 DATA_DIR を db.js の require 前に設定し、実データを汚さない */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vtabridge-test-'));
process.env.ADMIN_EMAIL = 'test@example.com';
process.env.ADMIN_PASSWORD = 'test-password-123';
delete process.env.ANTHROPIC_API_KEY; // AI機能はフォールバック経路で検証(外部サービス非依存)

const assert = require('node:assert');
const { createApp } = require('./server');
const { ensureAdmin } = require('./auth');

async function main() {
  ensureAdmin();
  const server = createApp().listen(0);
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    /* 1. ヘルスチェック */
    const health = await fetch(`${base}/api/health`);
    assert.strictEqual(health.status, 200, 'GET /api/health should return 200');
    const healthBody = await health.json();
    assert.strictEqual(healthBody.ok, true, 'health response should have ok: true');
    assert.ok(healthBody.version, 'health response should include version');

    /* 2. 未ログインの me は 401 */
    const anon = await fetch(`${base}/api/auth/me`);
    assert.strictEqual(anon.status, 401, 'GET /api/auth/me without session should return 401');

    /* 3. 誤パスワードは 401 */
    const bad = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'wrong-password' }),
    });
    assert.strictEqual(bad.status, 401, 'login with wrong password should return 401');

    /* 4. 正しいログインで Set-Cookie: sid */
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'test-password-123' }),
    });
    assert.strictEqual(login.status, 200, 'login with correct credentials should return 200');
    const setCookie = login.headers.get('set-cookie') || '';
    const sid = /sid=([^;]+)/.exec(setCookie)?.[1];
    assert.ok(sid, 'login response should set sid cookie');
    assert.ok(setCookie.includes('HttpOnly'), 'sid cookie should be HttpOnly');

    /* 5. Cookie付き me は 200 */
    const me = await fetch(`${base}/api/auth/me`, { headers: { cookie: `sid=${sid}` } });
    assert.strictEqual(me.status, 200, 'GET /api/auth/me with session should return 200');
    const meBody = await me.json();
    assert.strictEqual(meBody.user.email, 'test@example.com', 'me should return the logged-in user');

    const authed = (path, options = {}) => fetch(`${base}${path}`, {
      method: options.method || (options.body ? 'POST' : 'GET'),
      headers: { cookie: `sid=${sid}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    /* 6. 認証ガード: 未ログインの業務APIは 401 */
    const guard = await fetch(`${base}/api/projects`);
    assert.strictEqual(guard.status, 401, 'GET /api/projects without session should return 401');

    /* 7. 案件 CRUD */
    const created = await authed('/api/projects', { body: { name: 'テスト案件', client: 'テスト商事', amount: 3000000, deadline: '2026-12-31' } });
    assert.strictEqual(created.status, 201, 'POST /api/projects should return 201');
    const projectId = (await created.json()).project.id;

    const list = await authed('/api/projects');
    assert.strictEqual((await list.json()).projects.length, 1, 'project list should contain the created project');

    const patched = await authed(`/api/projects/${projectId}`, { method: 'PATCH', body: { status: '開発中', progress: 30 } });
    assert.strictEqual(patched.status, 200, 'PATCH /api/projects/:id should return 200');
    const patchedBody = await patched.json();
    assert.strictEqual(patchedBody.project.status, '開発中', 'project status should be updated');
    assert.ok(patchedBody.project.events.some((ev) => ev.text.includes('開発中')), 'status change should be recorded in timeline');

    /* 8. タスクと今日やること(最大3件・理由付き) */
    const overdue = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    for (let i = 1; i <= 4; i++) {
      const t = await authed(`/api/projects/${projectId}/tasks`, { body: { title: `タスク${i}`, due: i === 1 ? overdue : '' } });
      assert.strictEqual(t.status, 201, 'POST tasks should return 201');
    }
    const dash = await authed('/api/dashboard');
    assert.strictEqual(dash.status, 200, 'GET /api/dashboard should return 200');
    const dashBody = await dash.json();
    assert.ok(dashBody.todayTasks.length <= 3, 'todayTasks must be capped at 3');
    assert.strictEqual(dashBody.todayTasks[0].title, 'タスク1', 'overdue task should rank first');
    assert.ok(dashBody.todayTasks[0].why.includes('超過'), 'todayTasks should explain why');

    /* 9. タスク完了切替 */
    const projDetail = await (await authed(`/api/projects/${projectId}`)).json();
    const firstTask = projDetail.project.tasks[0];
    const done = await authed(`/api/tasks/${firstTask.id}`, { method: 'PATCH', body: { done: true } });
    assert.strictEqual(done.status, 200, 'PATCH /api/tasks/:id should return 200');

    /* 10. 商談 → 受注で案件を自動作成 */
    const dealRes = await authed('/api/deals', { body: { client: '新規顧客', title: '新システム開発', amount: 5000000 } });
    assert.strictEqual(dealRes.status, 201, 'POST /api/deals should return 201');
    const dealId = (await dealRes.json()).deal.id;

    const won = await authed(`/api/deals/${dealId}`, { method: 'PATCH', body: { stage: '受注' } });
    assert.strictEqual(won.status, 200, 'PATCH deal to 受注 should return 200');
    const wonBody = await won.json();
    assert.ok(wonBody.createdProjectId, '受注 should auto-create a project');
    const autoProject = await authed(`/api/projects/${wonBody.createdProjectId}`);
    assert.strictEqual(autoProject.status, 200, 'auto-created project should exist');
    const autoBody = await autoProject.json();
    assert.strictEqual(autoBody.project.name, '新システム開発', 'auto-created project should inherit deal title');
    assert.strictEqual(autoBody.project.status, '契約待ち', 'auto-created project should start as 契約待ち');

    /* 11. 商談活動記録とパイプライン */
    const act = await authed(`/api/deals/${dealId}/activities`, { body: { text: '契約書を送付' } });
    assert.strictEqual(act.status, 201, 'POST deal activity should return 201');
    const dealsList = await (await authed('/api/deals')).json();
    const wonStage = dealsList.pipeline.find((s) => s.stage === '受注');
    assert.strictEqual(wonStage.count, 1, 'pipeline should count the won deal');

    /* 12. 設定: 既定値の取得・更新・未知キーの拒否 */
    const settings = await (await authed('/api/settings')).json();
    assert.strictEqual(settings.settings.unpaidDays, '7', 'settings should have defaults');
    const setRes = await authed('/api/settings', { method: 'PATCH', body: { unpaidDays: '10' } });
    assert.strictEqual(setRes.status, 200, 'PATCH /api/settings should return 200');
    assert.strictEqual((await setRes.json()).settings.unpaidDays, '10', 'setting should be updated');
    const badKey = await authed('/api/settings', { method: 'PATCH', body: { evil: 'x' } });
    assert.strictEqual(badKey.status, 400, 'unknown setting key should return 400');

    /* 13. エンジニア CRUD とダッシュボード反映 */
    const engRes = await authed('/api/engineers', { body: { name: '山田', load: 95 } });
    assert.strictEqual(engRes.status, 201, 'POST /api/engineers should return 201');
    const engId = (await engRes.json()).engineer.id;
    const engPatch = await authed(`/api/engineers/${engId}`, { method: 'PATCH', body: { load: 80 } });
    assert.strictEqual((await engPatch.json()).engineer.load, 80, 'engineer load should be updated');

    /* 14. KPI・危険検知・提案 */
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    await authed(`/api/projects/${projectId}`, { method: 'PATCH', body: { deadline: yesterday, progress: 50 } });
    const dash2 = await (await authed('/api/dashboard')).json();
    assert.ok(dash2.kpi, 'dashboard should include kpi');
    assert.strictEqual(dash2.kpi.orderAmount, 5000000, '受注済み商談が今月の受注額に計上される');
    assert.strictEqual(dash2.kpi.inDevelopment, 1, '開発中案件数が KPI に反映される');
    assert.ok(dash2.risks.some((r) => r.type === '納期遅延'), '期限超過の開発中案件が納期遅延として検知される');
    assert.ok(Array.isArray(dash2.suggestions), 'dashboard should include suggestions');
    assert.strictEqual(dash2.engineers[0].load, 80, 'dashboard should include active engineers');
    assert.strictEqual(dash2.monthlySales.length, 6, 'dashboard should include 6 months of sales');
    assert.strictEqual(dash2.monthlySales.at(-1).order, 500, '当月の受注が月次売上に計上される(万円)');

    /* 15. 危険検知はしきい値・ON/OFF 設定に従う */
    await authed('/api/settings', { method: 'PATCH', body: { riskDetect: '0' } });
    const dashOff = await (await authed('/api/dashboard')).json();
    assert.strictEqual(dashOff.risks.length, 0, 'riskDetect=0 で危険検知が止まる');
    await authed('/api/settings', { method: 'PATCH', body: { riskDetect: '1' } });

    /* 16. analytics の期間指定 */
    const ana = await (await authed('/api/analytics?months=3')).json();
    assert.strictEqual(ana.monthlySales.length, 3, 'analytics should honor months param');

    /* 17. AI議事録TODO抽出(ルールベースフォールバック) */
    const minutes = '【定例会議】\n・要件定義書を7/25までに送付する\n・デザイン案は決定済み\n・見積書を作成する(来週)';
    const extract = await authed('/api/ai/extract', { body: { text: minutes } });
    assert.strictEqual(extract.status, 200, 'POST /api/ai/extract should return 200');
    const extractBody = await extract.json();
    assert.strictEqual(extractBody.source, 'rules', 'without API key extraction should fall back to rules');
    const titles = extractBody.todos.map((t) => t.title);
    assert.ok(titles.some((t) => t.includes('要件定義書')), 'action item should be extracted');
    assert.ok(!titles.some((t) => t.includes('決定済み')), 'non-action line should be excluded');
    const withDue = extractBody.todos.find((t) => t.title.includes('要件定義書'));
    assert.match(withDue.due, /^\d{4}-07-25$/, 'relative due date should be normalized to YYYY-MM-DD');

    /* 18. 抽出結果を案件へ一括登録(source=minutes) */
    const bulk = await authed(`/api/projects/${projectId}/tasks`, { body: { tasks: extractBody.todos, source: 'minutes' } });
    assert.strictEqual(bulk.status, 201, 'bulk task registration should return 201');
    const afterBulk = await (await authed(`/api/projects/${projectId}`)).json();
    assert.ok(afterBulk.project.events.some((ev) => ev.text.includes('AI議事録')), 'minutes registration should be recorded in timeline');

    /* 19. AI秘書チャット(ルールベースフォールバック・経営データに基づく回答) */
    const chatRes = await authed('/api/ai/chat', { body: { question: '今日やることは?' } });
    assert.strictEqual(chatRes.status, 200, 'POST /api/ai/chat should return 200');
    const chatBody = await chatRes.json();
    assert.strictEqual(chatBody.source, 'rules', 'without API key chat should fall back to rules');
    assert.ok(chatBody.reply.includes('今日の優先タスク'), 'chat should answer from business context');

    /* 20. ダッシュボードの AI 状態 */
    const dashAi = await (await authed('/api/dashboard')).json();
    assert.strictEqual(dashAi.ai.enabled, false, 'dashboard should report AI disabled without key');

    /* 21. ログアウト後の me は 401 */
    const logout = await fetch(`${base}/api/auth/logout`, {
      method: 'POST',
      headers: { cookie: `sid=${sid}` },
    });
    assert.strictEqual(logout.status, 200, 'logout should return 200');
    const afterLogout = await fetch(`${base}/api/auth/me`, { headers: { cookie: `sid=${sid}` } });
    assert.strictEqual(afterLogout.status, 401, 'me after logout should return 401');

    /* 22. 静的配信 */
    const index = await fetch(`${base}/`);
    assert.strictEqual(index.status, 200, 'GET / should serve the SPA page');
    const html = await index.text();
    assert.ok(html.includes('VTaBridge'), 'index page should mention VTaBridge');

    console.log('smoke-test: all checks passed');
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error('smoke-test: FAILED');
  console.error(err);
  process.exit(1);
});
