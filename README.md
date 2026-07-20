# VTaBridge OS — CEO Dashboard

社長が**毎朝5分**で会社の状況と最優先タスクを把握し、AIによる意思決定支援を受けられるダッシュボード。

現在は **Phase 3(KPI・危険検知・売上分析)** まで実装済みです。ホームで今日やること(最大3件)・危険案件・KPI・売上推移・パイプライン・エンジニア稼働・AI営業アドバイスが実データから一望でき、売上分析・設定画面も動作します。設計は [docs/design.md](docs/design.md)、ロードマップと規約は [CLAUDE.md](CLAUDE.md) を参照してください。

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
| GET | `/api/dashboard` | KPI・今日やること(最大3件)・危険検知・売上・パイプライン・稼働・提案 |
| GET | `/api/analytics?months=n` | 月次売上(受注/請求/入金) |
| GET/POST | `/api/engineers`、PATCH `/api/engineers/:id` | エンジニア管理 |
| GET/PATCH | `/api/settings` | 危険検知しきい値・自社情報 |
| GET/POST | `/api/projects`、GET/PATCH `/api/projects/:id` | 案件 CRUD |
| POST | `/api/projects/:id/tasks`、PATCH/DELETE `/api/tasks/:id` | タスク管理 |
| GET/POST | `/api/deals`、GET/PATCH `/api/deals/:id` | 商談 CRUD(受注→案件自動作成) |
| POST | `/api/deals/:id/activities` | 商談の活動記録 |
| GET | `/` | SPA(ホーム / 案件 / 商談 / 売上分析 / 設定) |

`/api/health` と認証系以外のAPIはすべて認証必須です。

## 構成

```
server/          Express バックエンド
  server.js      エントリポイント
  smoke-test.js  スモークテスト
public/          フロントエンド(静的配信)
docs/            設計・分析ドキュメント
```
