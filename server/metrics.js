'use strict';
/* KPI・危険検知・今日の優先タスクを実データから計算する。
   設計原則: 社長に表示する優先タスクは最大3件。AIは判断、RPAは入力。 */
const { db, getSettings } = require('./db');

const ACTIVE_STAGES = ['リード', '商談中', '見積提出', '契約待ち'];

function today() { return new Date().toISOString().slice(0, 10); }
function thisMonth() { return today().slice(0, 7); }
function daysBetween(a, b) { return Math.floor((new Date(b) - new Date(a)) / 86400000); }

/* ===== KPI(設計書 §KPI) ===== */
function kpis() {
  const m = thisMonth();
  const prevM = new Date(); prevM.setMonth(prevM.getMonth() - 1);
  const pm = prevM.toISOString().slice(0, 7);
  const t = today();

  const won = db.prepare('SELECT COALESCE(SUM(amount),0) AS v FROM deals WHERE won_at IS NOT NULL AND substr(won_at,1,7) = ?');
  const invoiced = db.prepare('SELECT COALESCE(SUM(amount),0) AS v FROM invoices WHERE issued_at IS NOT NULL AND substr(issued_at,1,7) = ?');
  const paid = db.prepare('SELECT COALESCE(SUM(amount),0) AS v FROM invoices WHERE paid_at IS NOT NULL AND substr(paid_at,1,7) = ?');
  const stageCount = db.prepare('SELECT COUNT(*) AS n FROM deals WHERE stage = ?');

  const overdueUnpaid = db.prepare(
    'SELECT COALESCE(SUM(amount),0) AS v, COUNT(*) AS n FROM invoices WHERE issued_at IS NOT NULL AND paid_at IS NULL AND due_date IS NOT NULL AND due_date < ?'
  ).get(t);

  return {
    orderAmount: won.get(m).v,
    orderAmountPrev: won.get(pm).v,
    invoicedAmount: invoiced.get(m).v,
    paidAmount: paid.get(m).v,
    paidAmountPrev: paid.get(pm).v,
    unpaidAmount: overdueUnpaid.v,
    unpaidCount: overdueUnpaid.n,
    dealCount: db.prepare(`SELECT COUNT(*) AS n FROM deals WHERE stage IN (${ACTIVE_STAGES.map(() => '?').join(',')})`).all(...ACTIVE_STAGES)[0].n,
    quoteCount: stageCount.get('見積提出').n,
    awaitingContract: stageCount.get('契約待ち').n,
    inDevelopment: db.prepare("SELECT COUNT(*) AS n FROM projects WHERE status = '開発中'").get().n,
    activeEngineers: db.prepare('SELECT COUNT(*) AS n FROM engineers WHERE active = 1 AND load > 0').get().n,
  };
}

/* ===== 月次売上(直近nヶ月: 受注/請求/入金) ===== */
function monthlySales(n = 6) {
  const months = [];
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - (n - 1));
  for (let i = 0; i < n; i++) {
    const ym = d.toISOString().slice(0, 7);
    months.push({ ym, month: `${Number(ym.slice(5, 7))}月` });
    d.setMonth(d.getMonth() + 1);
  }
  const won = db.prepare('SELECT COALESCE(SUM(amount),0) AS v FROM deals WHERE won_at IS NOT NULL AND substr(won_at,1,7) = ?');
  const inv = db.prepare('SELECT COALESCE(SUM(amount),0) AS v FROM invoices WHERE issued_at IS NOT NULL AND substr(issued_at,1,7) = ?');
  const paid = db.prepare('SELECT COALESCE(SUM(amount),0) AS v FROM invoices WHERE paid_at IS NOT NULL AND substr(paid_at,1,7) = ?');
  return months.map(({ ym, month }) => ({
    month,
    order: Math.round(won.get(ym).v / 10000),
    invoice: Math.round(inv.get(ym).v / 10000),
    paid: Math.round(paid.get(ym).v / 10000),
  }));
}

/* ===== 営業パイプライン ===== */
function pipeline() {
  const m = thisMonth();
  const rows = db.prepare(
    "SELECT stage, COUNT(*) AS count, COALESCE(SUM(amount),0) AS amount FROM deals WHERE stage != '失注' AND (won_at IS NULL OR substr(won_at,1,7) = ?) GROUP BY stage"
  ).all(m);
  const byStage = Object.fromEntries(rows.map((r) => [r.stage, r]));
  return [...ACTIVE_STAGES, '受注'].map((stage) => ({
    stage,
    count: byStage[stage]?.count || 0,
    amount: Math.round((byStage[stage]?.amount || 0) / 10000),
  }));
}

/* ===== 危険検知(納期遅延・未回収・未請求・放置・滞留)
   メール由来のルール(返信漏れ・クレーム)は Phase 5 で追加する ===== */
function detectRisks() {
  const s = getSettings();
  if (s.riskDetect !== '1') return [];
  const t = today();
  const risks = [];

  // 納期遅延: 開発中で期限超過
  for (const p of db.prepare("SELECT * FROM projects WHERE status = '開発中' AND deadline IS NOT NULL AND deadline < ? AND progress < 100").all(t)) {
    const days = daysBetween(p.deadline, t);
    risks.push({
      level: days >= 5 ? 'critical' : 'serious', type: '納期遅延',
      text: `${p.name}(${p.client})が納期を${days}日超過(進捗${p.progress}%)`,
      link: `#/projects/${p.id}`, sort: 100 + days,
    });
  }
  // 未回収: 発行済み・未入金・期日超過
  const unpaidDays = Number(s.unpaidDays) || 7;
  for (const r of db.prepare(`
      SELECT i.*, p.name AS pname, p.client FROM invoices i JOIN projects p ON p.id = i.project_id
      WHERE i.issued_at IS NOT NULL AND i.paid_at IS NULL AND i.due_date IS NOT NULL AND i.due_date < ?`).all(t)) {
    const days = daysBetween(r.due_date, t);
    risks.push({
      level: days >= unpaidDays ? 'critical' : 'warning', type: '未回収',
      text: `${r.client} 請求書 ${r.number}(${Math.round(r.amount / 10000)}万円)が支払期日${days}日超過`,
      link: `#/projects/${r.project_id}`, sort: 90 + days,
    });
  }
  // 未請求: ドラフトのまま3日以上の請求書
  for (const r of db.prepare(`
      SELECT i.*, p.name AS pname, p.client FROM invoices i JOIN projects p ON p.id = i.project_id
      WHERE i.issued_at IS NULL AND date(i.created_at) <= date('now', '-3 days')`).all()) {
    risks.push({
      level: 'serious', type: '未請求',
      text: `${r.client}(${r.pname})の請求書 ${r.number}(${Math.round(r.amount / 10000)}万円)が未発行のままです`,
      link: `#/projects/${r.project_id}`, sort: 60,
    });
  }
  // 放置案件: 開発中なのに2週間更新がない
  for (const p of db.prepare("SELECT * FROM projects WHERE status = '開発中' AND datetime(updated_at) <= datetime('now', '-14 days')").all()) {
    const days = daysBetween(p.updated_at.slice(0, 10), t);
    risks.push({
      level: 'warning', type: '放置案件',
      text: `${p.name}(${p.client})が${days}日間更新されていません`,
      link: `#/projects/${p.id}`, sort: 25 + Math.min(days, 30),
    });
  }
  // 契約未締結: 契約待ちの案件が1週間以上滞留
  for (const p of db.prepare("SELECT * FROM projects WHERE status = '契約待ち' AND datetime(updated_at) <= datetime('now', '-7 days')").all()) {
    const days = daysBetween(p.updated_at.slice(0, 10), t);
    risks.push({
      level: 'serious', type: '契約未締結',
      text: `${p.name}(${p.client})の契約が${days}日間未締結のままです`,
      link: `#/projects/${p.id}`, sort: 55 + Math.min(days, 30),
    });
  }
  // フォロー滞留: 活動が止まっている進行中の商談
  const noReplyDays = Number(s.noReplyDays) || 3;
  for (const d of db.prepare(`
      SELECT * FROM deals WHERE stage IN ('商談中','見積提出','契約待ち')
      AND datetime(last_activity_at) <= datetime('now', ?)`).all(`-${noReplyDays} days`)) {
    const days = daysBetween(d.last_activity_at.slice(0, 10), t);
    risks.push({
      level: 'warning', type: '未返信・滞留',
      text: `${d.client}「${d.title}」の対応が${days}日止まっています(${d.stage})`,
      link: `#/deals/${d.id}`, sort: 30 + days,
    });
  }
  return risks.sort((a, b) => b.sort - a.sort).map(({ sort, ...r }) => r);
}

/* ===== 今日やること(最大3件・優先度スコアリング) =====
   Phase 5 で緊急メール由来の候補を追加する */
function todayTasks() {
  const t = today();
  const candidates = [];

  for (const r of db.prepare(`
      SELECT pt.*, p.name AS pname, p.client, p.amount FROM project_tasks pt
      JOIN projects p ON p.id = pt.project_id WHERE pt.done = 0`).all()) {
    let score = 10 + Math.min(r.amount / 1000000, 10);
    let why = `${r.client}「${r.pname}」のタスク`;
    if (r.due) {
      const dd = daysBetween(t, r.due);
      if (dd < 0) { score += 60; why = `期限を${-dd}日超過。${why}`; }
      else if (dd === 0) { score += 50; why = `期限は本日。${why}`; }
      else if (dd <= 3) { score += 30 - dd * 5; why = `期限まであと${dd}日。${why}`; }
    }
    candidates.push({ id: r.id, kind: 'task', title: r.title, why, link: `#/projects/${r.project_id}`, score });
  }

  // 契約待ちの商談は成約直前 → 高優先
  for (const d of db.prepare("SELECT * FROM deals WHERE stage = '契約待ち'").all()) {
    const days = daysBetween(d.last_activity_at.slice(0, 10), t);
    candidates.push({
      id: null, kind: 'deal', title: `${d.client}「${d.title}」の契約手続き`,
      why: `契約待ち${days}日目・${Math.round(d.amount / 10000)}万円。長期化は失注リスク`,
      link: `#/deals/${d.id}`, score: 45 + Math.min(days * 2, 20) + Math.min(d.amount / 1000000, 10),
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 3).map(({ score, ...c }) => c); // 設計原則: 最大3件
}

/* ===== AIからの提案(データドリブンのルール群) =====
   顧客リレーション分析由来の提案は Phase 5 で追加する */
function suggestions() {
  const out = [];
  const k = kpis();

  const hot = db.prepare('SELECT * FROM engineers WHERE active = 1 AND load >= 90').all();
  const free = db.prepare('SELECT * FROM engineers WHERE active = 1 AND load < 50').all();
  if (hot.length && free.length) {
    out.push({
      icon: '⚠️',
      text: `${hot.map((e) => e.name).join('・')}の稼働が90%超です。${free.map((e) => e.name).join('・')}のアサインを検討してください。`,
      reason: '稼働状況の偏りを検知',
    });
  }
  if (k.unpaidAmount > 0) {
    out.push({
      icon: '💰',
      text: `期日超過の未回収が${Math.round(k.unpaidAmount / 10000)}万円(${k.unpaidCount}件)あります。督促を優先してください。`,
      reason: '請求・入金データの差分',
    });
  }
  const quotes = db.prepare("SELECT * FROM deals WHERE stage = '見積提出' ORDER BY amount DESC LIMIT 1").get();
  if (quotes) {
    out.push({
      icon: '🎯',
      text: `見積提出中の最大案件は${quotes.client}「${quotes.title}」(${Math.round(quotes.amount / 10000)}万円・確度${quotes.probability}%)。フォローで受注確度を高めましょう。`,
      reason: 'パイプライン金額の分析',
    });
  }
  const drafts = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(amount),0) AS v FROM invoices WHERE issued_at IS NULL').get();
  if (drafts.n > 0) {
    out.push({
      icon: '📄',
      text: `未発行の請求書が${drafts.n}件(${Math.round(drafts.v / 10000)}万円)あります。今週発行すれば来月の入金見込みが改善します。`,
      reason: '請求書ドラフトの滞留検知',
    });
  }
  // 営業アドバイス: 見積提出後のフォロー
  const quoteDays = Number(getSettings().quoteFollowDays) || 5;
  for (const d of db.prepare(`SELECT * FROM deals WHERE stage = '見積提出' AND datetime(last_activity_at) <= datetime('now', ?) LIMIT 2`).all(`-${quoteDays} days`)) {
    const days = Math.floor((Date.now() - new Date(d.last_activity_at)) / 86400000);
    out.push({
      icon: '📞',
      text: `${d.client}「${d.title}」は見積提出後${days}日経過しています。フォロー連絡を推奨します。返信が遅れると失注リスクが高まります。`,
      reason: '見積提出後の経過日数',
    });
  }
  return out.slice(0, 4);
}

module.exports = { kpis, monthlySales, pipeline, detectRisks, todayTasks, suggestions };
