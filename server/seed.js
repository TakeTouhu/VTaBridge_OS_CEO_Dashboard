"use strict";
/* サンプルデータ投入スクリプト(デモ・動作確認用)
   実行: npm run seed        … 空のDBにのみ投入
        npm run seed -- --force … 既存の業務データを削除して再投入 */
const { db } = require("./db");

const force = process.argv.includes("--force");
const hasData = db.prepare("SELECT COUNT(*) AS n FROM projects").get().n > 0;
if (hasData && !force) {
  console.log("既にデータが存在します。再投入する場合は --force を付けてください。");
  process.exit(0);
}
if (force) {
  db.exec("DELETE FROM deal_activities; DELETE FROM deals; DELETE FROM invoices; DELETE FROM project_events; DELETE FROM project_tasks; DELETE FROM projects; DELETE FROM engineers; DELETE FROM documents;");
}

function d(offsetDays) {
  const t = new Date();
  t.setDate(t.getDate() + offsetDays);
  return t.toISOString().slice(0, 10);
}
function monthOffset(offsetMonths, day = 15) {
  const t = new Date();
  t.setDate(1);
  t.setMonth(t.getMonth() + offsetMonths);
  t.setDate(day);
  return t.toISOString().slice(0, 10);
}

const tx = db.transaction(() => {
  /* エンジニア */
  const insEng = db.prepare("INSERT INTO engineers (name, current_project, load) VALUES (?, ?, ?)");
  for (const [name, project, load] of [
    ["佐藤", "ECサイト構築", 95], ["鈴木", "在庫管理システム刷新", 80], ["高橋", "ECサイト構築", 90],
    ["田中", "業務アプリ保守", 60], ["伊藤", "AIチャットボット導入", 75], ["渡辺", "", 20],
  ]) insEng.run(name, project, load);

  /* 案件 */
  const insProj = db.prepare(`INSERT INTO projects (name, client, status, amount, deadline, progress, pm, engineers) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const p1 = insProj.run("在庫管理システム刷新", "ヒカリ商事", "開発中", 6800000, d(75), 45, "鈴木", "鈴木、田中").lastInsertRowid;
  const p2 = insProj.run("配送管理アプリ追加開発", "ミナト物流", "契約待ち", 3200000, d(120), 0, "伊藤", "伊藤").lastInsertRowid;
  const p3 = insProj.run("AIチャットボット導入", "株式会社アオバ", "開発中", 4200000, d(45), 62, "伊藤", "伊藤、渡辺").lastInsertRowid;
  const p4 = insProj.run("ECサイト構築", "サクラ製作所", "開発中", 5400000, d(-6), 70, "佐藤", "佐藤、高橋").lastInsertRowid;
  const p5 = insProj.run("業務アプリ保守 2026年度", "ヒカリ商事", "保守", 2400000, d(260), 33, "田中", "田中").lastInsertRowid;

  /* タスク */
  const insTask = db.prepare("INSERT INTO project_tasks (project_id, title, due, done, source) VALUES (?, ?, ?, ?, ?)");
  insTask.run(p1, "基本設計レビュー", d(-3), 1, "manual");
  insTask.run(p1, "在庫API結合テスト", d(11), 0, "minutes");
  insTask.run(p1, "中間検収の日程調整", d(7), 0, "minutes");
  insTask.run(p2, "契約書押印(社長対応)", d(0), 0, "manual");
  insTask.run(p3, "FAQ学習データ最終確認", d(5), 0, "minutes");
  insTask.run(p4, "未回収の督促(AI文面確認)", d(0), 0, "ai");
  insTask.run(p4, "決済モジュール結合テスト", d(4), 0, "manual");
  insTask.run(p4, "リスケ案を顧客へ提示", d(2), 0, "ai");
  insTask.run(p5, "月次定期報告書の送付", d(18), 0, "manual");

  /* 請求書(月次売上・未回収・未請求の計算元) */
  const insInv = db.prepare("INSERT INTO invoices (project_id, number, amount, issued_at, due_date, paid_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  // 過去〜今月の請求・入金履歴
  insInv.run(p5, "INV-2026-0201", 800000, monthOffset(-4), monthOffset(-3), monthOffset(-3, 28), monthOffset(-4));
  insInv.run(p1, "INV-2026-0210", 3400000, monthOffset(-2), monthOffset(-1), monthOffset(-1, 27), monthOffset(-2));
  insInv.run(p3, "INV-2026-0215", 2100000, monthOffset(-1), monthOffset(0), monthOffset(0, 5), monthOffset(-1));
  insInv.run(p4, "INV-2026-0220", 1420000, monthOffset(-1, 5), monthOffset(-1, 25), monthOffset(-1, 24), monthOffset(-1, 5));
  insInv.run(p5, "INV-2026-0225", 800000, monthOffset(0, 1), d(20), d(-2), monthOffset(0, 1));
  // 未回収: 支払期日を14日超過
  insInv.run(p4, "INV-2026-0231", 1280000, d(-30), d(-14), null, d(-30));
  // 未請求: 検収済みなのにドラフトのまま
  insInv.run(p2, "INV-2026-0233", 450000, null, null, null, d(-9));

  /* 商談 */
  const insDeal = db.prepare(`INSERT INTO deals (client, title, stage, amount, probability, owner, contact, next_action, minutes_note, last_activity_at, won_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const dl1 = insDeal.run("株式会社アオバ", "社内ポータル刷新", "見積提出", 4200000, 70, "社長", "情報システム部 森様",
    "見積の最終承認と提出(本日期限)",
    "・ポータルは3ヶ月後リリース希望\n・予算上限は450万円\n・SSOは必須要件\n・保守も併せて提案してほしい",
    new Date().toISOString(), null).lastInsertRowid;
  insDeal.run("ツバキ食品", "受発注システム新規開発", "商談中", 7500000, 40, "営業 山本", "購買部 井上様",
    "デモ環境の提示(来週訪問)", "・FAX受注が月800件、入力工数が課題\n・来期予算で検討", new Date().toISOString(), null);
  const dl3 = insDeal.run("ヒカリ商事", "在庫管理 追加モジュール", "商談中", 1800000, 60, "営業 山本", "物流企画課 岡田様",
    "追加見積依頼メールへの返信", "", new Date(Date.now() - 5 * 86400000).toISOString(), null).lastInsertRowid;
  insDeal.run("カエデ建設", "勤怠管理SaaS導入支援", "リード", 900000, 20, "営業 山本", "総務部 中村様",
    "初回ヒアリングの日程打診", "", new Date().toISOString(), null);
  const dl5 = insDeal.run("ミナト物流", "配送管理アプリ追加開発", "契約待ち", 3200000, 90, "社長", "営業推進部 川口様",
    "契約書押印(先方は押印済み)", "", new Date(Date.now() - 9 * 86400000).toISOString(), null).lastInsertRowid;
  // 今月の受注実績(受注額KPIとパイプラインの「受注」)
  insDeal.run("サクラ製作所", "ECサイト構築 追加フェーズ", "受注", 5400000, 100, "社長", "企画部 林様", "", "", new Date().toISOString(), monthOffset(0, 3));
  insDeal.run("ヒカリ商事", "帳票電子化", "受注", 7400000, 100, "営業 山本", "総務部 原様", "", "", new Date().toISOString(), monthOffset(0, 8));

  const insAct = db.prepare("INSERT INTO deal_activities (deal_id, date, text) VALUES (?, ?, ?)");
  insAct.run(dl1, d(-1), "AIが見積書ドラフトを自動生成");
  insAct.run(dl1, d(-4), "要件ヒアリング実施。議事録からTODO 5件抽出");
  insAct.run(dl3, d(-5), "先方より追加見積の依頼メール受信");
  insAct.run(dl5, d(-9), "契約書ドラフト送付(AI自動生成)");

  const insEvent = db.prepare("INSERT INTO project_events (project_id, date, text) VALUES (?, ?, ?)");
  insEvent.run(p4, d(-1), "危険検知: 納期遅延・未回収を検出");
  insEvent.run(p1, d(-3), "AI議事録: 定例MTGからTODO 2件を自動抽出");
});
tx();

console.log("サンプルデータを投入しました。");
