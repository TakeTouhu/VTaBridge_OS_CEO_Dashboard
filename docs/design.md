# VTaBridge OS — CEO Dashboard 全体設計書 v1.1

設計書 v1.0(プロトタイプ: ブランチ `claude/web-app-design-doc-zo2t20`)を正とし、main へ **フェーズ単位で段階移植** するための全体設計。各フェーズの詳細設計は `docs/phase-N-design.md` に分冊する。

## 1. アーキテクチャ

```
ブラウザ (Vanilla JS SPA / public/)
   │  fetch (JSON) + セッションCookie (sid)
   ▼
Express (server/server.js — createApp())
   ├─ セキュリティヘッダ / express.json(limit 256kb) / sessionMiddleware
   ├─ /api/health            認証不要
   ├─ /api/auth/*            認証系 (Phase 1)
   ├─ /api/*                 requireAuth 必須 (Phase 2〜)
   └─ express.static(public) SPA配信
   ▼
SQLite (better-sqlite3, WAL, foreign_keys=ON, DATA_DIR/vtabridge.db)
   ▼
外部連携: Claude API (Phase 4) / IMAP・SMTP (Phase 5) — すべてフォールバック付き
```

- **モジュール分割**(プロトタイプ踏襲): `db.js`(スキーマ・設定)/ `auth.js`(セッション認証)/ `api.js`(REST)/ `metrics.js`(KPI・危険検知・優先タスク計算)/ `ai.js`(Claude連携+ルールベースフォールバック)/ `mail.js`(IMAPポーリング)/ `seed.js`(サンプルデータ)
- **Phase 0 との差分**: `server.js` は `createApp()` エクスポートを維持し、`require.main === module` 時のみ listen(テスト容易性)。プロトタイプの直接 listen 方式より優先する
- ヘルスチェックは `/api/health` に統一(プロトタイプの `/healthz` は採用しない)

## 2. データモデルとフェーズ対応

| テーブル | 内容 | フェーズ |
|---|---|---|
| `users` / `sessions` | 管理者アカウント・セッション | **1** |
| `projects` / `project_tasks` / `project_events` | 案件・タスク・タイムライン | **2** |
| `deals` / `deal_activities` | 商談・活動履歴(受注→案件自動作成) | **2** |
| `engineers` | エンジニア稼働 | **3** |
| `settings` | 危険検知しきい値・自社情報ほか(key-value) | **3** |
| `documents` | 見積/契約/請求書(連番採番 `Q/C/INV-YYYY-NNNN`) | **5** |
| `invoices` | 請求書発行・入金消込 | **5** |
| `mail_accounts` / `emails` | メールアカウント・受信メール(AI分類) | **5** |

スキーマ定義はプロトタイプ `server/db.js` をそのまま採用(CHECK制約による日本語enum・`ON DELETE CASCADE/SET NULL`・インデックス含む)。マイグレーションは「`CREATE TABLE IF NOT EXISTS` + 既存テーブルの差分検出移行」方式を踏襲する。

## 3. API とフェーズ対応(全37エンドポイント)

| 群 | エンドポイント | フェーズ |
|---|---|---|
| ヘルス | `GET /api/health` | 0 ✅ |
| 認証 | `POST /api/auth/login` `POST /api/auth/logout` `GET /api/auth/me` `POST /api/auth/password` | **1** |
| 案件 | `GET/POST /api/projects` `GET/PATCH /api/projects/:id` `POST /api/projects/:id/tasks` `PATCH/DELETE /api/tasks/:id` | **2** |
| 商談 | `GET/POST /api/deals` `GET/PATCH /api/deals/:id` `POST /api/deals/:id/activities` | **2** |
| ホーム | `GET /api/dashboard`(今日やること最大3件・危険案件・KPI) | **2**(骨格)→ **3**(実データ計算) |
| 分析 | `GET /api/analytics` `GET/POST/PATCH /api/engineers` `GET/PATCH /api/settings` | **3** |
| AI | `POST /api/ai/extract`(議事録TODO)`POST /api/ai/chat`(AI秘書) | **4** |
| 書類 | `GET/POST /api/documents` | **5** |
| 請求 | `POST /api/projects/:id/invoices` `PATCH /api/invoices/:id` | **5** |
| メール | `GET /api/mail` `POST /api/mail/sync` `GET/PATCH /api/mail/:id` `POST /api/mail/:id/draft` `POST /api/mail/:id/reply` `POST/PATCH/DELETE /api/mail/accounts*` `POST /api/mail/accounts/test` | **5** |
| 顧客 | `GET /api/customers`(AI Relationship Manager) | **5** |

## 4. セキュリティ設計(全フェーズ共通)

- セッション: 32byte ランダムトークン、`HttpOnly; SameSite=Lax`、TTL 7日、リバースプロキシ配下(`X-Forwarded-Proto: https`)で `Secure` 付与。期限切れセッションは定期削除
- パスワード: bcrypt(cost 10)。ログイン試行はIPごと15分10回のレート制限
- `/api/*` は `/api/health` と `/api/auth/login` 以外すべて `requireAuth`
- SQL は全てプリペアドステートメント。`express.json` は 256kb 制限
- セキュリティヘッダ: `X-Content-Type-Options` / `X-Frame-Options: DENY` / `Referrer-Policy` / CSP(`default-src 'self'`)
- フロントは全出力エスケープ(innerHTML への未エスケープ挿入禁止)

## 5. フロントエンド設計

- 依存なし Vanilla JS SPA。`public/js/api.js`(fetchラッパ)/ `app.js`(ルーティング・画面)/ `charts.js`(売上グラフ)+ `css/style.css`
- 起動時に `GET /api/auth/me` → 401 ならログイン画面、200 ならホーム
- 画面: ログイン(P1)→ ホーム・案件・商談(P2)→ 売上分析・設定(P3)→ AI議事録・AI秘書(P4)→ 書類・メール・顧客(P5)

## 6. テスト方針

- `npm test` = `server/smoke-test.js`。フェーズごとにケースを追加し、常に外部サービス非依存(Claude API・IMAP はフォールバック/モックで検証)
- テストは一時 `DATA_DIR` を使い、実データを汚さない。`createApp()` をポート0で起動して fetch で検証
- 各フェーズの受け入れ基準は各フェーズ設計書に記載

## 7. フェーズ移植計画

| フェーズ | 内容 | 主な移植元 | 状態 |
|---|---|---|---|
| 0 | 基盤(サーバー・ヘルスチェック・スモークテスト) | — | ✅ 完了 |
| 1 | DBスキーマ(users/sessions)+ セッション認証 + ログイン画面 | `db.js` `auth.js` | 設計済 → `phase-1-design.md` |
| 2 | 案件・商談 CRUD + ホーム画面(今日やること最大3件) | `api.js` `app.js` | 未着手 |
| 3 | KPI・危険検知・売上分析 + 設定・エンジニア | `metrics.js` `charts.js` | 未着手 |
| 4 | AI連携(AI秘書・議事録TODO抽出、フォールバック付き) | `ai.js` | 未着手 |
| 5 | 書類作成・請求/入金・メール監視・顧客 | `mail.js` ほか | 未着手 |
