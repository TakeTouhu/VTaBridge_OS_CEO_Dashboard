# VTaBridge OS - CEO Dashboard

社長が毎朝5分で会社の状況と最優先タスクを把握し、AIによる意思決定支援を受けられるダッシュボード。
Node.js + Express + SQLite のバックエンドを持つ実運用可能なWebアプリケーション。

## セットアップ・起動

```bash
npm install
cp .env.example .env    # 管理者アカウント・APIキーを設定
npm start               # http://localhost:3000
npm run seed            # サンプルデータ投入(任意)
npm test                # APIスモークテスト
```

詳細は `README.md` を参照。

## アーキテクチャ

- `server/` … Express バックエンド(`server.js` 起動 / `db.js` スキーマ・マイグレーション / `auth.js` 認証 / `api.js` REST API / `metrics.js` KPI・危険検知・分析 / `ai.js` Claude API連携 / `mail.js` メール送受信 / `seed.js` サンプル / `smoke-test.js` テスト)
- `public/` … 依存なしの Vanilla JS SPA(`index.html` / `js/app.js` ルーター+全画面 / `js/api.js` fetchラッパー / `js/charts.js` SVGチャート / `css/style.css`)
- `docs/` … 各Phaseの設計書

## 設計原則

- 社長に表示する優先タスクは最大3件
- API優先、API不可のみRPA
- AIは判断・分析・文章生成を担当、システムは通知・案件管理・履歴管理を担当
- メール送信は必ずユーザー確認後に実行(AIは自動送信しない)
- AI機能はキー未設定・障害時にルールベースへ自動フォールバック

## 開発フェーズ

- Phase 0 ✅ 基盤: リポジトリ整備・最小サーバー・ヘルスチェック・スモークテスト
- Phase 1 ✅ DB スキーマ + セッション認証 + ログイン画面(設計: `docs/phase-1-design.md`)
- Phase 2 ✅ 案件・商談 CRUD とホーム画面(今日やること最大3件)(設計: `docs/phase-2-design.md`)
- Phase 3 ✅ KPI・危険検知・売上分析(実データ計算)(設計: `docs/phase-3-design.md`)
- Phase 4 ✅ AI連携(AI秘書・議事録TODO抽出、フォールバック付き)(設計: `docs/phase-4-design.md`)
- Phase 5 ✅ 書類作成・請求/入金・メール監視(AI Mail Manager)(設計: `docs/phase-5-design.md`)
- Phase 6 ✅ AI Inbox・案件自動紐付け・AI Relationship Manager・AI営業アドバイス・危険検知拡張(設計: `docs/phase-6-design.md`)

### 将来対応(未着手)

- チャット統合: Microsoft Teams / Slack / LINE WORKS / Chatwork(データ構造は `emails.source` 列で準備済み、接続は未実装)
- 顧客の「最終訪問日」の専用入力(現状は商談活動で代替)
- Outlook の OAuth 認証(現状は IMAP パスワード認証のみ)
- 朝のサマリー通知(メール/Slack)、複数ユーザーと権限管理、監査ログ
