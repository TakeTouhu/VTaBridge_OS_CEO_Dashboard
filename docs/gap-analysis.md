# リポジトリ ギャップ分析(2026-07-20)

## 現状

- `main` ブランチの内容は **LICENSE のみ**。コード・ドキュメント・CI・依存定義は一切存在しない
- `CLAUDE.md` はどのブランチにも存在しなかった(本 Phase 0 で新規作成)
- 未マージのブランチ `claude/web-app-design-doc-zo2t20` に、設計書 v1.0 ベースの **完全なプロトタイプ** が存在する:
  - Express + SQLite バックエンド(`server/`: server / db / auth / api / metrics / ai / mail / seed / smoke-test)
  - Vanilla JS SPA フロントエンド(`public/`)
  - Claude API 連携(フォールバック付き)・IMAP メール監視・Docker 対応

## ギャップ(main と目標システムの差分)

| 領域 | 状態 | 対応フェーズ |
|---|---|---|
| プロジェクト文書(CLAUDE.md / README) | ❌ 無し | **Phase 0** |
| ビルド/実行基盤(package.json・サーバー・テスト) | ❌ 無し | **Phase 0** |
| DB スキーマ・認証 | ❌ 無し(プロトタイプに参照実装あり) | Phase 1 |
| 案件・商談 CRUD・ホーム画面 | ❌ 無し(同上) | Phase 2 |
| KPI・危険検知・売上分析 | ❌ 無し(同上) | Phase 3 |
| AI秘書・議事録TODO抽出 | ❌ 無し(同上) | Phase 4 |
| 書類作成・請求/入金・メール監視 | ❌ 無し(同上) | Phase 5 |
| CI / 自動チェック | ❌ 無し | 今後の課題 |

## Phase 0 の範囲(本マイルストーン)

リポジトリを「文書化済み・起動可能・チェック可能」にする最小構成:

1. `CLAUDE.md` — プロジェクト概要・コマンド・ロードマップ・規約
2. `package.json` / `.gitignore` / `.env.example` / `README.md`
3. `server/server.js` — 最小 Express サーバー(`GET /api/health` + 静的配信)
4. `public/index.html` — プレースホルダーページ
5. `server/smoke-test.js` — `npm test` で実行されるスモークテスト

プロトタイプ全体の移植は **意図的に対象外**(Phase 1 以降で段階的に移植)。
