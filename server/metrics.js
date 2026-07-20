'use strict';

const { db } = require('./db');

function today() { return new Date().toISOString().slice(0, 10); }
function thisMonth() { return today().slice(0, 7); }
function daysBetween(a, b) { return Math.floor((new Date(b) - new Date(a)) / 86400000); }

const ACTIVE_STAGES = ['リード', '商談中', '見積提出', '契約待ち'];

/* 失注を除く6ステージの件数・金額(万円)。受注は当月のみ */
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

module.exports = { pipeline, todayTasks };
