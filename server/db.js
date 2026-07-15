"use strict";
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

/* リポジトリ直下の .env を読み込む(既に設定済みの環境変数が優先される) */
try { process.loadEnvFile(path.join(__dirname, "..", ".env")); } catch { /* .env が無ければ環境変数のみで動作 */ }

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "vtabridge.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'ceo',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS engineers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  current_project TEXT DEFAULT '',
  load INTEGER NOT NULL DEFAULT 0 CHECK (load BETWEEN 0 AND 100),
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  client TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '開発中' CHECK (status IN ('開発中','契約待ち','保守','完了')),
  amount INTEGER NOT NULL DEFAULT 0,
  deadline TEXT DEFAULT NULL,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  pm TEXT DEFAULT '',
  engineers TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due TEXT DEFAULT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','minutes','ai')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date TEXT NOT NULL DEFAULT (date('now')),
  text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client TEXT NOT NULL,
  title TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'リード' CHECK (stage IN ('リード','商談中','見積提出','契約待ち','受注','失注')),
  amount INTEGER NOT NULL DEFAULT 0,
  probability INTEGER NOT NULL DEFAULT 20 CHECK (probability BETWEEN 0 AND 100),
  owner TEXT DEFAULT '',
  contact TEXT DEFAULT '',
  next_action TEXT DEFAULT '',
  minutes_note TEXT DEFAULT '',
  last_activity_at TEXT NOT NULL DEFAULT (datetime('now')),
  won_at TEXT DEFAULT NULL,
  project_id INTEGER DEFAULT NULL REFERENCES projects(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deal_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  date TEXT NOT NULL DEFAULT (date('now')),
  text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  number TEXT NOT NULL UNIQUE,
  amount INTEGER NOT NULL,
  issued_at TEXT DEFAULT NULL,   -- NULL = 未発行(未請求)ドラフト
  due_date TEXT DEFAULT NULL,
  paid_at TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER DEFAULT NULL REFERENCES deals(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('quote','contract','invoice')),
  number TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL, -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mail_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'gmail' CHECK (provider IN ('gmail','outlook','custom')),
  imap_host TEXT NOT NULL,
  imap_port INTEGER NOT NULL DEFAULT 993,
  smtp_host TEXT NOT NULL,
  smtp_port INTEGER NOT NULL DEFAULT 465,
  smtp_secure INTEGER NOT NULL DEFAULT 1,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  last_uid INTEGER NOT NULL DEFAULT 0,
  last_sync_at TEXT,
  last_error TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER REFERENCES mail_accounts(id) ON DELETE CASCADE,
  uid INTEGER,
  message_id TEXT DEFAULT '',
  from_address TEXT NOT NULL DEFAULT '',
  from_name TEXT DEFAULT '',
  subject TEXT DEFAULT '',
  body TEXT DEFAULT '',
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  category TEXT NOT NULL DEFAULT '未分類',
  urgency TEXT NOT NULL DEFAULT '中' CHECK (urgency IN ('高','中','低')),
  summary TEXT DEFAULT '',
  needs_reply INTEGER NOT NULL DEFAULT 0,
  classified_by TEXT DEFAULT '',
  draft TEXT DEFAULT '',
  replied_at TEXT,
  reply_text TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','replied','dismissed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(account_id, uid)
);
CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status, needs_reply, received_at);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON project_tasks(project_id, done);
CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
`);

const DEFAULT_SETTINGS = {
  notify: "1",
  riskDetect: "1",
  crmSync: "1",
  autoInput: "1",
  unpaidDays: "7",
  noReplyDays: "3",
  mailPollMinutes: "5",
  mailReplyHours: "24",
  mailSignature: "",
  companyName: "株式会社VTaBridge",
  companyAddress: "東京都○○区○○ 1-2-3",
  bankInfo: "○○銀行 ○○支店 普通 1234567",
};
const insSetting = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insSetting.run(k, v);

function getSettings() {
  const out = {};
  for (const r of db.prepare("SELECT key, value FROM settings").all()) out[r.key] = r.value;
  return out;
}

function setSetting(key, value) {
  if (!(key in DEFAULT_SETTINGS)) throw new Error("unknown setting: " + key);
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, String(value));
}

/* 連番の書類番号(例: INV-2026-0001) */
function nextDocNumber(type) {
  const prefix = { quote: "Q", contract: "C", invoice: "INV" }[type];
  const year = new Date().getFullYear();
  const row = db.prepare(
    "SELECT COUNT(*) AS n FROM documents WHERE type = ? AND number LIKE ?"
  ).get(type, `${prefix}-${year}-%`);
  return `${prefix}-${year}-${String(row.n + 1).padStart(4, "0")}`;
}

module.exports = { db, getSettings, setSetting, nextDocNumber, DATA_DIR };
