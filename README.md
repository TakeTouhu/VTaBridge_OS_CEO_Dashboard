# VTaBridge OS — CEO Dashboard

社長が**毎朝5分**で会社の状況と最優先タスクを把握し、AIによる意思決定支援を受けられるダッシュボード。

現在は **Phase 0(基盤)** の段階です。最小の Express サーバー・ヘルスチェック・スモークテストが動作します。開発ロードマップと規約は [CLAUDE.md](CLAUDE.md) を参照してください。

## クイックスタート

```bash
npm install
cp .env.example .env   # 必要に応じて編集
npm start              # → http://localhost:3000
npm test               # スモークテスト
```

## 現在のエンドポイント

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/health` | ヘルスチェック(`{ ok, name, version, time }`) |
| GET | `/` | プレースホルダーページ |

## 構成

```
server/          Express バックエンド
  server.js      エントリポイント
  smoke-test.js  スモークテスト
public/          フロントエンド(静的配信)
docs/            設計・分析ドキュメント
```
