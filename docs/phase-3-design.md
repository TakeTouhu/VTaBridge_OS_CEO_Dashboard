# Phase 3 詳細設計 — KPI・危険検知・売上分析(実データ計算)

全体設計は `docs/design.md` を参照。本フェーズでホーム画面を「毎朝5分で会社の状況を把握できる」状態に引き上げる: KPI・危険検知・AI営業アドバイス・エンジニア稼働・売上分析・設定画面。

## 1. スコープ

**含む**: `engineers` / `settings` テーブル、`invoices` テーブル(**スキーマのみ先行導入**)、KPI計算、危険検知(5ルール)、月次売上集計、ルールベース提案、`GET /api/analytics`、エンジニア・設定 API、SVGチャート(`charts.js`)、売上分析画面、設定画面(しきい値・自社情報・エンジニア・パスワード変更)、ホーム画面の完成

**含まない**(後続フェーズ): 請求書の発行・入金消込 **UI/API**(Phase 5。テーブルだけ先行し、KPI の請求/入金/未回収は Phase 5 までゼロ表示)、メール由来の危険検知(返信漏れ・クレーム)、顧客分析(`customers`)由来の提案(Phase 5)

## 2. DB(server/db.js に追加)

- `engineers`: name・current_project・load(0-100)・active
- `settings`: key-value。`DEFAULT_SETTINGS`(プロトタイプと同一キー)を `INSERT OR IGNORE` で投入し、`getSettings()` / `setSetting(key, value)`(未知キーは拒否)をエクスポート
- `invoices`: project_id・number(UNIQUE)・amount・issued_at(NULL=未発行)・due_date・paid_at + `idx_invoices_project`

## 3. 集計ロジック(server/metrics.js に追加)

- **`kpis()`**: 当月/前月の受注額(`deals.won_at`)、請求額・入金額・期日超過未回収(invoices)、進行中商談数・見積提出数・契約待ち数・開発中案件数・稼働エンジニア数(active かつ load>0)
- **`monthlySales(n)`**: 直近nヶ月の受注/請求/入金(万円)
- **`detectRisks()`**(`riskDetect=1` のとき。メール系2ルールは Phase 5 で追加):
  1. 納期遅延(開発中・期限超過・進捗<100)— 5日以上で critical
  2. 未回収(発行済・未入金・期日超過)— `unpaidDays` 日以上で critical
  3. 未請求(ドラフトのまま3日以上)— serious
  4. 放置案件(開発中・14日更新なし)/ 契約未締結(契約待ち・7日滞留)
  5. 商談滞留(`noReplyDays` 日活動なし)— warning
  sort 値降順で返す(表示側で上から重要)
- **`suggestions()`**(最大4件): 稼働の偏り(90%超と50%未満の同時存在)、未回収の督促、見積提出中の最大案件フォロー、未発行請求書、見積提出後 `quoteFollowDays` 日経過のフォロー提案

## 4. API(server/api.js に追加・変更)

| エンドポイント | 挙動 |
|---|---|
| `GET /api/dashboard` | `{ kpi, todayTasks, risks, monthlySales(6ヶ月), pipeline, engineers(active・load降順), suggestions }` に拡張 |
| `GET /api/analytics?months=n` | `{ kpi, monthlySales }`(n は 1〜24、既定6) |
| `GET/POST /api/engineers`、`PATCH /api/engineers/:id` | エンジニア CRUD(name 必須・load 0-100・active切替) |
| `GET /api/settings` | 全設定の取得 |
| `PATCH /api/settings` | `{key: value, ...}` を一括更新(未知キーは400) |

## 5. フロントエンド

- **`public/js/charts.js`**: プロトタイプの依存なしSVGチャート(折れ線: クロスヘア+ツールチップ / 横棒)をそのまま移植。CSS変数(`--grid` `--baseline` `--surface-1` `--text-secondary` `--text-muted`)と `#chart-tooltip` を追加
- **ホーム**: KPIカード(受注額は前月比付き・入金額・未回収・商談件数・開発中・稼働エンジニア)、危険案件リスト(level別バッジ・リンク付き)、AI営業アドバイス、エンジニア稼働状況、売上6ヶ月チャートを既存の今日やること・パイプラインに追加
- **売上分析** `#/analytics`: 期間切替(3/6/12ヶ月)+ 受注/請求/入金の折れ線チャート + テーブルビュー
- **設定** `#/settings`: 危険検知しきい値(ON/OFF・未回収日数・滞留日数・見積フォロー日数)、自社情報(会社名・住所・振込先)、エンジニア管理(追加・稼働率・現在案件・有効/無効)、パスワード変更(Phase 1 の API を使用)
- ナビに「売上分析」「設定」を追加

## 6. テスト(smoke-test に追加)

1. 設定: GET に既定値、PATCH で `unpaidDays` 更新、未知キーは 400
2. エンジニア: POST → PATCH(load変更)→ dashboard の engineers に反映
3. KPI: 受注済み商談が `orderAmount` に計上される
4. 危険検知: 期限超過の開発中案件 → `納期遅延` が risks に現れる
5. 商談滞留: `noReplyDays` を跨ぐ古い活動日時の商談で検知(SQLで last_activity_at を過去に設定できないため、しきい値を0日に変更して検証)
6. analytics: `months=3` で3要素、dashboard に kpi / suggestions が存在

## 7. 受け入れ基準

- ホームだけで「今日やること・危険・KPI・売上・稼働・アドバイス」が一望できる
- 売上分析の期間切替とチャート・テーブルが実データで描画される
- 設定画面からしきい値を変えると危険検知の結果が変わる
- `npm test` 成功・ブラウザE2E一巡・既存機能の退行なし
