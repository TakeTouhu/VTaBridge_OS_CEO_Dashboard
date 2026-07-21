# Phase 1 詳細設計 — DBスキーマ + セッション認証 + ログイン画面

全体設計は `docs/design.md` を参照。本フェーズはプロトタイプの `server/db.js` / `server/auth.js` を最小構成で移植し、「ログインできる空のダッシュボード」を成立させる。

## 1. スコープ

**含む**: SQLite 初期化(`users` / `sessions` のみ)、管理者アカウントの自動作成・env同期、セッション認証、認証API 4本、`requireAuth` ミドルウェア、ログイン画面、認証込みスモークテスト

**含まない**(後続フェーズ): 案件・商談等の業務テーブル、`settings` テーブル、AI・メール連携、パスワード変更 **画面**(APIのみ先行実装。UIは Phase 3 の設定画面)

## 2. 依存関係の追加

```
better-sqlite3   SQLite ドライバ(同期API・プリペアドステートメント)
bcryptjs         パスワードハッシュ(ネイティブビルド不要)
```

## 3. DB(server/db.js)

- `DATA_DIR`(既定 `./data`)を `mkdirSync(recursive)` で作成し `vtabridge.db` を開く。`journal_mode=WAL` / `foreign_keys=ON`
- リポジトリ直下の `.env` を `process.loadEnvFile()` で読み込む(存在しなければ無視。既存の環境変数が優先)
- Phase 1 のスキーマ(プロトタイプと同一定義):

```sql
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
```

- エクスポート: `{ db }`。テストから差し替えられるよう `DATA_DIR` は読み込み時に環境変数から解決する

## 4. 認証(server/auth.js — プロトタイプをそのまま移植)

### 管理者アカウント(`ensureAdmin()`)

- ユーザー0件時: `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME`(既定「社長」)で作成。パスワード未指定なら `crypto.randomBytes(9).toString("base64url")` で自動生成しコンソール表示
- 2回目以降: `ADMIN_EMAIL` と `ADMIN_PASSWORD` が両方設定されていれば内容に同期(無ければ作成、ハッシュ不一致なら更新+他セッション破棄)。`.env` 書き換えでログイン情報を固定・回復できる

### セッション

- トークン: `crypto.randomBytes(32).toString("base64url")`、TTL 7日、DB保存
- Cookie: `sid=<token>; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`。`req.secure || X-Forwarded-Proto: https` で `; Secure` 付与
- `sessionMiddleware` が毎リクエストで `req.user` を解決。期限切れは6時間ごとに削除(`setInterval(...).unref()`)
- レート制限: ログインはIPごと15分10回(`X-Forwarded-For` 先頭を優先)

### エンドポイント

| メソッド/パス | 認証 | 挙動 |
|---|---|---|
| `POST /api/auth/login` | 不要 | `{email, password}` 検証 → 429/400/401/200。成功時 `Set-Cookie: sid` + `{user}` |
| `POST /api/auth/logout` | 不要 | セッション破棄 + Cookie失効 |
| `GET /api/auth/me` | — | ログイン中なら `{user}`、未ログインは 401 |
| `POST /api/auth/password` | 必須 | `{current, next}`。next は8文字以上。成功時は他セッションを全破棄 |

- `requireAuth`: 未認証は `401 {error}`。Phase 2 以降のすべての業務APIに適用する前提のミドルウェアとして本フェーズで導入

## 5. サーバー統合(server/server.js の変更)

- `createApp()` 内に追加: セキュリティヘッダ(CSP等・`design.md` §4)→ `express.json({limit:"256kb"})` → `sessionMiddleware` → `/api/health` → 認証ルート → 静的配信 → JSONエラーハンドラ
- `app.set("trust proxy", true)`(プロキシ配下のIP・HTTPS判定)
- 起動時(`require.main` ブロック)に `ensureAdmin()` と `cleanupSessions()` を実行。テスト時は `createApp()` 呼び出しだけで副作用が起きないようにする

## 6. ログイン画面(public/)

- `index.html` を SPA 化: 起動時 `GET /api/auth/me` → 401 でログインフォーム、200 でホーム(Phase 1 では「ログイン済み・{name}」のプレースホルダーとログアウトボタンのみ)
- フォーム: email / password、送信で `POST /api/auth/login`。401/429 のエラーメッセージをフォーム下に表示
- 構成: `public/js/api.js`(fetchラッパ: JSON・credentials同一オリジン・エラー整形)+ `public/js/app.js`(画面切替)。DOM操作は `textContent` ベース(XSS対策)

## 7. 環境変数(.env.example に追記)

```
ADMIN_EMAIL=ceo@example.com
ADMIN_PASSWORD=change-this-password
ADMIN_NAME=社長
# DATA_DIR=./data
```

## 8. テスト(server/smoke-test.js に追加)

一時ディレクトリを `DATA_DIR` に設定してから `db.js` を require する(実データ非汚染)。

1. `GET /api/health` → 200(既存)
2. `GET /api/auth/me`(未ログイン)→ 401
3. `POST /api/auth/login`(誤パスワード)→ 401
4. `POST /api/auth/login`(正: テスト用に `ensureAdmin()` を env 指定で実行)→ 200 + `Set-Cookie: sid`
5. Cookie付き `GET /api/auth/me` → 200 + `{user.email}`
6. `POST /api/auth/logout` → 以後 `me` が 401
7. `GET /`(静的)→ 200

## 9. 受け入れ基準

- `npm start` → ブラウザでログイン → 名前表示 → ログアウトが一巡できる
- 初回起動時に管理者アカウントが作成され、`.env` の変更でパスワードが同期される
- `npm test` が上記7ケースすべて成功(外部サービス非依存)
- 認証系以外の挙動(Phase 0 のヘルスチェック・静的配信)が退行しない
