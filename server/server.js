"use strict";
const path = require("path");
const express = require("express");
const { ensureAdmin, sessionMiddleware, registerAuthRoutes, cleanupSessions } = require("./auth");
const { registerApiRoutes } = require("./api");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);

/* セキュリティヘッダ */
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'");
  next();
});

app.use(express.json({ limit: "256kb" }));
app.use(sessionMiddleware);

app.get("/healthz", (req, res) => res.json({ ok: true }));

registerAuthRoutes(app);
registerApiRoutes(app);

/* 静的ファイル(フロントエンド) */
app.use(express.static(path.join(__dirname, "..", "public"), { index: "index.html" }));

/* エラーハンドラ */
app.use((err, req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.status ? err.message : "サーバーエラーが発生しました" });
});

ensureAdmin();
cleanupSessions();
setInterval(cleanupSessions, 6 * 3600 * 1000).unref();

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`VTaBridge OS - CEO Dashboard: http://localhost:${PORT}`);
});
