# Phase 6: AI Inbox・案件自動紐付け・AI Relationship Manager・AI営業アドバイス・危険検知拡張

## 目的
メール・顧客・営業を横断してAIが「今日やるべき対応」を提示する。

## AI Inbox(`server/metrics.js` `inbox` / ホーム)
- 本日ビューに集約: 🔴至急返信 / 本日返信推奨 / 今週中 / フォロー推奨 の件数
- 4段階緊急度(🔴至急/🟠高/🟡中/🟢低)を色分け表示

## 案件自動紐付け
- `classifyEmail` が本文・送信者から `project_id` を推定し、メールを案件へ自動リンク
- 案件詳細にメール履歴を表示

## AI Relationship Manager(`server/metrics.js` `customers` / 顧客画面)
- 顧客ごとに最終商談日/最終メール日/最終接触・売上・商談回数・契約件数を自動集計
- 疎遠(`followDays` 経過)顧客のフォロー推奨をAIが提案

## AI営業アドバイス(`server/metrics.js` `suggestions` / ホーム)
- 見積提出後の経過日数による失注リスク・フォロー提案
- 既存顧客へのアップセル機会の助言

## 危険検知拡張(`server/metrics.js` `detectRisks`)
- 従来の納期遅延・未回収・未請求・商談滞留に加え、返信漏れ・クレームの兆候・放置案件・契約未締結を追加

## 完了条件
- ホームのAI Inboxに本日の対応件数が出る
- メールが案件に自動紐付けされ、案件詳細に履歴が出る
- 顧客画面でフォロー推奨が算出される
