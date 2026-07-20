'use strict';

/* 一時 DATA_DIR を db.js の require 前に設定し、実データを汚さない */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vtabridge-test-'));
process.env.ADMIN_EMAIL = 'test@example.com';
process.env.ADMIN_PASSWORD = 'test-password-123';

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

    /* 6. ログアウト後の me は 401 */
    const logout = await fetch(`${base}/api/auth/logout`, {
      method: 'POST',
      headers: { cookie: `sid=${sid}` },
    });
    assert.strictEqual(logout.status, 200, 'logout should return 200');
    const afterLogout = await fetch(`${base}/api/auth/me`, { headers: { cookie: `sid=${sid}` } });
    assert.strictEqual(afterLogout.status, 401, 'me after logout should return 401');

    /* 7. 静的配信 */
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
