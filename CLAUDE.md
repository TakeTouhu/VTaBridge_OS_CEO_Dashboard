# VTaBridge OS — CEO Dashboard

社長が**毎朝5分**で会社の状況と最優先タスクを把握し、AIによる意思決定支援を受けられるダッシュボード。

## プロジェクト概要

- **バックエンド**: Node.js + Express + SQLite(`better-sqlite3`)
- **フロントエンド**: 依存なしの Vanilla JS SPA(`public/`)
- **AI連携**: Claude API(`@anthropic-ai/sdk`)。APIキー未設定時はルールベースにフォールバック
- **参照実装**: ブランチ `claude/web-app-design-doc-zo2t20` に設計書 v1.0 ベースのプロトタイプ一式があり、各フェーズで段階的に main へ移植する

## コマンド

```bash
npm install        # 依存関係のインストール
npm start          # サーバー起動 → http://localhost:3000
npm test           # スモークテスト(サーバー起動 + ヘルスチェック)
```

## ディレクトリ構成

```
server/          Express バックエンド
  server.js      エントリポイント(app 生成は createApp() でエクスポート)
  db.js          SQLiteスキーマ(users / sessions)
  auth.js        セッション認証・管理者アカウント管理
  smoke-test.js  スモークテスト(一時 DATA_DIR で認証フローを検証)
public/          フロントエンド(Vanilla JS SPA)
docs/            設計・分析ドキュメント
```

## 設計原則(設計書 §設計原則)

- 社長に表示する優先タスクは最大3件
- API優先、API不可のみRPA
- AIは判断、RPAは入力
- 入力作業は極力自動化

## 開発ロードマップ

全体設計は `docs/design.md`、各フェーズの詳細設計は `docs/phase-N-design.md` を参照。

- **Phase 0** ✅ 基盤: リポジトリ整備・最小サーバー・ヘルスチェック・スモークテスト
- **Phase 1** ✅ DB スキーマ + セッション認証 + ログイン画面(設計: `docs/phase-1-design.md`)
- **Phase 2** 案件・商談 CRUD とホーム画面(今日やること最大3件)
- **Phase 3** KPI・危険検知・売上分析(実データ計算)
- **Phase 4** AI連携(AI秘書・議事録TODO抽出、フォールバック付き)
- **Phase 5** 書類作成・請求/入金・メール監視(AI Mail Manager)

## 規約

- CommonJS(`"type": "commonjs"`)。Node 22 標準機能を優先し、依存は最小限に
- SQL は必ずプリペアドステートメント。全APIエンドポイントは認証必須(Phase 1 以降)
- サーバーは `PORT` / `DATA_DIR` 等を環境変数で設定(`.env.example` 参照)
- テストは外部サービスに依存しないこと(Claude API・IMAP はモック/フォールバックで検証)

## First Implementation Assignment

1. リポジトリのギャップ分析を行う(`docs/gap-analysis.md` に記録)
2. 最小の Phase 0 基盤マイルストーンを提案する
3. そのマイルストーンを実装する
4. 利用可能なチェックをすべて実行する
5. 完了した内容と残作業を正確に報告する
