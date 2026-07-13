"use strict";
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { db } = require("./db");

const SESSION_TTL_DAYS = 7;

/* 初回起動時の管理者作成。パスワードは環境変数、無ければ生成してコンソールに一度だけ表示 */
function ensureAdmin() {
  const count = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  if (count > 0) return;
  const email = process.env.ADMIN_EMAIL || "admin@example.com";
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString("base64url");
  const name = process.env.ADMIN_NAME || "社長";
  db.prepare("INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)")
    .run(email, name, bcrypt.hashSync(password, 10));
  console.log("========================================");
  console.log("初期管理者アカウントを作成しました:");
  console.log(`  email:    ${email}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log(`  password: ${password}`);
    console.log("  (自動生成。ログイン後の変更を推奨。ADMIN_PASSWORD 環境変数でも指定可能)");
  } else {
    console.log("  password: (ADMIN_PASSWORD 環境変数の値)");
  }
  console.log("========================================");
}

/* 単純なログイン試行レート制限(IPごと・15分で10回) */
const attempts = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const rec = attempts.get(ip) || { count: 0, resetAt: now + 15 * 60 * 1000 };
  if (now > rec.resetAt) { rec.count = 0; rec.resetAt = now + 15 * 60 * 1000; }
  rec.count++;
  attempts.set(ip, rec);
  return rec.count > 10;
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 86400000).toISOString();
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, userId, expires);
  return token;
}

function getSessionUser(token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.email, u.name, u.role FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token);
  return row || null;
}

function destroySession(token) {
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

function cleanupSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookieOpts(req) {
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  return `HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_DAYS * 86400}${secure ? "; Secure" : ""}`;
}

/* Expressミドルウェア: req.user を設定 */
function sessionMiddleware(req, _res, next) {
  req.user = getSessionUser(parseCookies(req).sid);
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "認証が必要です" });
  next();
}

function registerAuthRoutes(app) {
  app.post("/api/auth/login", (req, res) => {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress;
    if (rateLimited(ip)) return res.status(429).json({ error: "試行回数が上限に達しました。15分後にお試しください" });
    const { email, password } = req.body || {};
    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "メールアドレスとパスワードを入力してください" });
    }
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: "メールアドレスまたはパスワードが正しくありません" });
    }
    const token = createSession(user.id);
    res.setHeader("Set-Cookie", `sid=${token}; ${cookieOpts(req)}`);
    res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  });

  app.post("/api/auth/logout", (req, res) => {
    destroySession(parseCookies(req).sid);
    res.setHeader("Set-Cookie", "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
    res.json({ ok: true });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.user) return res.status(401).json({ error: "未ログイン" });
    res.json({ user: req.user });
  });

  app.post("/api/auth/password", requireAuth, (req, res) => {
    const { current, next: nextPw } = req.body || {};
    if (typeof nextPw !== "string" || nextPw.length < 8) {
      return res.status(400).json({ error: "新しいパスワードは8文字以上にしてください" });
    }
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    if (!bcrypt.compareSync(String(current || ""), user.password_hash)) {
      return res.status(401).json({ error: "現在のパスワードが正しくありません" });
    }
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(bcrypt.hashSync(nextPw, 10), user.id);
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND token != ?").run(user.id, parseCookies(req).sid || "");
    res.json({ ok: true });
  });
}

module.exports = { ensureAdmin, sessionMiddleware, requireAuth, registerAuthRoutes, cleanupSessions };
