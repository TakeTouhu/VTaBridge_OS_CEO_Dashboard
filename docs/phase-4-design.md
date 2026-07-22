# Phase 4: AI連携(AI秘書・議事録TODO抽出)

## 目的
Claude API を用いた判断・分析・文章生成を実装する。APIキー未設定・障害時はルールベースに自動フォールバックする。

## AI(`server/ai.js`)
- 公式SDK `@anthropic-ai/sdk`(既定モデル `claude-opus-4-8`)
- 議事録TODO抽出: JSONスキーマ強制(structured outputs)で `{タスク名, 期限, 担当}` を安定抽出
- AI秘書: DBから生成した経営コンテキスト(KPI・危険案件・パイプライン・稼働状況)でグラウンディングし、数字の捏造を抑止
- 拒否(`stop_reason === "refusal"`)・エラー・キー未設定を検知して**ルールベースにフォールバック**

## API・画面
- `/api/ai/minutes`(議事録→TODO抽出→案件へワンクリック登録)
- `/api/ai/chat`(AI秘書チャット)
- UIにAI/ルールベースのどちらで動作したかをバッジ表示

## 完了条件
- キーありでClaude API、キーなし/障害でルールベースに切替わる
- 議事録から抽出したTODOを案件に登録できる
