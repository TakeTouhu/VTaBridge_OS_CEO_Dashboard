# Phase 5: 書類作成・請求/入金・メール監視(AI Mail Manager)

## 目的
見積・契約・請求の書類作成、請求発行と入金消込、受信メールのAI監視を実装する。

## 書類作成(`server/api.js` / `public/js/app.js`)
- `documents` テーブル + 連番採番(`nextDocNumber`)
- 見積書・契約書・請求書を商談/案件データから生成、発行履歴、印刷/PDF
- `/api/documents` 系エンドポイント

## 請求・入金
- `invoices` テーブル(発行日・入金日・金額)
- 請求書の発行と入金消込(reconciliation)を案件詳細から操作
- KPI(請求額・入金額・期日超過の未回収)に反映

## メール監視(AI Mail Manager)(`server/mail.js` / `server/ai.js`)
- `mail_accounts` / `emails` テーブル。IMAPで受信箱を定期チェック(`startPolling`・間隔は設定可)
- 新着を `classifyEmail` でAI振り分け(カテゴリ・緊急度・要約・要返信・案件推定)
- `draftReply` でAI返信ドラフト生成。送信は必ずユーザー確認後(`sendReply`・自動送信しない)
- 返信漏れ監視: 要返信メールが一定時間未対応だとホームの危険案件・今日やることに上がる
- Gmail / Outlook プリセット(アプリパスワード認証)

## 完了条件
- 書類の生成・採番・発行履歴が動作する
- 請求発行→入金消込がKPIに反映される
- メールアカウント登録→受信→AI分類→返信ドラフト→手動送信が通しで動作する
