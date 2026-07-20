'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

/* リポジトリ直下の .env を読み込む(既に設定済みの環境変数が優先される) */
try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch { /* .env が無ければ環境変数のみで動作 */ }

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'vtabridge.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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

CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

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

CREATE INDEX IF NOT EXISTS idx_tasks_project ON project_tasks(project_id, done);
`);

module.exports = { db };
