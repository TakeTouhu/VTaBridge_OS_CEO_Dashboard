'use strict';

/* fetch ラッパ: JSON送受信・エラー整形。セッションCookieは同一オリジンで自動送信 */
async function api(path, options = {}) {
  const init = { method: options.method || (options.body ? 'POST' : 'GET') };
  if (options.body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(options.body);
  }
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}
