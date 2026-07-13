# VTaBridge OS - CEO Dashboard

社長が**毎朝5分**で会社の状況と最優先タスクを把握し、AIによる意思決定支援を受けられるダッシュボード。
(設計書 v1.0 に基づく実装)

Node.js + Express + SQLite のバックエンドを持つWebアプリケーションです。KPI・危険検知・優先タスクはすべてデータベースの実データから計算され、AI機能(AI秘書・議事録TODO抽出)はClaude APIと連携します。

## クイックスタート

```bash
npm install
cp .env.example .env        # 管理者パスワード等を編集
npm start                    # → http://localhost:3000
```

- 初回起動時に管理者アカウントが作成されます(`ADMIN_EMAIL` / `ADMIN_PASSWORD`。未指定ならパスワードを自動生成してコンソールに表示)
- 動作確認用のサンプルデータを入れる場合: `npm run seed`
- APIスモークテスト: `npm test`

### Docker

```bash
docker build -t vtabridge-dashboard .
docker run -d -p 3000:3000 -v vtabridge-data:/data \
  -e ADMIN_EMAIL=ceo@example.com -e ADMIN_PASSWORD=your-password \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  vtabridge-dashboard
```

### 環境変数

| 変数 | 既定値 | 説明 |
|---|---|---|
| `PORT` | `3000` | 待ち受けポート |
| `DATA_DIR` | `./data` | SQLiteデータベースの保存先 |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | — | 初回起動時に作成する管理者 |
| `ANTHROPIC_API_KEY` | — | Claude APIキー。**未設定でも動作**し、AI機能はルールベースにフォールバック |
| `ANTHROPIC_MODEL` | `claude-opus-4-8` | AI機能で使用するモデル |

本番でHTTPSを終端するリバースプロキシ(nginx等)の背後に置くことを推奨します(`X-Forwarded-Proto: https` でセッションCookieに `Secure` が付与されます)。

## 機能

### 画面(設計書 §画面設計)

| 画面 | 内容 |
|---|---|
| ホーム | 今日やること(**最大3件**・優先度スコアリング)・危険案件・KPI・売上サマリー・営業パイプライン・エンジニア稼働状況・AIからの提案 |
| 案件一覧 / 詳細 | 案件CRUD・タスク管理・**請求書の発行と入金消込**・タイムライン |
| 商談 / 詳細 | 商談CRUD・ステージ管理・活動履歴。**受注にすると案件を自動作成**(入力作業は極力自動化) |
| 売上分析 | 受注/請求/入金の月次推移(3/6/12ヶ月)・テーブルビュー |
| AI議事録取込 | 議事録貼り付け → **Claude APIでTODO抽出** → 案件へワンクリック登録 |
| 書類作成 | 見積書・契約書・請求書を商談データから生成・連番採番・発行履歴・印刷/PDF |
| AI秘書 | 最新の経営データ(KPI・危険案件・パイプライン・稼働状況)を文脈に持つチャット |
| 設定 | 危険検知しきい値・自社情報・エンジニア管理・パスワード変更 |

### 実データ計算(設計書 §KPI・危険検知)

- **KPI**: 受注額(受注日ベース)・請求額(発行日)・入金額(入金日)・期日超過の未回収・商談件数・見積提出数・契約待ち・開発中・稼働エンジニア数
- **危険検知**: 納期遅延(納期超過の開発中案件)・未回収(期日超過の未入金請求書)・未請求(未発行のまま滞留した請求書)・商談の滞留(活動停止日数)。しきい値は設定画面で変更可能
- **今日やること**: 未完了タスク・契約待ち商談を期限・金額で優先度スコアリングし上位3件のみ表示

### AI連携

- サーバー側で公式SDK(`@anthropic-ai/sdk`)からClaude APIを呼び出します(既定モデル: `claude-opus-4-8`)
- 議事録TODO抽出はJSONスキーマ強制(structured outputs)で安定した構造化出力
- AI秘書はDBから生成した経営コンテキストでグラウンディング(数字の捏造を抑止)
- **APIキー未設定・API障害時はルールベースに自動フォールバック**し、UI上にどちらで動作したかをバッジ表示

### セキュリティ

- セッション認証(HttpOnly / SameSite=Lax Cookie・bcryptパスワードハッシュ・ログイン試行レート制限)
- 全APIエンドポイントで認証必須・入力バリデーション・SQLはすべてプリペアドステートメント
- CSP等のセキュリティヘッダ・XSS対策(全出力エスケープ)

## 構成

```
server/          Express バックエンド
  server.js      エントリポイント
  db.js          SQLiteスキーマ・設定
  auth.js        セッション認証
  api.js         REST API
  metrics.js     KPI・危険検知・優先タスクの計算
  ai.js          Claude API連携(フォールバック付き)
  seed.js        サンプルデータ投入
  smoke-test.js  APIスモークテスト
public/          フロントエンド(依存なしのVanilla JS SPA)
```

## 設計原則(設計書 §設計原則)

- 社長に表示する優先タスクは最大3件
- API優先、API不可のみRPA
- AIは判断、RPAは入力
- 入力作業は極力自動化

## 開発ロードマップとの対応

- v0.1 ログイン・案件一覧・AI議事録 ✅
- v0.2 見積・契約・案件登録自動化 ✅(受注→案件自動作成・書類採番)
- v0.3 請求・入金・KPI ✅(請求書発行・入金消込・実データKPI)
- v1.0 AI秘書・危険検知・経営分析 ✅(Claude API連携・しきい値可変の危険検知・売上分析)

今後の拡張候補: 外部CRM/会計APIとの実連携、朝のサマリー通知(メール/Slack)、複数ユーザーと権限管理、監査ログ。
