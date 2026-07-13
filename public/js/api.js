/* APIクライアント: fetchラッパー + 認証状態管理 */
"use strict";

const Api = (() => {
  let onUnauthorized = null;

  async function request(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
    if (res.status === 401 && !path.startsWith("/api/auth/")) {
      if (onUnauthorized) onUnauthorized();
      throw new ApiError(401, "認証が必要です");
    }
    let data = null;
    try { data = await res.json(); } catch { /* 空レスポンス */ }
    if (!res.ok) throw new ApiError(res.status, data?.error || `エラーが発生しました (${res.status})`);
    return data;
  }

  class ApiError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }

  return {
    get: (p) => request("GET", p),
    post: (p, b) => request("POST", p, b ?? {}),
    patch: (p, b) => request("PATCH", p, b ?? {}),
    del: (p) => request("DELETE", p),
    setUnauthorizedHandler: (fn) => { onUnauthorized = fn; },
    ApiError,
  };
})();

/* ===== 表示ユーティリティ ===== */
function yen(v) { return "¥" + Number(v || 0).toLocaleString("ja-JP"); }
function man(v) { return Number(v || 0).toLocaleString("ja-JP") + "万円"; }
function yenToMan(v) { return man(Math.round(Number(v || 0) / 10000)); }
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
function toast(message, isError = false) {
  const t = document.createElement("div");
  t.className = "toast" + (isError ? " toast-error" : "");
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 3200);
}
