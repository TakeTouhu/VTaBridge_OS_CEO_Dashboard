# Phase 4 詳細設計 — AI連携(AI秘書・議事録TODO抽出、フォールバック付き)

全体設計は `docs/design.md` を参照。本フェーズで Claude API 連携を導入する。設計原則「AIは判断、RPAは入力」— AIが判断(TODO抽出・経営アドバイス)し、登録操作はワンクリックで自動化する。

## 1. スコープ

**含む**: `server/ai.js`(議事録TODO抽出・AI秘書チャット・ルールベースフォールバック)、`metrics.businessContext()`(AI秘書のグラウンディング)、`POST /api/ai/extract` / `POST /api/ai/chat`、ダッシュボードへの AI 状態表示、AI議事録取込画面、AI秘書チャット画面

**含まない**(Phase 5): メール分類(`classifyEmail`)・返信ドラフト(`draftReply`)・顧客分析

## 2. 依存関係

- `@anthropic-ai/sdk`(公式SDK)。既定モデル `claude-opus-4-8`(`ANTHROPIC_MODEL` で変更可)
- **`ANTHROPIC_API_KEY` 未設定でも全機能が動作**する(ルールベースにフォールバックし、応答の `source: "rules"` で明示)。テストは外部サービス非依存の規約どおりフォールバック経路で検証する

## 3. AI モジュール(server/ai.js — プロトタイプを移植)

### 議事録TODO抽出 `extractTodos(text)`

- Claude API 呼び出し: structured outputs(`output_config: { format: { type: "json_schema", schema } }`)で `{ todos: [{ title, due }] }` を強制。相対期限(「7/18まで」)は本日基準で `YYYY-MM-DD` に正規化するようシステムプロンプトで指示
- `stop_reason === "refusal"` と API 例外はルールベースへフォールバック(`note` で理由を明示)
- ルールベース抽出: 行分割 → 箇条書き記号除去 → アクション動詞(する/提出/対応/作成/送付/確認…)を含む行を抽出、日付表現(`M/D`・`M月D日`・本日/明日/今週/来週)を期限に正規化

### AI秘書チャット `chat(question, history)`

- `metrics.businessContext()`(本日・KPI・パイプライン・優先タスク・危険案件・稼働状況)をシステムプロンプトに注入してグラウンディング(数字の捏造を抑止。データにない質問には「わからない」と答えるよう指示)
- 直近10件の履歴を検証してから渡す(role/content の型チェック)
- ルールベース応答: 質問のキーワード(今日/危険/売上/資金/稼働/商談)で該当セクションを返す

### `aiStatus()`

`{ enabled, model }` を返し、ダッシュボードとUIバッジ(AI / ルールベース)に使用。

## 4. API(server/api.js に追加)

| エンドポイント | 挙動 |
|---|---|
| `POST /api/ai/extract` | `{text}`(最大20000字・必須)→ `{ source, todos, note? }` |
| `POST /api/ai/chat` | `{question, history?}` → `{ source, reply }` |
| `GET /api/dashboard` | 応答に `ai: aiStatus()` を追加 |

抽出結果の登録は既存の `POST /api/projects/:id/tasks`(`source: "minutes"`、一括最大50件)を使用 — 新規APIは不要。

## 5. フロントエンド

- **AI議事録取込** `#/minutes`: 議事録テキストエリア → 「TODOを抽出」→ 抽出結果(タイトル・期限、チェックボックスで選択)→ 登録先案件を選択 → ワンクリック登録。source バッジ(🤖AI / 📋ルールベース)と note を表示
- **AI秘書** `#/assistant`: チャットUI(履歴保持・送信中表示)。回答に source バッジ。ヘッダーに AI 状態(モデル名 or 「APIキー未設定」)
- ナビに「AI議事録」「AI秘書」を追加

## 6. テスト(smoke-test に追加 — フォールバック経路)

`ANTHROPIC_API_KEY` を明示的に未設定にして実行:

1. `POST /api/ai/extract`(議事録サンプル)→ 200・`source: "rules"`・アクション行が抽出され期限が `YYYY-MM-DD` に正規化される
2. 抽出結果を `POST /api/projects/:id/tasks`(source=minutes)で一括登録 → タイムラインに「AI議事録からTODO n件を自動登録」
3. `POST /api/ai/chat`(「今日やることは?」)→ 200・`source: "rules"`・優先タスクの内容を含む回答
4. `GET /api/dashboard` → `ai.enabled === false`

## 7. 受け入れ基準

- APIキー未設定で議事録貼り付け → 抽出 → 案件へ登録が一巡できる(UIにルールベースと明示)
- AI秘書が経営データに基づいた応答を返す(フォールバックでも各セクションを回答)
- APIキー設定時は Claude API(既定 `claude-opus-4-8`)で動作し、障害時は自動フォールバック
- `npm test` 成功・ブラウザE2E一巡・既存機能の退行なし
