# VTaBridge OS — CEO Dashboard

社長が**毎朝5分**で会社の状況と最優先タスクを把握し、AIによる意思決定支援を受けられるダッシュボード。

現在は **Phase 2(案件・商談 + ホーム画面)** まで実装済みです。ログイン後、今日やること(最大3件・優先度スコアリング)・案件/商談の管理・受注時の案件自動作成が動作します。設計は [docs/design.md](docs/design.md)、ロードマップと規約は [CLAUDE.md](CLAUDE.md) を参照してください。

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
| POST | `/api/auth/logout` / GET `/api/auth/me` / POST `/api/auth/password` | セッション管理 |
| GET | `/api/dashboard` | 今日やること(最大3件)・パイプライン |
| GET/POST | `/api/projects`、GET/PATCH `/api/projects/:id` | 案件 CRUD |
| POST | `/api/projects/:id/tasks`、PATCH/DELETE `/api/tasks/:id` | タスク管理 |
| GET/POST | `/api/deals`、GET/PATCH `/api/deals/:id` | 商談 CRUD(受注→案件自動作成) |
| POST | `/api/deals/:id/activities` | 商談の活動記録 |
| GET | `/` | SPA(ホーム / 案件 / 商談) |

`/api/health` と認証系以外のAPIはすべて認証必須です。

## 構成

```
server/          Express バックエンド
  server.js      エントリポイント
  smoke-test.js  スモークテスト
public/          フロントエンド(静的配信)
docs/            設計・分析ドキュメント
```
