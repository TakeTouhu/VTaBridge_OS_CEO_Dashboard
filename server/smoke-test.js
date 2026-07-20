'use strict';

const assert = require('node:assert');
const { createApp } = require('./server');

async function main() {
  const server = createApp().listen(0);
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    const health = await fetch(`${base}/api/health`);
    assert.strictEqual(health.status, 200, 'GET /api/health should return 200');
    const body = await health.json();
    assert.strictEqual(body.ok, true, 'health response should have ok: true');
    assert.ok(body.version, 'health response should include version');

    const index = await fetch(`${base}/`);
    assert.strictEqual(index.status, 200, 'GET / should serve the placeholder page');
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
