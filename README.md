# VTaBridge OS — CEO Dashboard

社長が**毎朝5分**で会社の状況と最優先タスクを把握し、AIによる意思決定支援を受けられるダッシュボード。

現在は **Phase 1(認証基盤)** まで実装済みです。SQLite + セッション認証 + ログイン画面が動作します。設計は [docs/design.md](docs/design.md)、ロードマップと規約は [CLAUDE.md](CLAUDE.md) を参照してください。

## クイックスタート

```bash
npm install
cp .env.example .env   # 管理者アカウント等を編集
npm start              # → http://localhost:3000
npm test               # スモークテスト
```

初回起動時に管理者アカウントが作成されます(`ADMIN_EMAIL` / `ADMIN_PASSWORD`。未指定ならパスワードを自動生成してコンソールに表示)。`ADMIN_EMAIL` と `ADMIN_PASSWORD` を両方設定すると、2回目以降の起動でもその内容にログイン情報が同期されます。

## 現在のエンドポイント

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/health` | ヘルスチェック(認証不要) |
| POST | `/api/auth/login` | ログイン(`{email, password}` → セッションCookie) |
| POST | `/api/auth/logout` | ログアウト |
| GET | `/api/auth/me` | ログイン中ユーザーの取得 |
| POST | `/api/auth/password` | パスワード変更(要認証) |
| GET | `/` | SPA(ログイン画面 / ホーム) |

## 構成

```
server/          Express バックエンド
  server.js      エントリポイント
  smoke-test.js  スモークテスト
public/          フロントエンド(静的配信)
docs/            設計・分析ドキュメント
```
