"use strict";
const { db, getSettings, setSetting, nextDocNumber } = require("./db");
const metrics = require("./metrics");
const ai = require("./ai");
const { requireAuth } = require("./auth");

/* ===== バリデーションヘルパ ===== */
function str(v, { max = 500, required = false } = {}) {
  if (v === undefined || v === null || v === "") {
    if (required) throw httpError(400, "必須項目が未入力です");
    return "";
  }
  if (typeof v !== "string") throw httpError(400, "文字列を指定してください");
  return v.slice(0, max).trim();
}
function int(v, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = 0 } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}
function dateOrNull(v) {
  if (!v) return null;
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

const PROJECT_STATUSES = ["開発中", "契約待ち", "保守", "完了"];
const DEAL_STAGES = ["リード", "商談中", "見積提出", "契約待ち", "受注", "失注"];

function projectWithDetails(p) {
  return {
    ...p,
    tasks: db.prepare("SELECT * FROM project_tasks WHERE project_id = ? ORDER BY done, due IS NULL, due, id").all(p.id),
    events: db.prepare("SELECT * FROM project_events WHERE project_id = ? ORDER BY date DESC, id DESC LIMIT 30").all(p.id),
    invoices: db.prepare("SELECT * FROM invoices WHERE project_id = ? ORDER BY id DESC").all(p.id),
  };
}

function addProjectEvent(projectId, text) {
  db.prepare("INSERT INTO project_events (project_id, text) VALUES (?, ?)").run(projectId, text);
}
function touchDeal(dealId) {
  db.prepare("UPDATE deals SET last_activity_at = datetime('now') WHERE id = ?").run(dealId);
}

function registerApiRoutes(app) {
  /* すべてのAPIは認証必須 */
  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/auth/")) return next();
    return requireAuth(req, res, next);
  });

  /* ===== ダッシュボード(ホーム画面を1リクエストで構成) ===== */
  app.get("/api/dashboard", (req, res) => {
    res.json({
      kpi: metrics.kpis(),
      todayTasks: metrics.todayTasks(),
      risks: metrics.detectRisks(),
      monthlySales: metrics.monthlySales(6),
      pipeline: metrics.pipeline(),
      engineers: db.prepare("SELECT * FROM engineers WHERE active = 1 ORDER BY load DESC").all(),
      suggestions: metrics.suggestions(),
      ai: ai.aiStatus(),
    });
  });

  app.get("/api/analytics", (req, res) => {
    const n = int(req.query.months, { min: 1, max: 24, fallback: 6 });
    res.json({
      kpi: metrics.kpis(),
      monthlySales: metrics.monthlySales(n),
    });
  });

  /* ===== 案件 ===== */
  app.get("/api/projects", (req, res) => {
    res.json({
      projects: db.prepare(`
        SELECT p.*,
          (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id AND t.done = 0) AS open_tasks
        FROM projects p ORDER BY p.updated_at DESC`).all(),
    });
  });

  app.post("/api/projects", (req, res) => {
    const b = req.body || {};
    const name = str(b.name, { max: 200, required: true });
    const client = str(b.client, { max: 200, required: true });
    const status = PROJECT_STATUSES.includes(b.status) ? b.status : "契約待ち";
    const info = db.prepare(`
      INSERT INTO projects (name, client, status, amount, deadline, progress, pm, engineers, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(name, client, status, int(b.amount), dateOrNull(b.deadline),
        int(b.progress, { max: 100 }), str(b.pm, { max: 100 }), str(b.engineers, { max: 300 }), str(b.note, { max: 2000 }));
    addProjectEvent(info.lastInsertRowid, "案件を登録しました");
    res.status(201).json({ project: projectWithDetails(db.prepare("SELECT * FROM projects WHERE id = ?").get(info.lastInsertRowid)) });
  });

  app.get("/api/projects/:id", (req, res) => {
    const p = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
    if (!p) throw httpError(404, "案件が見つかりません");
    res.json({ project: projectWithDetails(p) });
  });

  app.patch("/api/projects/:id", (req, res) => {
    const p = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
    if (!p) throw httpError(404, "案件が見つかりません");
    const b = req.body || {};
    const updated = {
      name: b.name !== undefined ? str(b.name, { max: 200, required: true }) : p.name,
      client: b.client !== undefined ? str(b.client, { max: 200, required: true }) : p.client,
      status: b.status !== undefined && PROJECT_STATUSES.includes(b.status) ? b.status : p.status,
      amount: b.amount !== undefined ? int(b.amount) : p.amount,
      deadline: b.deadline !== undefined ? dateOrNull(b.deadline) : p.deadline,
      progress: b.progress !== undefined ? int(b.progress, { max: 100 }) : p.progress,
      pm: b.pm !== undefined ? str(b.pm, { max: 100 }) : p.pm,
      engineers: b.engineers !== undefined ? str(b.engineers, { max: 300 }) : p.engineers,
      note: b.note !== undefined ? str(b.note, { max: 2000 }) : p.note,
    };
    db.prepare(`UPDATE projects SET name=?, client=?, status=?, amount=?, deadline=?, progress=?, pm=?, engineers=?, note=?, updated_at=datetime('now') WHERE id=?`)
      .run(updated.name, updated.client, updated.status, updated.amount, updated.deadline,
        updated.progress, updated.pm, updated.engineers, updated.note, p.id);
    if (b.status && b.status !== p.status) addProjectEvent(p.id, `状態を「${p.status}」→「${b.status}」に変更`);
    if (b.progress !== undefined && int(b.progress, { max: 100 }) !== p.progress) addProjectEvent(p.id, `進捗を${updated.progress}%に更新`);
    res.json({ project: projectWithDetails(db.prepare("SELECT * FROM projects WHERE id = ?").get(p.id)) });
  });

  /* タスク */
  app.post("/api/projects/:id/tasks", (req, res) => {
    const p = db.prepare("SELECT id FROM projects WHERE id = ?").get(req.params.id);
    if (!p) throw httpError(404, "案件が見つかりません");
    const tasks = Array.isArray(req.body?.tasks) ? req.body.tasks : [req.body || {}];
    if (!tasks.length) throw httpError(400, "タスクがありません");
    const ins = db.prepare("INSERT INTO project_tasks (project_id, title, due, source) VALUES (?, ?, ?, ?)");
    const source = ["manual", "minutes", "ai"].includes(req.body?.source) ? req.body.source : "manual";
    const created = [];
    for (const t of tasks.slice(0, 50)) {
      const title = str(t.title, { max: 300, required: true });
      created.push(ins.run(p.id, title, dateOrNull(t.due), source).lastInsertRowid);
    }
    if (source === "minutes") addProjectEvent(p.id, `AI議事録からTODO ${created.length}件を自動登録`);
    res.status(201).json({ created: created.length });
  });

  app.patch("/api/tasks/:id", (req, res) => {
    const t = db.prepare("SELECT * FROM project_tasks WHERE id = ?").get(req.params.id);
    if (!t) throw httpError(404, "タスクが見つかりません");
    const done = req.body?.done !== undefined ? (req.body.done ? 1 : 0) : t.done;
    db.prepare("UPDATE project_tasks SET done = ? WHERE id = ?").run(done, t.id);
    res.json({ ok: true });
  });

  app.delete("/api/tasks/:id", (req, res) => {
    db.prepare("DELETE FROM project_tasks WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
  });

  /* 請求書: 作成(ドラフト)→ 発行 → 入金消込 */
  app.post("/api/projects/:id/invoices", (req, res) => {
    const p = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
    if (!p) throw httpError(404, "案件が見つかりません");
    const amount = int(req.body?.amount, { min: 1 });
    if (!amount) throw httpError(400, "金額を指定してください");
    const number = nextDocNumber("invoice");
    db.prepare("INSERT INTO documents (type, number, content) VALUES ('invoice', ?, ?)")
      .run(number, JSON.stringify({ projectId: p.id, amount }));
    const issueNow = Boolean(req.body?.issue);
    const info = db.prepare("INSERT INTO invoices (project_id, number, amount, issued_at, due_date) VALUES (?, ?, ?, ?, ?)")
      .run(p.id, number, amount, issueNow ? new Date().toISOString().slice(0, 10) : null, dateOrNull(req.body?.due_date));
    addProjectEvent(p.id, `請求書 ${number}(${Math.round(amount / 10000)}万円)を${issueNow ? "発行" : "作成(未発行)"}`);
    res.status(201).json({ invoice: db.prepare("SELECT * FROM invoices WHERE id = ?").get(info.lastInsertRowid) });
  });

  app.patch("/api/invoices/:id", (req, res) => {
    const inv = db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id);
    if (!inv) throw httpError(404, "請求書が見つかりません");
    const b = req.body || {};
    if (b.action === "issue" && !inv.issued_at) {
      db.prepare("UPDATE invoices SET issued_at = date('now'), due_date = COALESCE(?, due_date) WHERE id = ?")
        .run(dateOrNull(b.due_date), inv.id);
      addProjectEvent(inv.project_id, `請求書 ${inv.number} を発行`);
    } else if (b.action === "paid" && !inv.paid_at) {
      if (!inv.issued_at) throw httpError(400, "未発行の請求書は入金消込できません");
      db.prepare("UPDATE invoices SET paid_at = date('now') WHERE id = ?").run(inv.id);
      addProjectEvent(inv.project_id, `請求書 ${inv.number}(${Math.round(inv.amount / 10000)}万円)の入金を確認`);
    } else {
      throw httpError(400, "不正な操作です");
    }
    res.json({ invoice: db.prepare("SELECT * FROM invoices WHERE id = ?").get(inv.id) });
  });

  /* ===== 商談 ===== */
  app.get("/api/deals", (req, res) => {
    res.json({
      deals: db.prepare("SELECT * FROM deals ORDER BY CASE stage WHEN '失注' THEN 1 ELSE 0 END, amount DESC").all(),
      pipeline: metrics.pipeline(),
    });
  });

  app.post("/api/deals", (req, res) => {
    const b = req.body || {};
    const client = str(b.client, { max: 200, required: true });
    const title = str(b.title, { max: 200, required: true });
    const stage = DEAL_STAGES.includes(b.stage) ? b.stage : "リード";
    const info = db.prepare(`
      INSERT INTO deals (client, title, stage, amount, probability, owner, contact, next_action, won_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(client, title, stage, int(b.amount), int(b.probability, { max: 100, fallback: 20 }),
        str(b.owner, { max: 100 }), str(b.contact, { max: 200 }), str(b.next_action, { max: 300 }),
        stage === "受注" ? new Date().toISOString().slice(0, 10) : null);
    db.prepare("INSERT INTO deal_activities (deal_id, text) VALUES (?, ?)").run(info.lastInsertRowid, "商談を登録しました");
    res.status(201).json({ deal: db.prepare("SELECT * FROM deals WHERE id = ?").get(info.lastInsertRowid) });
  });

  app.get("/api/deals/:id", (req, res) => {
    const d = db.prepare("SELECT * FROM deals WHERE id = ?").get(req.params.id);
    if (!d) throw httpError(404, "商談が見つかりません");
    res.json({
      deal: d,
      activities: db.prepare("SELECT * FROM deal_activities WHERE deal_id = ? ORDER BY date DESC, id DESC LIMIT 30").all(d.id),
      stages: DEAL_STAGES.filter((s) => s !== "失注"),
    });
  });

  app.patch("/api/deals/:id", (req, res) => {
    const d = db.prepare("SELECT * FROM deals WHERE id = ?").get(req.params.id);
    if (!d) throw httpError(404, "商談が見つかりません");
    const b = req.body || {};
    const stage = b.stage !== undefined && DEAL_STAGES.includes(b.stage) ? b.stage : d.stage;
    const updated = {
      stage,
      amount: b.amount !== undefined ? int(b.amount) : d.amount,
      probability: b.probability !== undefined ? int(b.probability, { max: 100 }) : d.probability,
      next_action: b.next_action !== undefined ? str(b.next_action, { max: 300 }) : d.next_action,
      minutes_note: b.minutes_note !== undefined ? str(b.minutes_note, { max: 5000 }) : d.minutes_note,
      won_at: d.won_at,
    };
    let createdProjectId = null;
    if (stage === "受注" && d.stage !== "受注") {
      updated.won_at = new Date().toISOString().slice(0, 10);
      // 受注 → 案件を自動作成(入力作業は極力自動化)
      const info = db.prepare(`
        INSERT INTO projects (name, client, status, amount, deadline, pm)
        VALUES (?, ?, '契約待ち', ?, NULL, ?)`)
        .run(d.title, d.client, updated.amount, str(b.pm, { max: 100 }));
      createdProjectId = info.lastInsertRowid;
      db.prepare("UPDATE deals SET project_id = ? WHERE id = ?").run(createdProjectId, d.id);
      addProjectEvent(createdProjectId, `商談「${d.title}」の受注により案件を自動作成`);
    }
    db.prepare("UPDATE deals SET stage=?, amount=?, probability=?, next_action=?, minutes_note=?, won_at=? WHERE id=?")
      .run(updated.stage, updated.amount, updated.probability, updated.next_action, updated.minutes_note, updated.won_at, d.id);
    if (stage !== d.stage) {
      db.prepare("INSERT INTO deal_activities (deal_id, text) VALUES (?, ?)").run(d.id, `ステージを「${d.stage}」→「${stage}」に変更`);
    }
    touchDeal(d.id);
    res.json({ deal: db.prepare("SELECT * FROM deals WHERE id = ?").get(d.id), createdProjectId });
  });

  app.post("/api/deals/:id/activities", (req, res) => {
    const d = db.prepare("SELECT id FROM deals WHERE id = ?").get(req.params.id);
    if (!d) throw httpError(404, "商談が見つかりません");
    const text = str(req.body?.text, { max: 500, required: true });
    db.prepare("INSERT INTO deal_activities (deal_id, text) VALUES (?, ?)").run(d.id, text);
    touchDeal(d.id);
    res.status(201).json({ ok: true });
  });

  /* ===== AI ===== */
  app.post("/api/ai/extract", async (req, res) => {
    const text = str(req.body?.text, { max: 20000, required: true });
    res.json(await ai.extractTodos(text));
  });

  app.post("/api/ai/chat", async (req, res) => {
    const question = str(req.body?.question, { max: 2000, required: true });
    const history = Array.isArray(req.body?.history) ? req.body.history.slice(-10) : [];
    res.json(await ai.chat(question, history));
  });

  /* ===== 書類作成(番号採番して保存) ===== */
  app.post("/api/documents", (req, res) => {
    const b = req.body || {};
    const type = ["quote", "contract", "invoice"].includes(b.type) ? b.type : null;
    if (!type) throw httpError(400, "書類の種類が不正です");
    const dealId = b.deal_id ? int(b.deal_id) : null;
    const deal = dealId ? db.prepare("SELECT * FROM deals WHERE id = ?").get(dealId) : null;
    if (dealId && !deal) throw httpError(404, "商談が見つかりません");
    const number = nextDocNumber(type);
    const s = getSettings();
    const content = {
      client: deal ? deal.client : str(b.client, { max: 200 }),
      title: deal ? deal.title : str(b.title, { max: 200 }),
      contact: deal ? deal.contact : "",
      amount: deal ? deal.amount : int(b.amount),
      company: { name: s.companyName, address: s.companyAddress, bank: s.bankInfo },
    };
    db.prepare("INSERT INTO documents (deal_id, type, number, content) VALUES (?, ?, ?, ?)")
      .run(dealId, type, number, JSON.stringify(content));
    if (deal) {
      const label = { quote: "見積書", contract: "契約書", invoice: "請求書" }[type];
      db.prepare("INSERT INTO deal_activities (deal_id, text) VALUES (?, ?)").run(deal.id, `${label} ${number} を作成`);
      touchDeal(deal.id);
      if (type === "quote" && ["リード", "商談中"].includes(deal.stage)) {
        db.prepare("UPDATE deals SET stage = '見積提出' WHERE id = ?").run(deal.id);
      }
    }
    res.status(201).json({ number, content, type });
  });

  app.get("/api/documents", (req, res) => {
    res.json({
      documents: db.prepare(`
        SELECT d.id, d.type, d.number, d.created_at, dl.client, dl.title
        FROM documents d LEFT JOIN deals dl ON dl.id = d.deal_id
        ORDER BY d.id DESC LIMIT 50`).all(),
    });
  });

  /* ===== エンジニア ===== */
  app.get("/api/engineers", (req, res) => {
    res.json({ engineers: db.prepare("SELECT * FROM engineers WHERE active = 1 ORDER BY id").all() });
  });
  app.post("/api/engineers", (req, res) => {
    const name = str(req.body?.name, { max: 100, required: true });
    const info = db.prepare("INSERT INTO engineers (name, current_project, load) VALUES (?, ?, ?)")
      .run(name, str(req.body?.current_project, { max: 200 }), int(req.body?.load, { max: 100 }));
    res.status(201).json({ engineer: db.prepare("SELECT * FROM engineers WHERE id = ?").get(info.lastInsertRowid) });
  });
  app.patch("/api/engineers/:id", (req, res) => {
    const e = db.prepare("SELECT * FROM engineers WHERE id = ?").get(req.params.id);
    if (!e) throw httpError(404, "エンジニアが見つかりません");
    const b = req.body || {};
    db.prepare("UPDATE engineers SET name = ?, current_project = ?, load = ?, active = ? WHERE id = ?")
      .run(
        b.name !== undefined ? str(b.name, { max: 100, required: true }) : e.name,
        b.current_project !== undefined ? str(b.current_project, { max: 200 }) : e.current_project,
        b.load !== undefined ? int(b.load, { max: 100 }) : e.load,
        b.active !== undefined ? (b.active ? 1 : 0) : e.active,
        e.id);
    res.json({ ok: true });
  });

  /* ===== 設定 ===== */
  app.get("/api/settings", (req, res) => {
    res.json({ settings: getSettings(), ai: ai.aiStatus() });
  });
  app.patch("/api/settings", (req, res) => {
    const b = req.body || {};
    for (const [k, v] of Object.entries(b)) {
      try { setSetting(k, str(String(v), { max: 300 })); }
      catch { throw httpError(400, `不明な設定項目: ${k}`); }
    }
    res.json({ settings: getSettings() });
  });
}

module.exports = { registerApiRoutes, httpError };
