# Phase 1: DBスキーマ + セッション認証 + ログイン画面

## 目的
アプリの土台となるデータベース、ログイン認証、ログイン画面を用意する。

## DBスキーマ(`server/db.js`)
SQLite(better-sqlite3・WALモード・外部キー有効)。主なテーブル:

- `users` … 管理者アカウント(email・name・bcryptハッシュ・role)
- `sessions` … セッショントークン(有効期限付き)
- `settings` … アプリ設定(key-value。危険検知しきい値・自社情報・メール設定など)
- 以降のPhaseで `projects` / `project_tasks` / `project_events` / `deals` / `deal_activities` / `invoices` / `documents` / `engineers` / `mail_accounts` / `emails` を追加

起動時に既存DBを検知して自動マイグレーションする仕組みを持つ(例: emailsテーブルの緊急度4段階化)。

## 認証(`server/auth.js`)
- セッションCookie(HttpOnly / SameSite=Lax / HTTPS時はSecure)
- パスワードは bcrypt でハッシュ化
- ログイン試行のレート制限(IPごと・15分で10回)
- 初回起動時に管理者を自動作成。`ADMIN_EMAIL` / `ADMIN_PASSWORD` が両方設定されていれば起動のたびに同期(パスワード忘れ対策)
- パスワード変更API(現行パスワード確認+他セッション失効)

## ログイン画面(`public/`)
- 未認証時はログイン画面、認証済みはアプリ本体を表示する出し分け
- ログイン/ログアウト、誤入力時のエラー表示
- `.env` を `process.loadEnvFile` で自動読み込み

## 完了条件
- 正しい資格情報でログインでき、セッションが維持される
- 全APIが認証必須で、未認証は401
- スモークテスト: 未認証401・誤認証401・ログイン成功・パスワード変更・旧パスワード無効化
