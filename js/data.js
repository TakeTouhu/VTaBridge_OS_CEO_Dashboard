/* VTaBridge OS - CEO Dashboard: モックデータ層
   本番では API (API優先、API不可のみRPA) から取得する想定のデータをここで定義する。 */
"use strict";

const DB = {
  /* ===== KPI(設計書 §KPI) ===== */
  kpi: {
    orderAmount:      12800000,  // 受注額(今月)
    invoicedAmount:    9400000,  // 請求額(今月)
    paidAmount:        7150000,  // 入金額(今月)
    unpaidAmount:      4230000,  // 未回収金額
    dealCount:         14,       // 商談件数
    quoteCount:         6,       // 見積提出数
    awaitingContract:   3,       // 契約待ち件数
    inDevelopment:      5,       // 開発中件数
    activeEngineers:    8,       // 稼働エンジニア数
    orderAmountPrev:  11200000,
    paidAmountPrev:    8300000,
  },

  /* ===== 今日やること(最大3件・設計原則) ===== */
  todayTasks: [
    { id: "t1", title: "株式会社アオバ 御見積書の最終承認", why: "回答期限が本日17:00。受注確度A・420万円の案件", done: false, link: "#/deals/d1" },
    { id: "t2", title: "ミナト物流 追加開発の契約書に押印", why: "先方は契約待ち9日目。長期化すると失注リスク", done: false, link: "#/projects/p2" },
    { id: "t3", title: "サクラ製作所への未回収 128万円の督促判断", why: "支払期日を14日超過。AIが督促文面を作成済み", done: false, link: "#/projects/p4" },
  ],

  /* ===== 危険案件(未返信・未請求・納期遅延の検知) ===== */
  risks: [
    { id: "r1", level: "critical", type: "納期遅延", text: "ECサイト構築(サクラ製作所)が予定より6日遅延。PMアサイン見直しを推奨", link: "#/projects/p4" },
    { id: "r2", level: "critical", type: "未回収",   text: "サクラ製作所 請求書 #INV-0231(128万円)が支払期日14日超過", link: "#/projects/p4" },
    { id: "r3", level: "serious",  type: "未請求",   text: "ミナト物流 3月分保守費(45万円)が検収済みのまま未請求", link: "#/projects/p2" },
    { id: "r4", level: "warning",  type: "未返信",   text: "ヒカリ商事からの追加見積依頼メールに3営業日未返信", link: "#/deals/d3" },
  ],

  /* ===== 売上サマリー(月次: 受注/請求/入金・万円) ===== */
  monthlySales: [
    { month: "2月", order:  860, invoice:  790, paid:  740 },
    { month: "3月", order:  920, invoice:  880, paid:  810 },
    { month: "4月", order: 1040, invoice:  930, paid:  860 },
    { month: "5月", order:  980, invoice: 1010, paid:  920 },
    { month: "6月", order: 1120, invoice:  990, paid:  830 },
    { month: "7月", order: 1280, invoice:  940, paid:  715 },
  ],

  /* ===== 営業パイプライン ===== */
  pipeline: [
    { stage: "リード",   count: 9, amount: 2100 },
    { stage: "商談中",   count: 5, amount: 1650 },
    { stage: "見積提出", count: 6, amount: 1380 },
    { stage: "契約待ち", count: 3, amount:  860 },
    { stage: "受注",     count: 4, amount: 1280 },
  ],

  /* ===== エンジニア稼働状況 ===== */
  engineers: [
    { name: "佐藤", project: "ECサイト構築", load: 95 },
    { name: "鈴木", project: "在庫管理システム", load: 80 },
    { name: "高橋", project: "ECサイト構築", load: 90 },
    { name: "田中", project: "業務アプリ保守", load: 60 },
    { name: "伊藤", project: "AIチャットボット", load: 75 },
    { name: "渡辺", project: "(アサイン待ち)", load: 20 },
  ],

  /* ===== AIからの提案 ===== */
  aiSuggestions: [
    { icon: "🎯", text: "アオバ案件は本日中の見積提出で受注確度が約1.4倍。優先タスク1位に設定しました。", reason: "回答期限と過去の受注パターンから算出" },
    { icon: "⚠️", text: "佐藤・高橋の稼働が90%超。ECサイト構築の遅延要因です。渡辺のアサインを提案します。", reason: "稼働状況と納期遅延の相関を検知" },
    { icon: "💰", text: "今月の入金進捗は前年同月比86%。未請求2件を今週請求すれば計画比100%に回復します。", reason: "キャッシュフロー予測モデル" },
  ],

  /* ===== 案件(プロジェクト) ===== */
  projects: [
    {
      id: "p1", name: "在庫管理システム刷新", client: "ヒカリ商事", status: "開発中",
      amount: 6800000, invoiced: 3400000, paid: 3400000, deadline: "2026-09-30",
      progress: 45, pm: "鈴木", engineers: ["鈴木", "田中"],
      risk: null,
      tasks: [
        { title: "基本設計レビュー", due: "2026-07-15", done: true },
        { title: "在庫API結合テスト", due: "2026-07-24", done: false },
        { title: "中間検収の日程調整", due: "2026-07-20", done: false },
      ],
      timeline: [
        { date: "2026-07-10", text: "AI議事録: 定例MTGからTODO 3件を自動抽出" },
        { date: "2026-06-28", text: "中間請求 340万円 入金確認" },
        { date: "2026-06-02", text: "契約締結・開発着手" },
      ],
    },
    {
      id: "p2", name: "配送管理アプリ追加開発", client: "ミナト物流", status: "契約待ち",
      amount: 3200000, invoiced: 0, paid: 0, deadline: "2026-11-15",
      progress: 0, pm: "伊藤", engineers: ["伊藤"],
      risk: { level: "serious", text: "契約待ち9日経過 / 3月分保守費45万円が未請求" },
      tasks: [
        { title: "契約書押印(社長対応)", due: "2026-07-13", done: false },
        { title: "3月分保守費の請求書発行", due: "2026-07-14", done: false },
      ],
      timeline: [
        { date: "2026-07-04", text: "契約書ドラフト送付(AI自動生成)" },
        { date: "2026-06-25", text: "見積書 #Q-0342 承認・受注内示" },
      ],
    },
    {
      id: "p3", name: "AIチャットボット導入", client: "株式会社アオバ", status: "開発中",
      amount: 4200000, invoiced: 2100000, paid: 2100000, deadline: "2026-08-31",
      progress: 62, pm: "伊藤", engineers: ["伊藤", "渡辺"],
      risk: null,
      tasks: [
        { title: "FAQ学習データ最終確認", due: "2026-07-18", done: false },
        { title: "本番環境デプロイ", due: "2026-08-05", done: false },
      ],
      timeline: [
        { date: "2026-07-08", text: "UAT開始。指摘4件をTODOに自動登録" },
        { date: "2026-06-15", text: "着手金 210万円 入金確認" },
      ],
    },
    {
      id: "p4", name: "ECサイト構築", client: "サクラ製作所", status: "開発中",
      amount: 5400000, invoiced: 2700000, paid: 1420000, deadline: "2026-07-31",
      progress: 70, pm: "佐藤", engineers: ["佐藤", "高橋"],
      risk: { level: "critical", text: "納期6日遅延 / 請求書 #INV-0231(128万円)支払期日14日超過" },
      tasks: [
        { title: "未回収128万円の督促(AI文面確認)", due: "2026-07-13", done: false },
        { title: "決済モジュール結合テスト", due: "2026-07-17", done: false },
        { title: "リスケ案を顧客へ提示", due: "2026-07-15", done: false },
      ],
      timeline: [
        { date: "2026-07-11", text: "危険検知: 納期遅延6日・未回収14日超過" },
        { date: "2026-06-29", text: "中間請求 #INV-0231 発行(128万円)" },
      ],
    },
    {
      id: "p5", name: "業務アプリ保守 2026年度", client: "ヒカリ商事", status: "保守",
      amount: 2400000, invoiced: 800000, paid: 800000, deadline: "2027-03-31",
      progress: 33, pm: "田中", engineers: ["田中"],
      risk: null,
      tasks: [{ title: "7月分定期報告書の送付", due: "2026-07-31", done: false }],
      timeline: [{ date: "2026-07-01", text: "第1四半期分 80万円 入金確認" }],
    },
  ],

  /* ===== 商談(CRM連携想定) ===== */
  deals: [
    {
      id: "d1", client: "株式会社アオバ", title: "社内ポータル刷新", stage: "見積提出",
      amount: 4200000, probability: 70, owner: "社長", nextAction: "見積の最終承認と提出(本日17:00期限)",
      contact: "情報システム部 森様",
      history: [
        { date: "2026-07-12", text: "AIが見積書ドラフト #Q-0351 を自動生成" },
        { date: "2026-07-09", text: "要件ヒアリング実施。議事録からTODO 5件抽出" },
        { date: "2026-07-01", text: "既存顧客からの追加相談として起票" },
      ],
      minutes: "・ポータルは10月リリース希望\n・予算上限は450万円\n・SSOは必須要件\n・保守も併せて提案してほしい",
    },
    {
      id: "d2", client: "ツバキ食品", title: "受発注システム新規開発", stage: "商談中",
      amount: 7500000, probability: 40, owner: "営業 山本", nextAction: "デモ環境の提示(7/16 訪問)",
      contact: "購買部 井上様",
      history: [
        { date: "2026-07-07", text: "初回商談。現行FAX運用の課題をヒアリング" },
        { date: "2026-07-02", text: "展示会リードから商談化" },
      ],
      minutes: "・FAX受注が月800件、入力工数が課題\n・基幹システムはAS/400\n・来期予算で検討",
    },
    {
      id: "d3", client: "ヒカリ商事", title: "在庫管理 追加モジュール", stage: "商談中",
      amount: 1800000, probability: 60, owner: "営業 山本", nextAction: "追加見積依頼メールへの返信(3営業日未返信・要対応)",
      contact: "物流企画課 岡田様",
      history: [{ date: "2026-07-08", text: "先方より追加見積の依頼メール受信" }],
      minutes: "",
    },
    {
      id: "d4", client: "カエデ建設", title: "勤怠管理SaaS導入支援", stage: "リード",
      amount: 900000, probability: 20, owner: "営業 山本", nextAction: "初回ヒアリングの日程打診",
      contact: "総務部 中村様",
      history: [{ date: "2026-07-10", text: "Web問い合わせから起票(AI自動登録)" }],
      minutes: "",
    },
    {
      id: "d5", client: "ミナト物流", title: "配送管理アプリ追加開発", stage: "契約待ち",
      amount: 3200000, probability: 90, owner: "社長", nextAction: "契約書押印(先方は押印済み)",
      contact: "営業推進部 川口様",
      history: [
        { date: "2026-07-04", text: "契約書ドラフト送付(AI自動生成)" },
        { date: "2026-06-25", text: "見積承認・受注内示" },
      ],
      minutes: "",
    },
  ],

  dealStages: ["リード", "商談中", "見積提出", "契約待ち", "受注"],

  /* ===== AI秘書のクイック質問 ===== */
  assistantChips: [
    "今日やることは?",
    "危険案件を教えて",
    "今月の売上状況は?",
    "キャッシュフローは大丈夫?",
    "エンジニアの空きは?",
  ],
};

/* ===== 表示ユーティリティ ===== */
function yen(v) {
  return "¥" + v.toLocaleString("ja-JP");
}
function man(v) {
  // 万円単位の数値 → "1,280万円"
  return v.toLocaleString("ja-JP") + "万円";
}
function yenToMan(v) {
  return man(Math.round(v / 10000));
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
