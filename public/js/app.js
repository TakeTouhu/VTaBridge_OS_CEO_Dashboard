/* VTaBridge OS - CEO Dashboard: ルーター + 画面(API駆動)
   画面: ホーム / 案件一覧 / 案件詳細 / 商談 / 商談詳細 / 売上分析 / AI議事録取込 / 書類作成 / AI秘書 / 設定 */
"use strict";

const $main = document.getElementById("main");
const $app = document.getElementById("app");
const $login = document.getElementById("login-screen");
let currentUser = null;

/* ===== 認証フロー ===== */
Api.setUnauthorizedHandler(showLogin);

function showLogin() {
  currentUser = null;
  $app.hidden = true;
  $login.hidden = false;
}
function showApp() {
  $login.hidden = true;
  $app.hidden = false;
  document.getElementById("user-info").textContent = `${currentUser.name}(${currentUser.email})`;
  route();
}

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errBox = document.getElementById("login-error");
  errBox.hidden = true;
  try {
    const { user } = await Api.post("/api/auth/login", {
      email: document.getElementById("login-email").value,
      password: document.getElementById("login-password").value,
    });
    currentUser = user;
    showApp();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.hidden = false;
  }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await Api.post("/api/auth/logout").catch(() => {});
  showLogin();
});

async function boot() {
  try {
    const { user } = await Api.get("/api/auth/me");
    currentUser = user;
    showApp();
  } catch {
    showLogin();
  }
}
if (document.readyState !== "loading") boot();
else window.addEventListener("DOMContentLoaded", boot);

/* ===== ルーター ===== */
const routes = {
  home: renderHome, projects: renderProjects, project: renderProjectDetail,
  deals: renderDeals, deal: renderDealDetail, analytics: renderAnalytics,
  mail: renderMail, maildetail: renderMailDetail,
  minutes: renderMinutes, documents: renderDocuments, assistant: renderAssistant, settings: renderSettings,
};

async function route() {
  if (!currentUser) return;
  const hash = location.hash.replace(/^#\//, "") || "home";
  const [name, param] = hash.split("?")[0].split("/");
  let view = name;
  if (name === "projects" && param) view = "project";
  if (name === "deals" && param) view = "deal";
  if (name === "mail" && param) view = "maildetail";
  const fn = routes[view] || renderHome;
  const navKey = view === "project" ? "projects" : view === "deal" ? "deals" : view === "maildetail" ? "mail" : view;
  document.querySelectorAll("#nav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.route === navKey);
  });
  $main.innerHTML = `<div class="empty" style="padding-top:60px;">読み込み中…</div>`;
  try {
    await fn(param);
  } catch (err) {
    if (err.status === 401) return;
    $main.innerHTML = pageHead("エラー", "") + `<div class="card"><div class="form-error">${esc(err.message)}</div></div>`;
  }
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

/* ===== 共通部品 ===== */
function pageHead(title, sub, crumb) {
  return `<div class="page-head">
    ${crumb ? `<div class="crumb">${crumb}</div>` : ""}
    <h1>${esc(title)}</h1>
    ${sub ? `<div class="sub">${esc(sub)}</div>` : ""}
  </div>`;
}

function riskBadge(level) {
  const map = { critical: ["badge-critical", "重大"], serious: ["badge-serious", "要対応"], warning: ["badge-warning", "注意"] };
  const [cls, label] = map[level] || ["badge-neutral", level];
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}
function statusBadge(status) {
  const map = { "開発中": "badge-neutral", "契約待ち": "badge-warning", "保守": "badge-good", "完了": "badge-good" };
  return `<span class="badge ${map[status] || "badge-neutral"}">${esc(status)}</span>`;
}
function statTile(label, value, delta, up) {
  return `<div class="stat-tile">
    <div class="label">${esc(label)}</div>
    <div class="value">${esc(value)}</div>
    ${delta ? `<div class="delta ${up === true ? "up" : up === false ? "down" : ""}" style="${up === undefined ? "color:var(--text-muted);" : ""}">${esc(delta)}</div>` : ""}
  </div>`;
}
function aiBadge(source, model) {
  return source === "ai"
    ? `<span class="ai-badge">🤖 AI(${esc(model || "")})</span>`
    : `<span class="ai-badge" style="background:var(--page); color:var(--text-muted);">⚙ ルールベース</span>`;
}

/* モーダルフォーム。fields: [{key,label,type,options,value,required,wide}] → Promise<object|null> */
function modalForm(title, fields, submitLabel = "保存") {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <form class="card modal">
        <h2>${esc(title)}</h2>
        <div class="form-grid">
        ${fields.map((f) => `
          <label class="form-label" style="${f.wide ? "grid-column: 1 / -1;" : ""}">${esc(f.label)}${f.required ? " *" : ""}
            ${f.type === "select"
              ? `<select class="input" name="${f.key}">${f.options.map((o) => `<option value="${esc(o)}" ${o === f.value ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`
              : f.type === "textarea"
                ? `<textarea class="input" name="${f.key}" rows="3">${esc(f.value ?? "")}</textarea>`
                : `<input class="input" name="${f.key}" type="${f.type || "text"}" value="${esc(f.value ?? "")}" ${f.required ? "required" : ""} ${f.type === "number" ? 'min="0"' : ""}>`}
          </label>`).join("")}
        </div>
        <div class="modal-actions">
          <button type="button" class="btn" data-cancel>キャンセル</button>
          <button type="submit" class="btn btn-primary">${esc(submitLabel)}</button>
        </div>
      </form>`;
    document.body.appendChild(backdrop);
    const form = backdrop.querySelector("form");
    const close = (val) => { backdrop.remove(); resolve(val); };
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(null); });
    backdrop.querySelector("[data-cancel]").addEventListener("click", () => close(null));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const out = {};
      for (const f of fields) {
        const el = form.elements[f.key];
        out[f.key] = f.type === "number" ? Number(el.value || 0) : el.value;
      }
      close(out);
    });
    form.querySelector("input, select, textarea")?.focus();
  });
}

/* ============================================================
   ホーム
============================================================ */
async function renderHome() {
  const d = await Api.get("/api/dashboard");
  const k = d.kpi;
  const pct = (cur, prev) => prev > 0 ? ((cur - prev) / prev * 100).toFixed(1) : null;
  const paidDelta = pct(k.paidAmount, k.paidAmountPrev);
  const orderDelta = pct(k.orderAmount, k.orderAmountPrev);

  $main.innerHTML = `
    ${pageHead(`おはようございます、${currentUser.name}`, todayStr() + " — 今日の状況とAIの提案をまとめました")}

    <div class="grid grid-3 section">
      <div class="card" style="grid-column: span 2;">
        <h2>✅ 今日やること <span class="muted">(最大3件・優先度順)</span></h2>
        <div class="task-list" id="today-tasks">
          ${d.todayTasks.length ? d.todayTasks.map((t, i) => `
            <div class="task-item">
              <span class="task-rank">${i + 1}</span>
              <div>
                <div class="t-title"><a href="${esc(t.link)}" style="color:inherit;">${esc(t.title)}</a></div>
                <div class="t-why">💡 ${esc(t.why)}</div>
              </div>
              ${t.kind === "task" ? `<button class="task-done-btn" data-task="${t.id}">完了</button>` : ""}
            </div>`).join("") : `<div class="empty">未完了の優先タスクはありません 🎉</div>`}
        </div>
      </div>
      <div class="card">
        <div class="hero-label">今月の入金額</div>
        <div class="hero-figure">${esc(yenToMan(k.paidAmount))}</div>
        ${paidDelta !== null ? `<div class="hero-delta ${paidDelta >= 0 ? "delta up" : "delta down"}">${paidDelta >= 0 ? "▲" : "▼"} 前月比 ${Math.abs(paidDelta)}%</div>` : ""}
        <div class="muted" style="margin-top:10px;">期日超過の未回収 ${esc(yenToMan(k.unpaidAmount))} — <a href="#/analytics">売上分析へ</a></div>
      </div>
    </div>

    <div class="kpi-row section">
      ${statTile("受注額(今月)", yenToMan(k.orderAmount), orderDelta !== null ? `${orderDelta >= 0 ? "▲" : "▼"} 前月比 ${Math.abs(orderDelta)}%` : "", orderDelta !== null ? orderDelta >= 0 : undefined)}
      ${statTile("請求額(今月)", yenToMan(k.invoicedAmount))}
      ${statTile("未回収金額", yenToMan(k.unpaidAmount), k.unpaidCount ? `要対応 ${k.unpaidCount}件` : "問題なし", k.unpaidCount ? false : true)}
      ${statTile("商談件数", k.dealCount + " 件", `見積提出 ${k.quoteCount} / 契約待ち ${k.awaitingContract}`)}
      ${statTile("稼働エンジニア", k.activeEngineers + " 名", `開発中案件 ${k.inDevelopment} 件`)}
    </div>

    <div class="grid grid-2 section">
      <div class="card">
        <h2>🚨 危険案件 <a class="more" href="#/settings">検知ルール</a></h2>
        ${d.risks.length ? d.risks.map((r) => `
          <a class="risk-item" href="${esc(r.link)}" style="color:inherit;">
            ${riskBadge(r.level)}
            <div><div style="font-weight:600; font-size:12px; color:var(--text-muted);">${esc(r.type)}</div>${esc(r.text)}</div>
          </a>`).join("") : `<div class="empty">検知された危険案件はありません 🎉</div>`}
      </div>
      <div class="card">
        <h2>🤖 AIからの提案</h2>
        ${d.suggestions.length ? d.suggestions.map((s) => `
          <div class="ai-item">
            <span class="ai-icon">${s.icon}</span>
            <div class="a-text">${esc(s.text)}<div class="a-reason">根拠: ${esc(s.reason)}</div></div>
          </div>`).join("") : `<div class="empty">現在、提案はありません</div>`}
        <div style="margin-top:12px;"><a class="btn btn-sm" href="#/assistant">AI秘書に相談する →</a></div>
      </div>
    </div>

    <div class="grid grid-2 section">
      <div class="card">
        <h2>📈 売上サマリー <a class="more" href="#/analytics">詳細分析</a></h2>
        <div class="chart-box" id="home-sales-chart"></div>
      </div>
      <div class="card">
        <h2>🔽 営業パイプライン <a class="more" href="#/deals">商談一覧</a></h2>
        <div class="chart-box" id="home-pipeline-chart"></div>
        <div class="muted" style="margin-top:6px;">金額ベース(万円)。ホバーで件数を表示。</div>
      </div>
    </div>

    <div class="card section">
      <h2>👩‍💻 エンジニア稼働状況 <a class="more" href="#/settings">編集</a></h2>
      ${d.engineers.map((e) => `
        <div class="meter-row">
          <span class="meter-name">${esc(e.name)}</span>
          <div class="meter-track"><div class="meter-fill ${e.load >= 90 ? "hot" : e.load >= 80 ? "warm" : ""}" style="width:${e.load}%"></div></div>
          <span class="meter-val">${e.load}% <span class="muted">${esc(e.current_project || "(アサイン待ち)")}</span></span>
        </div>`).join("")}
    </div>
  `;

  document.querySelectorAll(".task-done-btn").forEach((b) => {
    b.addEventListener("click", async () => {
      await Api.patch(`/api/tasks/${b.dataset.task}`, { done: true });
      toast("タスクを完了しました");
      renderHome();
    });
  });
  drawSalesChart(document.getElementById("home-sales-chart"), d.monthlySales, 200);
  drawPipeline(document.getElementById("home-pipeline-chart"), d.pipeline);
}

function seriesColors() {
  const cs = getComputedStyle(document.documentElement);
  return [cs.getPropertyValue("--series-1").trim(), cs.getPropertyValue("--series-2").trim(), cs.getPropertyValue("--series-3").trim()];
}
function drawSalesChart(elm, rows, height) {
  const [c1, c2, c3] = seriesColors();
  Charts.line(elm, {
    labels: rows.map((r) => r.month),
    height,
    format: (v) => man(v),
    series: [
      { name: "受注", color: c1, values: rows.map((r) => r.order) },
      { name: "請求", color: c2, values: rows.map((r) => r.invoice) },
      { name: "入金", color: c3, values: rows.map((r) => r.paid) },
    ],
  });
}
function drawPipeline(elm, pipeline) {
  const cs = getComputedStyle(document.documentElement);
  const ramp = ["--seq-250", "--seq-350", "--seq-450", "--seq-550", "--seq-650"].map((v) => cs.getPropertyValue(v).trim());
  Charts.barH(elm, {
    format: (v) => man(v),
    items: pipeline.map((p, i) => ({ label: p.stage, value: p.amount, color: ramp[i % ramp.length], sub: `${p.count}件` })),
  });
}

/* ============================================================
   案件一覧 / 案件詳細
============================================================ */
async function renderProjects() {
  const { projects } = await Api.get("/api/projects");
  $main.innerHTML = `
    ${pageHead("案件一覧", "進行中の案件と請求・入金の状況")}
    <div class="filter-row">
      <div class="seg" id="proj-filter">
        ${["すべて", "開発中", "契約待ち", "保守", "完了"].map((s, i) => `<button class="${i === 0 ? "on" : ""}" data-f="${s}">${s}</button>`).join("")}
      </div>
      <input class="input" id="proj-search" type="search" placeholder="案件名・顧客名で検索" style="min-width:220px;">
      <button class="btn btn-primary" id="proj-new" style="margin-left:auto;">+ 新規案件</button>
    </div>
    <div class="card"><div class="table-wrap">
      <table class="data">
        <thead><tr>
          <th>案件名</th><th>顧客</th><th>状態</th><th class="num">受注額</th>
          <th>納期</th><th>進捗</th><th class="num">未完了タスク</th>
        </tr></thead>
        <tbody id="proj-body"></tbody>
      </table>
    </div></div>
  `;

  let filter = "すべて", q = "";
  const body = document.getElementById("proj-body");
  function draw() {
    const rows = projects.filter((p) =>
      (filter === "すべて" || p.status === filter) &&
      (q === "" || p.name.includes(q) || p.client.includes(q)));
    body.innerHTML = rows.length ? rows.map((p) => `
      <tr class="clickable" data-id="${p.id}">
        <td style="font-weight:600;">${esc(p.name)}</td>
        <td>${esc(p.client)}</td>
        <td>${statusBadge(p.status)}</td>
        <td class="num">${esc(yenToMan(p.amount))}</td>
        <td>${esc(p.deadline || "-")}</td>
        <td style="min-width:110px;">
          <div class="progress-track"><div class="progress-fill" style="width:${p.progress}%"></div></div>
          <span class="muted">${p.progress}%</span>
        </td>
        <td class="num">${p.open_tasks || 0}</td>
      </tr>`).join("") : `<tr><td colspan="7" class="empty">該当する案件がありません</td></tr>`;
    body.querySelectorAll("tr.clickable").forEach((tr) =>
      tr.addEventListener("click", () => { location.hash = "#/projects/" + tr.dataset.id; }));
  }
  document.getElementById("proj-filter").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    filter = b.dataset.f;
    document.querySelectorAll("#proj-filter button").forEach((x) => x.classList.toggle("on", x === b));
    draw();
  });
  document.getElementById("proj-search").addEventListener("input", (e) => { q = e.target.value.trim(); draw(); });
  document.getElementById("proj-new").addEventListener("click", async () => {
    const v = await modalForm("新規案件", [
      { key: "name", label: "案件名", required: true, wide: true },
      { key: "client", label: "顧客名", required: true },
      { key: "status", label: "状態", type: "select", options: ["契約待ち", "開発中", "保守"], value: "契約待ち" },
      { key: "amount", label: "受注額(円)", type: "number", value: 0 },
      { key: "deadline", label: "納期", type: "date" },
      { key: "pm", label: "PM" },
      { key: "engineers", label: "担当エンジニア" },
    ], "登録");
    if (!v) return;
    const { project } = await Api.post("/api/projects", v);
    toast("案件を登録しました");
    location.hash = "#/projects/" + project.id;
  });
  draw();
}

async function renderProjectDetail(id) {
  const { project: p } = await Api.get(`/api/projects/${id}`);
  const today = new Date().toISOString().slice(0, 10);
  const invoiced = p.invoices.filter((i) => i.issued_at).reduce((a, i) => a + i.amount, 0);
  const paid = p.invoices.filter((i) => i.paid_at).reduce((a, i) => a + i.amount, 0);
  const overdue = p.invoices.filter((i) => i.issued_at && !i.paid_at && i.due_date && i.due_date < today);

  $main.innerHTML = `
    ${pageHead(p.name, p.client, `<a href="#/projects">案件一覧</a> / 案件詳細`)}
    ${overdue.length ? `<div class="card section" style="border-color: var(--status-critical);">
      <h2>🚨 危険検知</h2>${riskBadge("critical")} <span style="margin-left:8px;">未回収の請求書が${overdue.length}件(${esc(yenToMan(overdue.reduce((a, i) => a + i.amount, 0)))})あります</span>
    </div>` : ""}
    <div class="detail-grid section">
      <div style="display:flex; flex-direction:column; gap:16px;">
        <div class="card">
          <h2>📋 概要 <button class="btn btn-sm more" id="proj-edit">編集</button></h2>
          <dl class="kv">
            <dt>状態</dt><dd>${statusBadge(p.status)}</dd>
            <dt>受注額</dt><dd>${esc(yen(p.amount))}</dd>
            <dt>請求済</dt><dd>${esc(yen(invoiced))} <span class="muted">(残 ${esc(yen(Math.max(p.amount - invoiced, 0)))})</span></dd>
            <dt>入金済</dt><dd>${esc(yen(paid))} ${invoiced > paid ? `<span class="badge badge-warning">未入金 ${esc(yen(invoiced - paid))}</span>` : ""}</dd>
            <dt>納期</dt><dd>${esc(p.deadline || "-")}</dd>
            <dt>PM</dt><dd>${esc(p.pm || "-")}</dd>
            <dt>担当</dt><dd>${esc(p.engineers || "-")}</dd>
            ${p.note ? `<dt>メモ</dt><dd>${esc(p.note)}</dd>` : ""}
          </dl>
          <div style="margin-top:14px;">
            <div class="muted" style="margin-bottom:4px;">進捗 ${p.progress}%</div>
            <div class="progress-track"><div class="progress-fill" style="width:${p.progress}%"></div></div>
          </div>
        </div>

        <div class="card">
          <h2>✅ タスク <button class="btn btn-sm more" id="task-add">+ 追加</button></h2>
          <div id="task-list">
            ${p.tasks.length ? p.tasks.map((t) => `
              <div class="todo-extract">
                <input type="checkbox" data-task="${t.id}" ${t.done ? "checked" : ""}>
                <div style="flex:1;">
                  <div style="${t.done ? "text-decoration:line-through; opacity:.6;" : "font-weight:600;"}">${esc(t.title)}
                    ${t.source !== "manual" ? `<span class="ai-badge">🤖 ${t.source === "minutes" ? "議事録" : "AI"}</span>` : ""}
                  </div>
                  <div class="muted">期限: ${esc(t.due || "未設定")}</div>
                </div>
                <button class="task-done-btn" data-del="${t.id}">削除</button>
              </div>`).join("") : `<div class="empty">タスクはありません</div>`}
          </div>
        </div>

        <div class="card">
          <h2>💴 請求書 <button class="btn btn-sm more" id="inv-add">+ 作成</button></h2>
          ${p.invoices.length ? `<div class="table-wrap"><table class="data">
            <thead><tr><th>番号</th><th class="num">金額</th><th>発行日</th><th>支払期日</th><th>状態</th><th></th></tr></thead>
            <tbody>
              ${p.invoices.map((i) => {
                const state = i.paid_at ? `<span class="badge badge-good">入金済 ${esc(i.paid_at)}</span>`
                  : i.issued_at ? (i.due_date && i.due_date < today
                    ? `<span class="badge badge-critical">期日超過</span>` : `<span class="badge badge-neutral">入金待ち</span>`)
                  : `<span class="badge badge-warning">未発行</span>`;
                const action = !i.issued_at ? `<button class="btn btn-sm" data-issue="${i.id}">発行</button>`
                  : !i.paid_at ? `<button class="btn btn-sm" data-paid="${i.id}">入金消込</button>` : "";
                return `<tr>
                  <td>${esc(i.number)}</td><td class="num">${esc(yen(i.amount))}</td>
                  <td>${esc(i.issued_at || "-")}</td><td>${esc(i.due_date || "-")}</td>
                  <td>${state}</td><td>${action}</td>
                </tr>`;
              }).join("")}
            </tbody>
          </table></div>` : `<div class="empty">請求書はまだありません</div>`}
        </div>
      </div>

      <div style="display:flex; flex-direction:column; gap:16px;">
        <div class="card">
          <h2>🕐 タイムライン</h2>
          <ul class="timeline">
            ${p.events.length ? p.events.map((e) => `<li><div class="tl-date">${esc(e.date)}</div>${esc(e.text)}</li>`).join("") : `<div class="empty">履歴はありません</div>`}
          </ul>
        </div>
        <div class="card">
          <h2>⚡ アクション</h2>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <a class="btn" href="#/minutes">📝 議事録を取り込む</a>
            <a class="btn" href="#/assistant">💬 AI秘書に相談</a>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("proj-edit").addEventListener("click", async () => {
    const v = await modalForm("案件を編集", [
      { key: "name", label: "案件名", required: true, value: p.name, wide: true },
      { key: "client", label: "顧客名", required: true, value: p.client },
      { key: "status", label: "状態", type: "select", options: ["契約待ち", "開発中", "保守", "完了"], value: p.status },
      { key: "amount", label: "受注額(円)", type: "number", value: p.amount },
      { key: "deadline", label: "納期", type: "date", value: p.deadline || "" },
      { key: "progress", label: "進捗(%)", type: "number", value: p.progress },
      { key: "pm", label: "PM", value: p.pm },
      { key: "engineers", label: "担当エンジニア", value: p.engineers },
      { key: "note", label: "メモ", type: "textarea", value: p.note, wide: true },
    ]);
    if (!v) return;
    await Api.patch(`/api/projects/${p.id}`, v);
    toast("案件を更新しました");
    renderProjectDetail(id);
  });

  document.getElementById("task-add").addEventListener("click", async () => {
    const v = await modalForm("タスクを追加", [
      { key: "title", label: "タスク内容", required: true, wide: true },
      { key: "due", label: "期限", type: "date" },
    ], "追加");
    if (!v) return;
    await Api.post(`/api/projects/${p.id}/tasks`, v);
    renderProjectDetail(id);
  });

  document.querySelectorAll('#task-list input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", async () => {
      await Api.patch(`/api/tasks/${cb.dataset.task}`, { done: cb.checked });
      renderProjectDetail(id);
    });
  });
  document.querySelectorAll("#task-list [data-del]").forEach((b) => {
    b.addEventListener("click", async () => {
      await Api.del(`/api/tasks/${b.dataset.del}`);
      renderProjectDetail(id);
    });
  });

  document.getElementById("inv-add").addEventListener("click", async () => {
    const v = await modalForm("請求書を作成", [
      { key: "amount", label: "金額(円)", type: "number", required: true },
      { key: "due_date", label: "支払期日", type: "date" },
      { key: "issue", label: "発行", type: "select", options: ["すぐに発行する", "ドラフトとして保存"], value: "すぐに発行する" },
    ], "作成");
    if (!v || !v.amount) return;
    await Api.post(`/api/projects/${p.id}/invoices`, { amount: v.amount, due_date: v.due_date, issue: v.issue === "すぐに発行する" });
    toast("請求書を作成しました");
    renderProjectDetail(id);
  });
  document.querySelectorAll("[data-issue]").forEach((b) => {
    b.addEventListener("click", async () => {
      await Api.patch(`/api/invoices/${b.dataset.issue}`, { action: "issue" });
      toast("請求書を発行しました");
      renderProjectDetail(id);
    });
  });
  document.querySelectorAll("[data-paid]").forEach((b) => {
    b.addEventListener("click", async () => {
      await Api.patch(`/api/invoices/${b.dataset.paid}`, { action: "paid" });
      toast("入金を消込しました");
      renderProjectDetail(id);
    });
  });
}

/* ============================================================
   商談一覧 / 商談詳細
============================================================ */
async function renderDeals() {
  const { deals, pipeline } = await Api.get("/api/deals");
  $main.innerHTML = `
    ${pageHead("商談", "営業パイプラインの管理")}
    <div class="filter-row">
      <button class="btn btn-primary" id="deal-new" style="margin-left:auto;">+ 新規商談</button>
    </div>
    <div class="card section">
      <h2>🔽 パイプライン(金額ベース)</h2>
      <div class="chart-box" id="deals-pipeline"></div>
    </div>
    <div class="card"><div class="table-wrap">
      <table class="data">
        <thead><tr>
          <th>顧客 / 案件名</th><th>ステージ</th><th class="num">見込金額</th><th class="num">確度</th><th>次のアクション</th><th>担当</th>
        </tr></thead>
        <tbody>
          ${deals.map((d) => `
            <tr class="clickable" data-id="${d.id}">
              <td><span style="font-weight:600;">${esc(d.client)}</span><br><span class="muted">${esc(d.title)}</span></td>
              <td><span class="badge ${d.stage === "受注" ? "badge-good" : d.stage === "失注" ? "badge-critical" : "badge-neutral"}">${esc(d.stage)}</span></td>
              <td class="num">${esc(yenToMan(d.amount))}</td>
              <td class="num">${d.probability}%</td>
              <td>${esc(d.next_action || "-")}</td>
              <td>${esc(d.owner || "-")}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div></div>
  `;
  drawPipeline(document.getElementById("deals-pipeline"), pipeline);
  document.querySelectorAll("tr.clickable").forEach((tr) =>
    tr.addEventListener("click", () => { location.hash = "#/deals/" + tr.dataset.id; }));
  document.getElementById("deal-new").addEventListener("click", async () => {
    const v = await modalForm("新規商談", [
      { key: "client", label: "顧客名", required: true },
      { key: "title", label: "案件名", required: true },
      { key: "stage", label: "ステージ", type: "select", options: ["リード", "商談中", "見積提出", "契約待ち"], value: "リード" },
      { key: "amount", label: "見込金額(円)", type: "number", value: 0 },
      { key: "probability", label: "確度(%)", type: "number", value: 20 },
      { key: "owner", label: "担当" },
      { key: "contact", label: "先方窓口" },
      { key: "next_action", label: "次のアクション", wide: true },
    ], "登録");
    if (!v) return;
    const { deal } = await Api.post("/api/deals", v);
    toast("商談を登録しました");
    location.hash = "#/deals/" + deal.id;
  });
}

async function renderDealDetail(id) {
  const { deal: d, activities, stages } = await Api.get(`/api/deals/${id}`);
  const stageIdx = stages.indexOf(d.stage);

  $main.innerHTML = `
    ${pageHead(`${d.client} — ${d.title}`, "", `<a href="#/deals">商談</a> / 商談詳細`)}
    <div class="detail-grid section">
      <div style="display:flex; flex-direction:column; gap:16px;">
        <div class="card">
          <h2>📋 商談情報 <button class="btn btn-sm more" id="deal-edit">編集</button></h2>
          <div class="stage-flow">
            ${stages.map((s, i) => `<span class="stage-pill ${i < stageIdx ? "past" : i === stageIdx ? "now" : ""}">${esc(s)}</span>`).join("")}
            ${d.stage === "失注" ? `<span class="stage-pill" style="background:var(--status-critical); color:#fff;">失注</span>` : ""}
          </div>
          <dl class="kv" style="margin-top:12px;">
            <dt>見込金額</dt><dd>${esc(yen(d.amount))}</dd>
            <dt>受注確度</dt><dd>${d.probability}%</dd>
            <dt>担当</dt><dd>${esc(d.owner || "-")}</dd>
            <dt>先方窓口</dt><dd>${esc(d.contact || "-")}</dd>
            ${d.won_at ? `<dt>受注日</dt><dd>${esc(d.won_at)}</dd>` : ""}
          </dl>
          ${d.next_action ? `<div style="margin-top:14px; padding:12px; border-radius:10px; background:var(--accent-wash);">
            <div style="font-size:12px; font-weight:700; color:var(--accent);">次のアクション</div>
            ${esc(d.next_action)}
          </div>` : ""}
          <div class="inline-edit" style="margin-top:14px;">
            <span class="muted">ステージ変更:</span>
            <select class="input" id="stage-select">
              ${[...stages, "失注"].map((s) => `<option ${s === d.stage ? "selected" : ""}>${esc(s)}</option>`).join("")}
            </select>
            <button class="btn btn-sm btn-primary" id="stage-apply">適用</button>
            ${d.project_id ? `<a class="btn btn-sm" href="#/projects/${d.project_id}">📁 案件を開く</a>` : ""}
          </div>
        </div>
        ${d.minutes_note ? `<div class="card">
          <h2>📝 直近のAI議事録メモ</h2>
          <div style="white-space:pre-wrap; font-size:13px; color:var(--text-secondary);">${esc(d.minutes_note)}</div>
          <div style="margin-top:10px;"><a class="btn btn-sm" href="#/minutes">議事録からTODOを抽出 →</a></div>
        </div>` : ""}
      </div>
      <div style="display:flex; flex-direction:column; gap:16px;">
        <div class="card">
          <h2>🕐 活動履歴 <button class="btn btn-sm more" id="act-add">+ 記録</button></h2>
          <ul class="timeline">
            ${activities.length ? activities.map((e) => `<li><div class="tl-date">${esc(e.date)}</div>${esc(e.text)}</li>`).join("") : `<div class="empty">履歴はありません</div>`}
          </ul>
        </div>
        <div class="card">
          <h2>⚡ アクション</h2>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <a class="btn" href="#/documents?deal=${d.id}&type=quote">📄 見積書を作成</a>
            <a class="btn" href="#/documents?deal=${d.id}&type=contract">📄 契約書を作成</a>
            <a class="btn" href="#/assistant">💬 AI秘書に相談</a>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("deal-edit").addEventListener("click", async () => {
    const v = await modalForm("商談を編集", [
      { key: "amount", label: "見込金額(円)", type: "number", value: d.amount },
      { key: "probability", label: "確度(%)", type: "number", value: d.probability },
      { key: "next_action", label: "次のアクション", value: d.next_action, wide: true },
      { key: "minutes_note", label: "議事録メモ", type: "textarea", value: d.minutes_note, wide: true },
    ]);
    if (!v) return;
    await Api.patch(`/api/deals/${d.id}`, v);
    toast("商談を更新しました");
    renderDealDetail(id);
  });

  document.getElementById("stage-apply").addEventListener("click", async () => {
    const stage = document.getElementById("stage-select").value;
    if (stage === d.stage) return;
    const res = await Api.patch(`/api/deals/${d.id}`, { stage });
    if (res.createdProjectId) {
      toast("受注おめでとうございます!案件を自動作成しました");
      location.hash = "#/projects/" + res.createdProjectId;
    } else {
      toast("ステージを更新しました");
      renderDealDetail(id);
    }
  });

  document.getElementById("act-add").addEventListener("click", async () => {
    const v = await modalForm("活動を記録", [{ key: "text", label: "内容", required: true, wide: true }], "記録");
    if (!v) return;
    await Api.post(`/api/deals/${d.id}/activities`, v);
    renderDealDetail(id);
  });
}

/* ============================================================
   メール(AI振り分け・返信ドラフト・返信漏れ監視)
============================================================ */
function urgencyBadge(u) {
  const map = { "高": "badge-critical", "中": "badge-warning", "低": "badge-neutral" };
  return `<span class="badge ${map[u] || "badge-neutral"}">緊急度${esc(u)}</span>`;
}
function categoryBadge(c) {
  const map = { "見積依頼": "badge-good", "契約相談": "badge-good", "クレーム": "badge-critical", "請求": "badge-warning", "広告": "badge-neutral", "雑談": "badge-neutral", "質問": "badge-neutral" };
  return `<span class="badge ${map[c] || "badge-neutral"}">${esc(c)}</span>`;
}
function mailStatusBadge(m) {
  if (m.status === "replied") return `<span class="badge badge-good">返信済</span>`;
  if (m.status === "dismissed") return `<span class="badge badge-neutral">対応不要</span>`;
  return m.needs_reply ? `<span class="badge badge-critical">未対応</span>` : `<span class="badge badge-neutral">-</span>`;
}
function fmtDateTime(s) {
  const d = new Date(s);
  return isNaN(d) ? esc(s || "-") : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

async function renderMail() {
  const load = (f, c) => Api.get(`/api/mail?filter=${f}${c ? `&category=${encodeURIComponent(c)}` : ""}`);
  let data = await load("all", "");

  $main.innerHTML = `
    ${pageHead("メール", "AIが受信メールを振り分け、返信漏れを監視します")}
    <div class="filter-row">
      <div class="seg" id="mail-filter">
        <button class="on" data-f="all">すべて</button>
        <button data-f="needs_reply">要返信</button>
        <button data-f="open">未対応のみ</button>
      </div>
      <select class="input" id="mail-category">
        <option value="">全カテゴリ</option>
        ${data.categories.map((c) => `<option>${esc(c)}</option>`).join("")}
      </select>
      <button class="btn" id="mail-sync" style="margin-left:auto;">📥 今すぐ受信</button>
      <a class="btn" href="#/settings">⚙ アカウント設定</a>
    </div>
    <div id="mail-status-line" class="muted" style="margin-bottom:10px;"></div>
    <div class="card"><div class="table-wrap">
      <table class="data">
        <thead><tr><th>受信</th><th>差出人</th><th>件名 / AI要約</th><th>カテゴリ</th><th>緊急度</th><th>状態</th></tr></thead>
        <tbody id="mail-body"></tbody>
      </table>
    </div></div>
  `;

  function statusLine() {
    const el = document.getElementById("mail-status-line");
    if (!data.accounts.length) {
      el.innerHTML = `メールアカウントが未登録です。<a href="#/settings">設定画面</a>から Gmail / Outlook を追加してください。`;
      return;
    }
    el.innerHTML = data.accounts.map((a) => {
      const state = !a.active ? `<span class="badge badge-neutral">停止中</span>`
        : a.last_error ? `<span class="badge badge-critical">エラー</span> <span class="muted">${esc(a.last_error)}</span>`
        : `<span class="badge badge-good">監視中</span>`;
      return `📮 ${esc(a.label)}(${esc(a.username)}) ${state} <span class="muted">${a.last_sync_at ? "最終受信 " + fmtDateTime(a.last_sync_at) : "未受信"}</span>`;
    }).join("<br>") + ` — 未返信 <b>${data.unrepliedCount}</b> 件`;
  }

  function drawRows() {
    const body = document.getElementById("mail-body");
    body.innerHTML = data.emails.length ? data.emails.map((m) => `
      <tr class="clickable" data-id="${m.id}" style="${m.needs_reply && m.status === "open" ? "font-weight:600;" : ""}">
        <td style="white-space:nowrap;">${fmtDateTime(m.received_at)}</td>
        <td>${esc(m.from_name || m.from_address)}</td>
        <td>${esc(m.subject)}<br><span class="muted" style="font-weight:400;">${esc(m.summary || "")}</span></td>
        <td>${categoryBadge(m.category)}</td>
        <td>${urgencyBadge(m.urgency)}</td>
        <td>${mailStatusBadge(m)}</td>
      </tr>`).join("") : `<tr><td colspan="6" class="empty">メールはありません</td></tr>`;
    body.querySelectorAll("tr.clickable").forEach((tr) =>
      tr.addEventListener("click", () => { location.hash = "#/mail/" + tr.dataset.id; }));
  }

  let filter = "all";
  async function refresh() {
    data = await load(filter, document.getElementById("mail-category").value);
    statusLine();
    drawRows();
  }
  document.getElementById("mail-filter").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    filter = b.dataset.f;
    document.querySelectorAll("#mail-filter button").forEach((x) => x.classList.toggle("on", x === b));
    refresh();
  });
  document.getElementById("mail-category").addEventListener("change", refresh);
  document.getElementById("mail-sync").addEventListener("click", async () => {
    const btn = document.getElementById("mail-sync");
    btn.disabled = true;
    btn.textContent = "受信中…";
    try {
      const r = await Api.post("/api/mail/sync");
      toast(r.fetched !== undefined ? `新着 ${r.fetched} 件を取り込みました` : "同期を実行しました");
      await refresh();
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "📥 今すぐ受信";
    }
  });
  statusLine();
  drawRows();
}

async function renderMailDetail(id) {
  const { email: m } = await Api.get(`/api/mail/${id}`);

  $main.innerHTML = `
    ${pageHead(m.subject || "(件名なし)", `${m.from_name || ""} <${m.from_address}>`, `<a href="#/mail">メール</a> / 詳細`)}
    <div class="detail-grid section">
      <div style="display:flex; flex-direction:column; gap:16px;">
        <div class="card">
          <h2>🤖 AIによる振り分け ${m.classified_by ? aiBadge(m.classified_by) : ""}</h2>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
            ${categoryBadge(m.category)} ${urgencyBadge(m.urgency)} ${mailStatusBadge(m)}
            ${m.needs_reply ? `<span class="badge badge-warning">要返信</span>` : ""}
          </div>
          ${m.summary ? `<div style="font-size:13px;"><b>要約:</b> ${esc(m.summary)}</div>` : ""}
          <dl class="kv" style="margin-top:10px;">
            <dt>受信日時</dt><dd>${fmtDateTime(m.received_at)}</dd>
            <dt>受信アカウント</dt><dd>${esc(m.account_label || "サンプル")}</dd>
            ${m.replied_at ? `<dt>対応日時</dt><dd>${fmtDateTime(m.replied_at)}</dd>` : ""}
          </dl>
        </div>
        <div class="card">
          <h2>✉️ 本文</h2>
          <div style="white-space:pre-wrap; font-size:13px; max-height:400px; overflow-y:auto;">${esc(m.body || "(本文なし)")}</div>
        </div>
        ${m.reply_text ? `<div class="card">
          <h2>✅ 送信した返信</h2>
          <div style="white-space:pre-wrap; font-size:13px; color:var(--text-secondary);">${esc(m.reply_text)}</div>
        </div>` : ""}
      </div>
      <div style="display:flex; flex-direction:column; gap:16px;">
        <div class="card">
          <h2>📝 返信ドラフト <span id="draft-src"></span></h2>
          <textarea class="input" id="draft-text" rows="14" placeholder="「AIでドラフト作成」を押すか、直接入力してください">${esc(m.draft || "")}</textarea>
          <label class="form-label" style="margin-top:8px;">AIへの指示(任意)
            <input class="input" id="draft-instructions" placeholder="例: 訪問日程を2案提示して">
          </label>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn" id="draft-gen">🤖 AIでドラフト作成</button>
            <button class="btn btn-primary" id="reply-send" ${m.status === "replied" ? "disabled" : ""}>📤 この内容で返信を送信</button>
          </div>
          <div class="muted" style="margin-top:8px;">送信前に必ず内容を確認してください(AIは自動送信しません)。</div>
        </div>
        <div class="card">
          <h2>⚡ 対応</h2>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${m.status !== "replied" ? `<button class="btn" id="mark-replied">✅ 対応済みにする(メール外で対応した)</button>` : ""}
            ${m.status !== "dismissed" ? `<button class="btn" id="mark-dismissed">🚫 対応不要にする</button>` : ""}
            ${m.status !== "open" ? `<button class="btn" id="mark-open">↩ 未対応に戻す</button>` : ""}
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("draft-gen").addEventListener("click", async () => {
    const btn = document.getElementById("draft-gen");
    btn.disabled = true;
    btn.textContent = "生成中…";
    try {
      const r = await Api.post(`/api/mail/${m.id}/draft`, { instructions: document.getElementById("draft-instructions").value });
      document.getElementById("draft-text").value = r.draft;
      document.getElementById("draft-src").innerHTML = aiBadge(r.source, r.model);
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "🤖 AIでドラフト作成";
    }
  });

  document.getElementById("reply-send").addEventListener("click", async () => {
    const text = document.getElementById("draft-text").value.trim();
    if (!text) { toast("返信内容が空です", true); return; }
    if (!confirm(`${m.from_address} 宛に返信を送信します。よろしいですか?`)) return;
    const btn = document.getElementById("reply-send");
    btn.disabled = true;
    try {
      await Api.post(`/api/mail/${m.id}/reply`, { text });
      toast("返信を送信しました");
      renderMailDetail(id);
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
    }
  });

  for (const [btnId, status] of [["mark-replied", "replied"], ["mark-dismissed", "dismissed"], ["mark-open", "open"]]) {
    document.getElementById(btnId)?.addEventListener("click", async () => {
      await Api.patch(`/api/mail/${m.id}`, { status });
      renderMailDetail(id);
    });
  }
}

/* ============================================================
   売上分析
============================================================ */
async function renderAnalytics() {
  $main.innerHTML = `
    ${pageHead("売上分析", "受注・請求・入金とキャッシュフローの推移")}
    <div class="filter-row">
      <div class="seg" id="range-seg">
        <button data-n="3">直近3ヶ月</button>
        <button class="on" data-n="6">直近6ヶ月</button>
        <button data-n="12">直近12ヶ月</button>
      </div>
    </div>
    <div class="kpi-row section" id="ana-kpis"></div>
    <div class="card section">
      <h2>📈 月次推移(万円)</h2>
      <div class="chart-box" id="ana-chart"></div>
    </div>
    <div class="card section">
      <h2>📊 月次データ(テーブル)</h2>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>月</th><th class="num">受注</th><th class="num">請求</th><th class="num">入金</th><th class="num">請求-入金差</th></tr></thead>
        <tbody id="ana-table"></tbody>
      </table></div>
    </div>
  `;

  async function draw(n) {
    const { kpi, monthlySales } = await Api.get(`/api/analytics?months=${n}`);
    const sum = (k) => monthlySales.reduce((a, r) => a + r[k], 0);
    document.getElementById("ana-kpis").innerHTML = [
      statTile(`受注額(${n}ヶ月計)`, man(sum("order"))),
      statTile(`請求額(${n}ヶ月計)`, man(sum("invoice"))),
      statTile(`入金額(${n}ヶ月計)`, man(sum("paid"))),
      statTile("未回収金額(現在)", yenToMan(kpi.unpaidAmount), kpi.unpaidCount ? `要対応 ${kpi.unpaidCount}件` : "", kpi.unpaidCount ? false : undefined),
      statTile("見積提出中", kpi.quoteCount + " 件"),
    ].join("");
    drawSalesChart(document.getElementById("ana-chart"), monthlySales, 260);
    document.getElementById("ana-table").innerHTML = monthlySales.map((r) => {
      const gap = r.invoice - r.paid;
      return `<tr>
        <td>${esc(r.month)}</td>
        <td class="num">${r.order.toLocaleString("ja-JP")}</td>
        <td class="num">${r.invoice.toLocaleString("ja-JP")}</td>
        <td class="num">${r.paid.toLocaleString("ja-JP")}</td>
        <td class="num" style="${gap > 100 ? "color:var(--status-critical); font-weight:600;" : ""}">${gap >= 0 ? "+" : ""}${gap.toLocaleString("ja-JP")}</td>
      </tr>`;
    }).join("");
  }
  document.getElementById("range-seg").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    document.querySelectorAll("#range-seg button").forEach((x) => x.classList.toggle("on", x === b));
    draw(Number(b.dataset.n));
  });
  await draw(6);
}

/* ============================================================
   AI議事録取込 → TODO抽出 → 案件登録
============================================================ */
async function renderMinutes() {
  const { projects } = await Api.get("/api/projects");
  $main.innerHTML = `
    ${pageHead("AI議事録取込", "議事録を貼り付けると、AIがTODOを抽出して案件に登録します")}
    <div class="grid grid-2">
      <div class="card">
        <h2>📝 議事録テキスト</h2>
        <textarea class="input" id="minutes-text" rows="14" placeholder="会議の議事録を貼り付けてください(音声文字起こしのテキストもOK)"></textarea>
        <div style="display:flex; gap:8px; margin-top:10px;">
          <button class="btn btn-primary" id="extract-btn">🤖 AIでTODOを抽出</button>
        </div>
      </div>
      <div class="card">
        <h2>✅ 抽出されたTODO <span id="extract-src"></span></h2>
        <div id="extract-result"><div class="empty">左のテキストから抽出すると、ここに表示されます</div></div>
      </div>
    </div>
    <div class="muted" style="margin-top:12px;">設計原則: AIは判断、RPAは入力。抽出したTODOは選択のうえワンクリックで案件に登録されます。</div>
  `;

  document.getElementById("extract-btn").addEventListener("click", async () => {
    const text = document.getElementById("minutes-text").value.trim();
    const out = document.getElementById("extract-result");
    if (!text) { out.innerHTML = `<div class="empty">議事録テキストを入力してください</div>`; return; }
    out.innerHTML = `<div class="empty">🤖 抽出中…</div>`;
    const btn = document.getElementById("extract-btn");
    btn.disabled = true;
    let res;
    try { res = await Api.post("/api/ai/extract", { text }); }
    catch (err) { out.innerHTML = `<div class="form-error">${esc(err.message)}</div>`; return; }
    finally { btn.disabled = false; }
    document.getElementById("extract-src").innerHTML = aiBadge(res.source, res.model);
    const todos = res.todos || [];
    if (!todos.length) { out.innerHTML = `<div class="empty">TODOが見つかりませんでした</div>`; return; }

    out.innerHTML = `
      ${todos.map((t, i) => `<div class="todo-extract">
        <input type="checkbox" checked id="todo-${i}">
        <div><label for="todo-${i}" style="font-weight:600;">${esc(t.title)}</label>
        ${t.due ? `<div class="muted">📅 期限: ${esc(t.due)}</div>` : ""}</div>
      </div>`).join("")}
      ${res.note ? `<div class="muted" style="margin-top:6px;">${esc(res.note)}</div>` : ""}
      <div class="filter-row" style="margin:12px 0 0;">
        <select class="input" id="target-project">
          ${projects.map((p) => `<option value="${p.id}">${esc(p.name)}(${esc(p.client)})</option>`).join("")}
          <option value="__new__">+ 新規案件として登録</option>
        </select>
        <button class="btn btn-primary" id="register-btn">案件に登録</button>
      </div>
    `;

    document.getElementById("register-btn").addEventListener("click", async () => {
      const selected = todos.filter((_, i) => document.getElementById("todo-" + i).checked);
      if (!selected.length) return;
      let target = document.getElementById("target-project").value;
      if (target === "__new__") {
        const v = await modalForm("新規案件として登録", [
          { key: "name", label: "案件名", required: true, wide: true },
          { key: "client", label: "顧客名", required: true },
        ], "作成");
        if (!v) return;
        const { project } = await Api.post("/api/projects", { ...v, status: "契約待ち" });
        target = project.id;
      }
      await Api.post(`/api/projects/${target}/tasks`, { tasks: selected, source: "minutes" });
      toast(`TODO ${selected.length}件を登録しました`);
      location.hash = "#/projects/" + target;
    });
  });
}

/* ============================================================
   書類作成(見積書・契約書・請求書)
============================================================ */
async function renderDocuments() {
  const [{ deals }, { documents }] = await Promise.all([Api.get("/api/deals"), Api.get("/api/documents")]);
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const preType = ["quote", "contract", "invoice"].includes(params.get("type")) ? params.get("type") : "quote";
  const preDeal = params.get("deal");

  $main.innerHTML = `
    ${pageHead("書類作成", "見積書・契約書・請求書を商談データから自動生成")}
    <div class="filter-row">
      <div class="seg" id="doc-seg">
        ${[["quote", "見積書"], ["contract", "契約書"], ["invoice", "請求書"]].map(([t, l]) =>
          `<button class="${t === preType ? "on" : ""}" data-t="${t}">${l}</button>`).join("")}
      </div>
      <select class="input" id="doc-target">
        ${deals.filter((d) => d.stage !== "失注").map((d) =>
          `<option value="${d.id}" ${String(d.id) === preDeal ? "selected" : ""}>${esc(d.client)} — ${esc(d.title)}</option>`).join("")}
      </select>
      <button class="btn btn-primary" id="doc-gen">ドラフト生成</button>
      <button class="btn" id="doc-print">🖨 印刷 / PDF</button>
    </div>
    <div id="doc-out"><div class="card"><div class="empty">書類の種類と商談を選び、「ドラフト生成」を押してください</div></div></div>
    <div class="card section" style="margin-top:16px;">
      <h2>🗂 発行履歴</h2>
      ${documents.length ? `<div class="table-wrap"><table class="data">
        <thead><tr><th>番号</th><th>種類</th><th>宛先</th><th>作成日時</th></tr></thead>
        <tbody>${documents.map((doc) => `<tr>
          <td>${esc(doc.number)}</td>
          <td>${esc({ quote: "見積書", contract: "契約書", invoice: "請求書" }[doc.type])}</td>
          <td>${esc(doc.client || "-")}${doc.title ? ` <span class="muted">${esc(doc.title)}</span>` : ""}</td>
          <td>${esc(doc.created_at)}</td>
        </tr>`).join("")}</tbody>
      </table></div>` : `<div class="empty">まだ書類はありません</div>`}
    </div>
  `;

  document.getElementById("doc-print").addEventListener("click", () => window.print());
  let docType = preType;
  document.getElementById("doc-seg").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    docType = b.dataset.t;
    document.querySelectorAll("#doc-seg button").forEach((x) => x.classList.toggle("on", x === b));
  });

  document.getElementById("doc-gen").addEventListener("click", async () => {
    const dealId = document.getElementById("doc-target").value;
    if (!dealId) { toast("商談がありません", true); return; }
    const res = await Api.post("/api/documents", { type: docType, deal_id: Number(dealId) });
    const c = res.content;
    const today = todayStr();
    const tax = Math.round(c.amount * 0.1);
    const titles = { quote: "御 見 積 書", contract: "業務委託契約書", invoice: "御 請 求 書" };

    let body;
    if (docType === "contract") {
      body = `
        <p style="margin-bottom:12px;">${esc(c.client)}(以下「甲」という)と ${esc(c.company.name)}(以下「乙」という)は、「${esc(c.title)}」の開発業務に関し、次のとおり契約を締結する。</p>
        <p><strong>第1条(目的)</strong> 乙は甲に対し、${esc(c.title)}の設計・開発・納品を行う。</p>
        <p><strong>第2条(委託料)</strong> 委託料は金${Number(c.amount).toLocaleString("ja-JP")}円(税別)とする。</p>
        <p><strong>第3条(納期)</strong> 別途合意するスケジュールによる。</p>
        <p><strong>第4条(検収)</strong> 甲は納品後10営業日以内に検収を行う。</p>
        <p class="muted" style="margin-top:16px;">※ 自動生成ドラフトです。法務確認のうえご利用ください。</p>`;
    } else {
      body = `
        <table>
          <tr><th>品目</th><th style="text-align:right;">金額(税別)</th></tr>
          <tr><td>${esc(c.title)} 一式</td><td style="text-align:right; font-variant-numeric:tabular-nums;">${yen(c.amount)}</td></tr>
          <tr><td>消費税(10%)</td><td style="text-align:right; font-variant-numeric:tabular-nums;">${yen(tax)}</td></tr>
          <tr><td class="total">合計</td><td class="total" style="text-align:right; font-variant-numeric:tabular-nums;">${yen(c.amount + tax)}</td></tr>
        </table>
        ${docType === "invoice"
          ? `<p>お支払期限: 発行日の翌月末 / 振込先: ${esc(c.company.bank)}</p>`
          : `<p>有効期限: 発行日より30日間 / 納期・条件は別途ご相談ください。</p>`}
        <p class="muted" style="margin-top:16px;">※ 商談データから自動生成したドラフトです。</p>`;
    }

    document.getElementById("doc-out").innerHTML = `<div class="card" style="display:flex; justify-content:center;">
      <div class="doc-preview">
        <h3>${titles[docType]}</h3>
        <div style="display:flex; justify-content:space-between; margin-bottom:16px;">
          <div><strong>${esc(c.client)} 御中</strong>${c.contact ? `<br><span style="font-size:12px;">ご担当: ${esc(c.contact)}</span>` : ""}</div>
          <div style="text-align:right; font-size:12px;">
            No. ${esc(res.number)}<br>発行日: ${today}<br><br>
            <strong>${esc(c.company.name)}</strong><br>${esc(c.company.address)}
          </div>
        </div>
        ${body}
      </div>
    </div>`;
    toast(`${{ quote: "見積書", contract: "契約書", invoice: "請求書" }[docType]} ${res.number} を作成しました`);
  });
}

/* ============================================================
   AI秘書チャット
============================================================ */
const chatHistory = [];

async function renderAssistant() {
  const chips = ["今日やることは?", "危険案件を教えて", "今月の売上状況は?", "キャッシュフローは大丈夫?", "エンジニアの空きは?"];
  const { ai } = await Api.get("/api/settings");
  $main.innerHTML = `
    ${pageHead("AI秘書", "経営データに基づいて質問に答えます")}
    <div class="card chat-box">
      <div class="chip-row">
        ${chips.map((c) => `<button class="chip">${esc(c)}</button>`).join("")}
        <span style="margin-left:auto;">${ai.enabled ? aiBadge("ai", ai.model) : aiBadge("rules")}</span>
      </div>
      <div class="chat-log" id="chat-log"></div>
      <div class="chat-input-row">
        <input class="input" id="chat-input" type="text" placeholder="AI秘書に質問する(例: 今日やることは?)" autocomplete="off">
        <button class="btn btn-primary" id="chat-send">送信</button>
      </div>
    </div>
  `;
  const log = document.getElementById("chat-log");
  const input = document.getElementById("chat-input");

  function addMsg(text, who) {
    const m = document.createElement("div");
    m.className = "msg " + who;
    m.textContent = text;
    log.appendChild(m);
    log.scrollTop = log.scrollHeight;
    return m;
  }
  for (const m of chatHistory) addMsg(m.content, m.role === "user" ? "user" : "ai");
  if (!chatHistory.length) {
    addMsg(`おはようございます、${currentUser.name}。${todayStr()}です。\n経営状況について何でも聞いてください。`, "ai");
  }

  let busy = false;
  async function ask(q) {
    q = q.trim();
    if (!q || busy) return;
    busy = true;
    addMsg(q, "user");
    input.value = "";
    const pending = addMsg("…", "ai");
    try {
      const res = await Api.post("/api/ai/chat", { question: q, history: chatHistory });
      pending.textContent = res.reply;
      chatHistory.push({ role: "user", content: q }, { role: "assistant", content: res.reply });
      if (chatHistory.length > 20) chatHistory.splice(0, chatHistory.length - 20);
    } catch (err) {
      pending.textContent = "エラー: " + err.message;
    } finally {
      busy = false;
      log.scrollTop = log.scrollHeight;
    }
  }
  document.getElementById("chat-send").addEventListener("click", () => ask(input.value));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") ask(input.value); });
  document.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => ask(c.textContent)));
}

/* ============================================================
   設定
============================================================ */
async function renderSettings() {
  const [{ settings, ai }, { engineers }, mailData] = await Promise.all([
    Api.get("/api/settings"), Api.get("/api/engineers"), Api.get("/api/mail?filter=all"),
  ]);
  const on = (k) => settings[k] === "1";

  $main.innerHTML = `
    ${pageHead("設定", "通知・連携・危険検知ルール・チーム")}
    <div class="grid grid-2">
      <div class="card">
        <h2>🔔 通知と自動化</h2>
        ${settingSwitch("notify", "朝のサマリー通知", "毎朝、今日やること・危険案件を通知", on("notify"))}
        ${settingSwitch("riskDetect", "危険検知", "未返信・未請求・納期遅延・未回収を自動検知", on("riskDetect"))}
        ${settingSwitch("crmSync", "CRM連携", "商談データをCRMと双方向同期(API優先)", on("crmSync"))}
        ${settingSwitch("autoInput", "入力自動化", "API不可のシステムのみRPAで入力を代行", on("autoInput"))}
        <div class="setting-row">
          <div><div class="s-name">AI連携</div><div class="s-desc">${ai.enabled ? `Claude API 接続中(${esc(ai.model)})` : "未接続 — サーバーの ANTHROPIC_API_KEY を設定するとAI機能が有効になります"}</div></div>
          ${ai.enabled ? `<span class="badge badge-good">接続中</span>` : `<span class="badge badge-warning">未接続</span>`}
        </div>
      </div>
      <div class="card">
        <h2>⚙️ 危険検知しきい値</h2>
        <div class="setting-row">
          <div><div class="s-name">未回収アラート</div><div class="s-desc">支払期日からの経過日数で「重大」に昇格</div></div>
          <select class="input" data-setting="unpaidDays">
            ${[3, 7, 14].map((v) => `<option value="${v}" ${Number(settings.unpaidDays) === v ? "selected" : ""}>${v}日</option>`).join("")}
          </select>
        </div>
        <div class="setting-row">
          <div><div class="s-name">商談の滞留アラート</div><div class="s-desc">活動が止まってからの日数</div></div>
          <select class="input" data-setting="noReplyDays">
            ${[1, 2, 3, 5, 7].map((v) => `<option value="${v}" ${Number(settings.noReplyDays) === v ? "selected" : ""}>${v}日</option>`).join("")}
          </select>
        </div>
        <h2 style="margin-top:20px;">🏢 自社情報(書類に印字)</h2>
        <label class="form-label">会社名<input class="input" data-setting-text="companyName" value="${esc(settings.companyName)}"></label>
        <label class="form-label">住所<input class="input" data-setting-text="companyAddress" value="${esc(settings.companyAddress)}"></label>
        <label class="form-label">振込先<input class="input" data-setting-text="bankInfo" value="${esc(settings.bankInfo)}"></label>
        <button class="btn btn-primary btn-sm" id="company-save">自社情報を保存</button>
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <h2>📧 メールアカウント(受信監視・AI振り分け) <button class="btn btn-sm more" id="mail-acc-add">+ 追加</button></h2>
      ${mailData.accounts.length ? mailData.accounts.map((a) => `
        <div class="setting-row">
          <div style="flex:1;">
            <div class="s-name">${esc(a.label)} <span class="muted">(${esc(a.username)} / ${esc(a.provider)})</span>
              ${!a.active ? `<span class="badge badge-neutral">停止中</span>` : a.last_error ? `<span class="badge badge-critical">エラー</span>` : `<span class="badge badge-good">監視中</span>`}
            </div>
            <div class="s-desc">${a.last_error ? esc(a.last_error) : a.last_sync_at ? "最終受信: " + fmtDateTime(a.last_sync_at) : "まだ受信していません"}</div>
          </div>
          <button class="btn btn-sm" data-acc-test="${a.id}">接続テスト</button>
          <button class="btn btn-sm" data-acc-edit="${a.id}">編集</button>
          <button class="btn btn-sm" data-acc-del="${a.id}">削除</button>
        </div>`).join("") : `<div class="empty">未登録です。「+ 追加」からGmail / Outlookを登録すると、受信メールのAI振り分けと返信漏れ監視が始まります。</div>`}
      <div class="grid grid-2" style="margin-top:12px;">
        <div class="setting-row">
          <div><div class="s-name">受信チェック間隔</div><div class="s-desc">新着メールを取り込む頻度</div></div>
          <select class="input" data-setting="mailPollMinutes">
            ${[5, 10, 30, 60].map((v) => `<option value="${v}" ${Number(settings.mailPollMinutes) === v ? "selected" : ""}>${v}分</option>`).join("")}
          </select>
        </div>
        <div class="setting-row">
          <div><div class="s-name">返信漏れアラート</div><div class="s-desc">要返信メールを危険案件に上げるまでの時間</div></div>
          <select class="input" data-setting="mailReplyHours">
            ${[4, 8, 24, 48, 72].map((v) => `<option value="${v}" ${Number(settings.mailReplyHours) === v ? "selected" : ""}>${v}時間</option>`).join("")}
          </select>
        </div>
      </div>
      <label class="form-label" style="margin-top:8px;">メール署名(AI返信ドラフトの末尾に使用)
        <textarea class="input" id="mail-signature" rows="3" placeholder="例: 株式会社VTaBridge 山田太郎&#10;TEL: 03-xxxx-xxxx">${esc(settings.mailSignature || "")}</textarea>
      </label>
      <button class="btn btn-primary btn-sm" id="mail-signature-save">署名を保存</button>
    </div>

    <div class="grid grid-2" style="margin-top:16px;">
      <div class="card">
        <h2>👩‍💻 エンジニア <button class="btn btn-sm more" id="eng-add">+ 追加</button></h2>
        ${engineers.map((e) => `
          <div class="setting-row">
            <div style="flex:1;">
              <div class="s-name">${esc(e.name)}</div>
              <div class="s-desc">${esc(e.current_project || "(アサイン待ち)")} — 稼働 ${e.load}%</div>
            </div>
            <button class="btn btn-sm" data-eng-edit="${e.id}">編集</button>
          </div>`).join("")}
      </div>
      <div class="card">
        <h2>🔑 パスワード変更</h2>
        <label class="form-label">現在のパスワード<input class="input" type="password" id="pw-current" autocomplete="current-password"></label>
        <label class="form-label">新しいパスワード(8文字以上)<input class="input" type="password" id="pw-next" autocomplete="new-password"></label>
        <button class="btn btn-primary btn-sm" id="pw-save">変更する</button>
        <h2 style="margin-top:24px;">📐 設計原則(v1.0)</h2>
        <ul style="padding-left:20px; color:var(--text-secondary); font-size:13px;">
          <li>社長に表示する優先タスクは最大3件</li>
          <li>API優先、API不可のみRPA</li>
          <li>AIは判断、RPAは入力</li>
          <li>入力作業は極力自動化</li>
        </ul>
      </div>
    </div>
  `;

  document.querySelectorAll(".switch input").forEach((sw) => {
    sw.addEventListener("change", async () => {
      await Api.patch("/api/settings", { [sw.dataset.key]: sw.checked ? "1" : "0" });
      toast("設定を保存しました");
    });
  });
  document.querySelectorAll("[data-setting]").forEach((sel) => {
    sel.addEventListener("change", async () => {
      await Api.patch("/api/settings", { [sel.dataset.setting]: sel.value });
      toast("設定を保存しました");
    });
  });
  document.getElementById("company-save").addEventListener("click", async () => {
    const body = {};
    document.querySelectorAll("[data-setting-text]").forEach((el) => { body[el.dataset.settingText] = el.value; });
    await Api.patch("/api/settings", body);
    toast("自社情報を保存しました");
  });

  /* メールアカウント */
  const accountFields = (a = {}) => [
    { key: "provider", label: "プロバイダ", type: "select", options: ["gmail", "outlook", "custom"], value: a.provider || "gmail" },
    { key: "label", label: "表示名", value: a.label || "", },
    { key: "username", label: "メールアドレス", required: !a.id, value: a.username || "", wide: true },
    { key: "password", label: a.id ? "パスワード(変更する場合のみ入力)" : "アプリパスワード", type: "password", required: !a.id, wide: true },
    { key: "imap_host", label: "IMAPサーバー(customのみ)", value: a.provider === "custom" ? a.imap_host : "" },
    { key: "smtp_host", label: "SMTPサーバー(customのみ)", value: a.provider === "custom" ? a.smtp_host : "" },
  ];
  document.getElementById("mail-acc-add").addEventListener("click", async () => {
    const v = await modalForm("メールアカウントを追加", accountFields(), "追加");
    if (!v) return;
    try {
      await Api.post("/api/mail/accounts", v);
      toast("アカウントを追加しました。「接続テスト」で確認してください");
      renderSettings();
    } catch (err) { toast(err.message, true); }
  });
  document.querySelectorAll("[data-acc-edit]").forEach((b) => {
    b.addEventListener("click", async () => {
      const a = mailData.accounts.find((x) => x.id === Number(b.dataset.accEdit));
      const v = await modalForm("メールアカウントを編集", [
        ...accountFields(a),
        { key: "active", label: "状態", type: "select", options: ["監視する", "停止する"], value: a.active ? "監視する" : "停止する" },
      ]);
      if (!v) return;
      try {
        await Api.patch(`/api/mail/accounts/${a.id}`, { ...v, active: v.active === "監視する" });
        toast("アカウントを更新しました");
        renderSettings();
      } catch (err) { toast(err.message, true); }
    });
  });
  document.querySelectorAll("[data-acc-test]").forEach((b) => {
    b.addEventListener("click", async () => {
      b.disabled = true;
      b.textContent = "テスト中…";
      try {
        const r = await Api.post("/api/mail/accounts/test", { id: Number(b.dataset.accTest) });
        if (r.imap && r.smtp) toast("接続OK!受信・送信ともに利用できます");
        else toast(r.error || "接続に失敗しました", true);
      } catch (err) { toast(err.message, true); }
      finally { b.disabled = false; b.textContent = "接続テスト"; }
    });
  });
  document.querySelectorAll("[data-acc-del]").forEach((b) => {
    b.addEventListener("click", async () => {
      if (!confirm("このアカウントと取り込んだメールを削除します。よろしいですか?")) return;
      await Api.del(`/api/mail/accounts/${b.dataset.accDel}`);
      toast("削除しました");
      renderSettings();
    });
  });
  document.getElementById("mail-signature-save").addEventListener("click", async () => {
    await Api.patch("/api/settings", { mailSignature: document.getElementById("mail-signature").value });
    toast("署名を保存しました");
  });

  document.getElementById("eng-add").addEventListener("click", async () => {
    const v = await modalForm("エンジニアを追加", [
      { key: "name", label: "名前", required: true },
      { key: "current_project", label: "現在の案件" },
      { key: "load", label: "稼働率(%)", type: "number", value: 0 },
    ], "追加");
    if (!v) return;
    await Api.post("/api/engineers", v);
    renderSettings();
  });
  document.querySelectorAll("[data-eng-edit]").forEach((b) => {
    b.addEventListener("click", async () => {
      const e = engineers.find((x) => x.id === Number(b.dataset.engEdit));
      const v = await modalForm("エンジニアを編集", [
        { key: "name", label: "名前", required: true, value: e.name },
        { key: "current_project", label: "現在の案件", value: e.current_project },
        { key: "load", label: "稼働率(%)", type: "number", value: e.load },
        { key: "active", label: "状態", type: "select", options: ["稼働中", "退職・非表示"], value: e.active ? "稼働中" : "退職・非表示" },
      ]);
      if (!v) return;
      await Api.patch(`/api/engineers/${e.id}`, { ...v, active: v.active === "稼働中" });
      renderSettings();
    });
  });

  document.getElementById("pw-save").addEventListener("click", async () => {
    try {
      await Api.post("/api/auth/password", {
        current: document.getElementById("pw-current").value,
        next: document.getElementById("pw-next").value,
      });
      toast("パスワードを変更しました");
      document.getElementById("pw-current").value = "";
      document.getElementById("pw-next").value = "";
    } catch (err) {
      toast(err.message, true);
    }
  });
}

function settingSwitch(key, name, desc, checked) {
  return `<div class="setting-row">
    <div><div class="s-name">${esc(name)}</div><div class="s-desc">${esc(desc)}</div></div>
    <label class="switch"><input type="checkbox" data-key="${key}" ${checked ? "checked" : ""}><span class="sl"></span></label>
  </div>`;
}
