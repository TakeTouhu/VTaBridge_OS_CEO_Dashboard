# Phase 2 詳細設計 — 案件・商談 CRUD + ホーム画面(今日やること最大3件)

全体設計は `docs/design.md` を参照。本フェーズで業務データの中核(案件・商談)とホーム画面の骨格を移植し、「毎朝5分」の中心である **今日やること最大3件** を成立させる。

## 1. スコープ

**含む**: `projects` / `project_tasks` / `project_events` / `deals` / `deal_activities` テーブル、案件・商談 CRUD API 11本、`GET /api/dashboard`(骨格)、優先度スコアリング(`todayTasks`)、パイプライン集計、**受注→案件自動作成**、フロントエンド(ハッシュルーティング・ホーム/案件/商談画面)

**含まない**(後続フェーズ): KPI・危険検知・売上分析(Phase 3)、`engineers` / `settings` / `invoices` / `documents` / `emails` 関連(Phase 3/5)。`todayTasks` のメール由来候補と `detectRisks` は該当テーブル導入後に追加

## 2. DB(server/db.js に追加)

プロトタイプと同一定義の5テーブルを追加:

- `projects`: status は `'開発中'|'契約待ち'|'保守'|'完了'`(CHECK)、amount・deadline・progress(0-100)・pm・engineers・note、`updated_at`
- `project_tasks`: project_id(CASCADE)、title・due・done、source は `'manual'|'minutes'|'ai'`。インデックス `idx_tasks_project(project_id, done)`
- `project_events`: 案件タイムライン(date + text)
- `deals`: stage は `'リード'|'商談中'|'見積提出'|'契約待ち'|'受注'|'失注'`(CHECK)、amount・probability(0-100)・owner・contact・next_action・minutes_note・`last_activity_at`・`won_at`・`project_id`(SET NULL)
- `deal_activities`: 商談活動履歴

## 3. API(server/api.js — 新規モジュール)

- 冒頭で `app.use('/api', ...)` により **`/auth/` 以外の全APIに `requireAuth` を適用**(`/api/health` と認証ルートは先に登録済みのため影響なし)
- バリデーションヘルパ `str` / `int` / `dateOrNull` / `httpError`(プロトタイプ踏襲。文字列は max 切詰め、日付は `YYYY-MM-DD` のみ受理)

| エンドポイント | 挙動 |
|---|---|
| `GET /api/dashboard` | `{ todayTasks(最大3), pipeline, risks: [], kpi: null }` — risks/kpi は Phase 3 で実装 |
| `GET/POST /api/projects` | 一覧(未完了タスク数付き・updated_at 降順)/ 作成(201・タイムラインに記録) |
| `GET/PATCH /api/projects/:id` | 詳細(tasks・events 付き)/ 部分更新。状態変更・進捗変更はタイムラインに自動記録 |
| `POST /api/projects/:id/tasks` | 単発 or 一括(最大50件)。source=`minutes` はイベント記録(Phase 4 のAI議事録が使用) |
| `PATCH/DELETE /api/tasks/:id` | done 切替 / 削除 |
| `GET/POST /api/deals` | 一覧(失注は末尾・金額降順)+ パイプライン / 作成 |
| `GET/PATCH /api/deals/:id` | 詳細(活動履歴付き)/ 部分更新。**stage が「受注」に変わったら案件を自動作成**(status=契約待ち、`deals.project_id` に紐付け、`createdProjectId` を返す)。ステージ変更は活動履歴に記録、更新時は `last_activity_at` を更新 |
| `POST /api/deals/:id/activities` | 活動メモ追加 |

## 4. 優先度スコアリング(server/metrics.js — 新規モジュール)

`todayTasks()` — 候補を集めてスコア降順・上位3件のみ返す(設計原則):

- **未完了タスク**: 基礎10点 + 案件金額(最大10点)。期限超過 +60、本日 +50、3日以内 +30−日数×5
- **契約待ち商談**: 45点 + 滞留日数×2(最大20)+ 金額(最大10)。「長期化は失注リスク」を理由に付す
- (Phase 5 で緊急メール候補を追加)

返却形: `{ kind, title, why, link }`。`why` に優先理由を必ず含める(社長が理由を即断できるように)。

`pipeline()` — 失注を除く6ステージの件数・金額(万円)を集計(受注は当月のみ)。

## 5. フロントエンド(public/js/app.js を SPA 化)

- **ハッシュルーティング**: `#/`(ホーム)`#/projects` `#/projects/:id` `#/deals` `#/deals/:id`。未ログイン時は全ルートでログイン画面
- **共通レイアウト**: ヘッダー(ナビ + ユーザー名 + ログアウト)。DOM 構築は引き続き `createElement` + `textContent` のみ
- **ホーム**: 今日やること最大3件(タイトル+理由+遷移リンク)、営業パイプライン。KPI・危険検知エリアは「Phase 3 で実装」のプレースホルダー
- **案件一覧**: テーブル(案件名・顧客・状態・金額・納期・進捗・未完了タスク数)+ 新規登録フォーム
- **案件詳細**: 基本情報の編集(状態・進捗ほか)、タスクの追加・完了切替・削除、タイムライン表示
- **商談一覧**: パイプラインサマリー + テーブル + 新規登録フォーム
- **商談詳細**: ステージ変更(受注時は「案件を自動作成しました」を表示し案件へリンク)、金額・確度・次アクションの編集、活動履歴の追加・表示

## 6. テスト(smoke-test に追加)

1. 認証ガード: 未ログインの `GET /api/projects` → 401
2. 案件: POST → 201、GET 一覧に反映、PATCH で状態変更 → タイムラインに記録
3. タスク: POST → PATCH done → ダッシュボードの todayTasks に反映(最大3件・why 付き)
4. 商談: POST → PATCH で stage=受注 → `createdProjectId` が返り案件が存在する
5. ダッシュボード: `todayTasks.length <= 3` を常に満たす

## 7. 受け入れ基準

- ログイン → ホームに「今日やること」最大3件が理由付きで表示される
- 案件・商談の作成・編集・タスク管理・活動記録が画面から一巡できる
- 商談を受注にすると案件が自動作成される(入力作業は極力自動化)
- `npm test` 成功(全ケース・外部サービス非依存)、既存機能の退行なし
