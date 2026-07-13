/* VTaBridge OS - CEO Dashboard: ルーター + 画面
   画面設計(設計書 §画面設計): ホーム / 案件一覧 / 案件詳細 / 商談詳細 / 売上分析 / 設定
   加えて主要機能: AI議事録取込 / 書類作成 / AI秘書チャット */
"use strict";

const $main = document.getElementById("main");

/* ===== 永続化(タスク完了・設定・議事録から登録した案件) ===== */
const Store = {
  load(key, fallback) {
    try { const v = localStorage.getItem("vtab:" + key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  save(key, val) { localStorage.setItem("vtab:" + key, JSON.stringify(val)); },
};
const doneTasks = new Set(Store.load("doneTasks", []));
const settings = Store.load("settings", {
  notify: true, riskDetect: true, crmSync: true, autoInput: true,
  unpaidDays: 7, noReplyDays: 3,
});
const customProjects = Store.load("customProjects", []);

function allProjects() { return [...DB.projects, ...customProjects]; }
function findProject(id) { return allProjects().find((p) => p.id === id); }
function findDeal(id) { return DB.deals.find((d) => d.id === id); }

/* ===== ルーター ===== */
const routes = {
  home: renderHome,
  projects: renderProjects,
  project: renderProjectDetail,
  deals: renderDeals,
  deal: renderDealDetail,
  analytics: renderAnalytics,
  minutes: renderMinutes,
  documents: renderDocuments,
  assistant: renderAssistant,
  settings: renderSettings,
};

function route() {
  const hash = location.hash.replace(/^#\//, "") || "home";
  const [name, param] = hash.split("/");
  let view = name, arg = param;
  if (name === "projects" && param) view = "project";
  if (name === "deals" && param) view = "deal";
  const fn = routes[view] || renderHome;
  document.querySelectorAll("#nav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.route === (view === "project" ? "projects" : view === "deal" ? "deals" : view));
  });
  $main.innerHTML = "";
  fn(arg);
  $main.scrollTop = 0;
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
window.addEventListener("DOMContentLoaded", route);

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
  return `<span class="badge ${cls}">${label}</span>`;
}

function statusBadge(status) {
  const map = { "開発中": "badge-neutral", "契約待ち": "badge-warning", "保守": "badge-good", "完了": "badge-good" };
  return `<span class="badge ${map[status] || "badge-neutral"}">${esc(status)}</span>`;
}

/* ============================================================
   ホーム(毎朝5分で把握する画面)
============================================================ */
function renderHome() {
  const k = DB.kpi;
  const paidDelta = ((k.paidAmount - k.paidAmountPrev) / k.paidAmountPrev * 100).toFixed(1);
  const orderDelta = ((k.orderAmount - k.orderAmountPrev) / k.orderAmountPrev * 100).toFixed(1);
  const openTasks = DB.todayTasks.filter((t) => !doneTasks.has(t.id));

  $main.innerHTML = `
    ${pageHead("おはようございます、社長", todayStr() + " — 今日の状況とAIの提案をまとめました")}

    <div class="grid grid-3 section">
      <div class="card" style="grid-column: span 2;">
        <h2>✅ 今日やること <span class="muted">(最大3件)</span></h2>
        <div class="task-list" id="today-tasks"></div>
      </div>
      <div class="card">
        <div class="hero-label">今月の入金額</div>
        <div class="hero-figure">${esc(yenToMan(k.paidAmount))}</div>
        <div class="hero-delta ${paidDelta >= 0 ? "delta up" : "delta down"}">${paidDelta >= 0 ? "▲" : "▼"} 前月比 ${Math.abs(paidDelta)}%</div>
        <div class="muted" style="margin-top:10px;">未回収 ${esc(yenToMan(k.unpaidAmount))} — <a href="#/analytics">売上分析へ</a></div>
      </div>
    </div>

    <div class="kpi-row section">
      ${statTile("受注額(今月)", yenToMan(k.orderAmount), `${orderDelta >= 0 ? "▲" : "▼"} 前月比 ${Math.abs(orderDelta)}%`, orderDelta >= 0)}
      ${statTile("請求額(今月)", yenToMan(k.invoicedAmount))}
      ${statTile("未回収金額", yenToMan(k.unpaidAmount), "要対応 2件", false)}
      ${statTile("商談件数", k.dealCount + " 件", `見積提出 ${k.quoteCount} / 契約待ち ${k.awaitingContract}`)}
      ${statTile("稼働エンジニア", k.activeEngineers + " 名", `開発中案件 ${k.inDevelopment} 件`)}
    </div>

    <div class="grid grid-2 section">
      <div class="card">
        <h2>🚨 危険案件 <a class="more" href="#/settings">検知ルール</a></h2>
        ${DB.risks.map((r) => `
          <a class="risk-item" href="${r.link}" style="color:inherit;">
            ${riskBadge(r.level)}
            <div><div style="font-weight:600; font-size:12px; color:var(--text-muted);">${esc(r.type)}</div>${esc(r.text)}</div>
          </a>`).join("")}
      </div>
      <div class="card">
        <h2>🤖 AIからの提案</h2>
        ${DB.aiSuggestions.map((s) => `
          <div class="ai-item">
            <span class="ai-icon">${s.icon}</span>
            <div class="a-text">${esc(s.text)}<div class="a-reason">根拠: ${esc(s.reason)}</div></div>
          </div>`).join("")}
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
      <h2>👩‍💻 エンジニア稼働状況</h2>
      ${DB.engineers.map((e) => `
        <div class="meter-row">
          <span class="meter-name">${esc(e.name)}</span>
          <div class="meter-track"><div class="meter-fill ${e.load >= 90 ? "hot" : e.load >= 80 ? "warm" : ""}" style="width:${e.load}%"></div></div>
          <span class="meter-val">${e.load}% <span class="muted">${esc(e.project)}</span></span>
        </div>`).join("")}
    </div>
  `;

  renderTodayTasks();
  drawSalesChart(document.getElementById("home-sales-chart"), DB.monthlySales.slice(-6), 200);
  drawPipeline(document.getElementById("home-pipeline-chart"));
}

function statTile(label, value, delta, up) {
  return `<div class="stat-tile">
    <div class="label">${esc(label)}</div>
    <div class="value">${esc(value)}</div>
    ${delta ? `<div class="delta ${up === true ? "up" : up === false ? "down" : ""}" style="${up === undefined ? "color:var(--text-muted);" : ""}">${esc(delta)}</div>` : ""}
  </div>`;
}

function renderTodayTasks() {
  const box = document.getElementById("today-tasks");
  if (!box) return;
  box.innerHTML = DB.todayTasks.map((t, i) => `
    <div class="task-item ${doneTasks.has(t.id) ? "done" : ""}">
      <span class="task-rank">${i + 1}</span>
      <div>
        <div class="t-title"><a href="${t.link}" style="color:inherit;">${esc(t.title)}</a></div>
        <div class="t-why">💡 ${esc(t.why)}</div>
      </div>
      <button class="task-done-btn" data-task="${t.id}">${doneTasks.has(t.id) ? "戻す" : "完了"}</button>
    </div>`).join("");
  box.querySelectorAll(".task-done-btn").forEach((b) => {
    b.addEventListener("click", () => {
      const id = b.dataset.task;
      doneTasks.has(id) ? doneTasks.delete(id) : doneTasks.add(id);
      Store.save("doneTasks", [...doneTasks]);
      renderTodayTasks();
    });
  });
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

function drawPipeline(elm) {
  // 順序尺度: 同一ヒュー(青)のラムプで段階を表現
  const cs = getComputedStyle(document.documentElement);
  const ramp = ["--seq-250", "--seq-350", "--seq-450", "--seq-550", "--seq-650"].map((v) => cs.getPropertyValue(v).trim());
  Charts.barH(elm, {
    format: (v) => man(v),
    items: DB.pipeline.map((p, i) => ({ label: p.stage, value: p.amount, color: ramp[i], sub: `${p.count}件` })),
  });
}

/* ============================================================
   案件一覧 / 案件詳細
============================================================ */
function renderProjects() {
  $main.innerHTML = `
    ${pageHead("案件一覧", "進行中の案件と請求・入金の状況")}
    <div class="filter-row">
      <div class="seg" id="proj-filter">
        ${["すべて", "開発中", "契約待ち", "保守"].map((s, i) => `<button class="${i === 0 ? "on" : ""}" data-f="${s}">${s}</button>`).join("")}
      </div>
      <input class="input" id="proj-search" type="search" placeholder="案件名・顧客名で検索" style="min-width:220px;">
    </div>
    <div class="card"><div class="table-wrap">
      <table class="data">
        <thead><tr>
          <th>案件名</th><th>顧客</th><th>状態</th><th class="num">受注額</th><th class="num">入金済</th>
          <th>納期</th><th>進捗</th><th>リスク</th>
        </tr></thead>
        <tbody id="proj-body"></tbody>
      </table>
    </div></div>
  `;

  let filter = "すべて", q = "";
  const body = document.getElementById("proj-body");
  function draw() {
    const rows = allProjects().filter((p) =>
      (filter === "すべて" || p.status === filter) &&
      (q === "" || p.name.includes(q) || p.client.includes(q)));
    body.innerHTML = rows.length ? rows.map((p) => `
      <tr class="clickable" data-id="${p.id}">
        <td style="font-weight:600;">${esc(p.name)}</td>
        <td>${esc(p.client)}</td>
        <td>${statusBadge(p.status)}</td>
        <td class="num">${esc(yenToMan(p.amount))}</td>
        <td class="num">${esc(yenToMan(p.paid))}</td>
        <td>${esc(p.deadline)}</td>
        <td style="min-width:110px;">
          <div class="progress-track"><div class="progress-fill" style="width:${p.progress}%"></div></div>
          <span class="muted">${p.progress}%</span>
        </td>
        <td>${p.risk ? riskBadge(p.risk.level) : `<span class="muted">-</span>`}</td>
      </tr>`).join("") : `<tr><td colspan="8" class="empty">該当する案件がありません</td></tr>`;
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
  draw();
}

function renderProjectDetail(id) {
  const p = findProject(id);
  if (!p) { $main.innerHTML = pageHead("案件が見つかりません", "") + `<a href="#/projects">← 案件一覧へ戻る</a>`; return; }
  const remaining = p.amount - p.invoiced;

  $main.innerHTML = `
    ${pageHead(p.name, p.client, `<a href="#/projects">案件一覧</a> / 案件詳細`)}
    ${p.risk ? `<div class="card section" style="border-color: var(--status-critical);">
      <h2>🚨 危険検知</h2>${riskBadge(p.risk.level)} <span style="margin-left:8px;">${esc(p.risk.text)}</span>
    </div>` : ""}
    <div class="detail-grid section">
      <div style="display:flex; flex-direction:column; gap:16px;">
        <div class="card">
          <h2>📋 概要</h2>
          <dl class="kv">
            <dt>状態</dt><dd>${statusBadge(p.status)}</dd>
            <dt>受注額</dt><dd>${esc(yen(p.amount))}</dd>
            <dt>請求済</dt><dd>${esc(yen(p.invoiced))} <span class="muted">(残 ${esc(yen(remaining))})</span></dd>
            <dt>入金済</dt><dd>${esc(yen(p.paid))} ${p.invoiced > p.paid ? `<span class="badge badge-critical">未回収 ${esc(yen(p.invoiced - p.paid))}</span>` : ""}</dd>
            <dt>納期</dt><dd>${esc(p.deadline)}</dd>
            <dt>PM</dt><dd>${esc(p.pm)}</dd>
            <dt>担当</dt><dd>${p.engineers.map(esc).join("、")}</dd>
          </dl>
          <div style="margin-top:14px;">
            <div class="muted" style="margin-bottom:4px;">進捗 ${p.progress}%</div>
            <div class="progress-track"><div class="progress-fill" style="width:${p.progress}%"></div></div>
          </div>
        </div>
        <div class="card">
          <h2>✅ タスク <span class="muted">(議事録からAIが自動抽出)</span></h2>
          ${p.tasks.map((t) => `
            <div class="todo-extract">
              <input type="checkbox" ${t.done ? "checked" : ""} disabled>
              <div><div style="${t.done ? "text-decoration:line-through; opacity:.6;" : "font-weight:600;"}">${esc(t.title)}</div>
              <div class="muted">期限: ${esc(t.due)}</div></div>
            </div>`).join("")}
        </div>
      </div>
      <div style="display:flex; flex-direction:column; gap:16px;">
        <div class="card">
          <h2>🕐 タイムライン</h2>
          <ul class="timeline">
            ${p.timeline.map((e) => `<li><div class="tl-date">${esc(e.date)}</div>${esc(e.text)}</li>`).join("")}
          </ul>
        </div>
        <div class="card">
          <h2>⚡ アクション</h2>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <a class="btn" href="#/documents">📄 請求書を作成</a>
            <a class="btn" href="#/minutes">📝 議事録を取り込む</a>
            <a class="btn" href="#/assistant">💬 AI秘書に相談</a>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ============================================================
   商談一覧 / 商談詳細
============================================================ */
function renderDeals() {
  $main.innerHTML = `
    ${pageHead("商談", "CRM連携中のパイプライン(ホバーで金額)")}
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
          ${DB.deals.map((d) => `
            <tr class="clickable" data-id="${d.id}">
              <td><span style="font-weight:600;">${esc(d.client)}</span><br><span class="muted">${esc(d.title)}</span></td>
              <td><span class="badge badge-neutral">${esc(d.stage)}</span></td>
              <td class="num">${esc(yenToMan(d.amount))}</td>
              <td class="num">${d.probability}%</td>
              <td>${esc(d.nextAction)}</td>
              <td>${esc(d.owner)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div></div>
  `;
  drawPipeline(document.getElementById("deals-pipeline"));
  document.querySelectorAll("tr.clickable").forEach((tr) =>
    tr.addEventListener("click", () => { location.hash = "#/deals/" + tr.dataset.id; }));
}

function renderDealDetail(id) {
  const d = findDeal(id);
  if (!d) { $main.innerHTML = pageHead("商談が見つかりません", "") + `<a href="#/deals">← 商談一覧へ戻る</a>`; return; }
  const stageIdx = DB.dealStages.indexOf(d.stage);

  $main.innerHTML = `
    ${pageHead(`${d.client} — ${d.title}`, "", `<a href="#/deals">商談</a> / 商談詳細`)}
    <div class="detail-grid section">
      <div style="display:flex; flex-direction:column; gap:16px;">
        <div class="card">
          <h2>📋 商談情報</h2>
          <div class="stage-flow">
            ${DB.dealStages.map((s, i) => `<span class="stage-pill ${i < stageIdx ? "past" : i === stageIdx ? "now" : ""}">${esc(s)}</span>`).join("")}
          </div>
          <dl class="kv" style="margin-top:12px;">
            <dt>見込金額</dt><dd>${esc(yen(d.amount))}</dd>
            <dt>受注確度</dt><dd>${d.probability}%</dd>
            <dt>担当</dt><dd>${esc(d.owner)}</dd>
            <dt>先方窓口</dt><dd>${esc(d.contact)}</dd>
          </dl>
          <div style="margin-top:14px; padding:12px; border-radius:10px; background:var(--accent-wash);">
            <div style="font-size:12px; font-weight:700; color:var(--accent);">次のアクション</div>
            ${esc(d.nextAction)}
          </div>
        </div>
        ${d.minutes ? `<div class="card">
          <h2>📝 直近のAI議事録メモ</h2>
          <div style="white-space:pre-wrap; font-size:13px; color:var(--text-secondary);">${esc(d.minutes)}</div>
          <div style="margin-top:10px;"><a class="btn btn-sm" href="#/minutes">議事録からTODOを抽出 →</a></div>
        </div>` : ""}
      </div>
      <div style="display:flex; flex-direction:column; gap:16px;">
        <div class="card">
          <h2>🕐 活動履歴</h2>
          <ul class="timeline">
            ${d.history.map((e) => `<li><div class="tl-date">${esc(e.date)}</div>${esc(e.text)}</li>`).join("")}
          </ul>
        </div>
        <div class="card">
          <h2>⚡ アクション</h2>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <a class="btn" href="#/documents">📄 見積書を作成</a>
            <a class="btn" href="#/documents">📄 契約書を作成</a>
            <a class="btn" href="#/assistant">💬 AI秘書に相談</a>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ============================================================
   売上分析
============================================================ */
function renderAnalytics() {
  $main.innerHTML = `
    ${pageHead("売上分析", "受注・請求・入金とキャッシュフローの推移")}
    <div class="filter-row">
      <div class="seg" id="range-seg">
        <button data-n="3">直近3ヶ月</button>
        <button class="on" data-n="6">直近6ヶ月</button>
      </div>
    </div>
    <div class="kpi-row section" id="ana-kpis"></div>
    <div class="card section">
      <h2>📈 月次推移(万円)</h2>
      <div class="chart-box" id="ana-chart"></div>
    </div>
    <div class="grid grid-2 section">
      <div class="card">
        <h2>📊 月次データ(テーブル)</h2>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>月</th><th class="num">受注</th><th class="num">請求</th><th class="num">入金</th><th class="num">請求-入金差</th></tr></thead>
          <tbody id="ana-table"></tbody>
        </table></div>
      </div>
      <div class="card">
        <h2>💰 キャッシュフロー注意点</h2>
        <div class="ai-item"><span class="ai-icon">⚠️</span><div class="a-text">7月は請求 940万円 に対し入金 715万円。未回収 ${esc(yenToMan(DB.kpi.unpaidAmount))} の回収が最優先です。<div class="a-reason">根拠: 請求・入金の月次差分</div></div></div>
        <div class="ai-item"><span class="ai-icon">💡</span><div class="a-text">未請求の検収済み案件(45万円)を今週請求すると、8月入金見込みが計画比100%に回復します。<div class="a-reason">根拠: 検収データと入金サイト</div></div></div>
      </div>
    </div>
  `;

  let n = 6;
  function draw() {
    const rows = DB.monthlySales.slice(-n);
    const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
    document.getElementById("ana-kpis").innerHTML = [
      statTile(`受注額(${n}ヶ月計)`, man(sum("order"))),
      statTile(`請求額(${n}ヶ月計)`, man(sum("invoice"))),
      statTile(`入金額(${n}ヶ月計)`, man(sum("paid"))),
      statTile("未回収金額(現在)", yenToMan(DB.kpi.unpaidAmount), "要対応 2件", false),
      statTile("見積提出数(今月)", DB.kpi.quoteCount + " 件"),
    ].join("");
    drawSalesChart(document.getElementById("ana-chart"), rows, 260);
    document.getElementById("ana-table").innerHTML = rows.map((r) => {
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
    n = +b.dataset.n;
    document.querySelectorAll("#range-seg button").forEach((x) => x.classList.toggle("on", x === b));
    draw();
  });
  draw();
}

/* ============================================================
   AI議事録取込 → TODO抽出 → 案件登録
============================================================ */
const SAMPLE_MINUTES = `【定例MTG議事録】株式会社アオバ 様 2026/07/12
・ポータルのデザイン案は7/18までに提出する
・SSO連携の技術調査を今週中に完了させる
・見積書は7/13 17:00までに最終版を提出
・保守プランは月額15万円で別途提案する
・次回定例は7/19(金) 14:00`;

function renderMinutes() {
  $main.innerHTML = `
    ${pageHead("AI議事録取込", "議事録を貼り付けると、AIがTODOを抽出して案件に登録します")}
    <div class="grid grid-2">
      <div class="card">
        <h2>📝 議事録テキスト</h2>
        <textarea class="input" id="minutes-text" rows="12" placeholder="会議の議事録を貼り付けてください(音声文字起こしのテキストもOK)"></textarea>
        <div style="display:flex; gap:8px; margin-top:10px;">
          <button class="btn btn-primary" id="extract-btn">🤖 AIでTODOを抽出</button>
          <button class="btn" id="sample-btn">サンプルを読み込む</button>
        </div>
      </div>
      <div class="card">
        <h2>✅ 抽出されたTODO</h2>
        <div id="extract-result"><div class="empty">左のテキストから抽出すると、ここに表示されます</div></div>
      </div>
    </div>
    <div class="muted" style="margin-top:12px;">設計原則: AIは判断、RPAは入力。抽出したTODOは選択のうえワンクリックで案件に登録されます(入力作業は極力自動化)。</div>
  `;

  document.getElementById("sample-btn").addEventListener("click", () => {
    document.getElementById("minutes-text").value = SAMPLE_MINUTES;
  });

  document.getElementById("extract-btn").addEventListener("click", () => {
    const text = document.getElementById("minutes-text").value.trim();
    const out = document.getElementById("extract-result");
    if (!text) { out.innerHTML = `<div class="empty">議事録テキストを入力してください</div>`; return; }

    // モックAI抽出: 行動を示す行(〜する / 〜提出 / 〜完了 / 期限表現)をTODO候補として抽出
    const lines = text.split("\n").map((l) => l.replace(/^[・\-*\s]+/, "").trim()).filter(Boolean);
    const todos = lines.filter((l) =>
      /(する|します|提出|完了|対応|作成|送付|確認|調整|提案|連絡)/.test(l) && !/^【/.test(l));
    const dateRe = /(\d{1,2}\/\d{1,2}|\d{1,2}月\d{1,2}日|今週|来週|本日|明日)/;

    if (!todos.length) { out.innerHTML = `<div class="empty">TODOらしき行が見つかりませんでした</div>`; return; }
    out.innerHTML = `
      ${todos.map((t, i) => {
        const m = t.match(dateRe);
        return `<div class="todo-extract">
          <input type="checkbox" checked id="todo-${i}">
          <div><label for="todo-${i}" style="font-weight:600;">${esc(t)}</label>
          ${m ? `<div class="muted">📅 期限候補: ${esc(m[1])}</div>` : ""}</div>
        </div>`;
      }).join("")}
      <div class="filter-row" style="margin:12px 0 0;">
        <select class="input" id="target-project">
          ${allProjects().map((p) => `<option value="${p.id}">${esc(p.name)}(${esc(p.client)})</option>`).join("")}
          <option value="__new__">+ 新規案件として登録</option>
        </select>
        <button class="btn btn-primary" id="register-btn">案件に登録</button>
      </div>
      <div id="register-msg"></div>
    `;

    document.getElementById("register-btn").addEventListener("click", () => {
      const selected = todos.filter((_, i) => document.getElementById("todo-" + i).checked);
      if (!selected.length) return;
      const target = document.getElementById("target-project").value;
      const newTasks = selected.map((t) => {
        const m = t.match(dateRe);
        return { title: t, due: m ? m[1] : "未設定", done: false };
      });
      let msg;
      if (target === "__new__") {
        const np = {
          id: "pc" + Date.now(), name: "議事録からの新規案件", client: "(未設定)", status: "契約待ち",
          amount: 0, invoiced: 0, paid: 0, deadline: "未設定", progress: 0, pm: "未定", engineers: [],
          risk: null, tasks: newTasks,
          timeline: [{ date: new Date().toISOString().slice(0, 10), text: "AI議事録からTODO " + newTasks.length + "件を自動登録" }],
        };
        customProjects.push(np);
        Store.save("customProjects", customProjects);
        msg = `新規案件を作成し、TODO ${newTasks.length}件を登録しました。<a href="#/projects/${np.id}">案件を開く →</a>`;
      } else {
        const p = findProject(target);
        p.tasks.push(...newTasks);
        const idx = customProjects.findIndex((c) => c.id === p.id);
        if (idx >= 0) Store.save("customProjects", customProjects);
        msg = `「${esc(p.name)}」にTODO ${newTasks.length}件を登録しました。<a href="#/projects/${p.id}">案件を開く →</a>`;
      }
      document.getElementById("register-msg").innerHTML =
        `<div class="ai-item" style="margin-top:10px;"><span class="ai-icon">✅</span><div class="a-text">${msg}</div></div>`;
    });
  });
}

/* ============================================================
   書類作成(見積書・契約書・請求書)
============================================================ */
function renderDocuments() {
  $main.innerHTML = `
    ${pageHead("書類作成", "見積書・契約書・請求書をAIドラフトから作成")}
    <div class="filter-row">
      <div class="seg" id="doc-seg">
        <button class="on" data-t="quote">見積書</button>
        <button data-t="contract">契約書</button>
        <button data-t="invoice">請求書</button>
      </div>
      <select class="input" id="doc-target">
        ${DB.deals.map((d) => `<option value="${d.id}">${esc(d.client)} — ${esc(d.title)}</option>`).join("")}
      </select>
      <button class="btn btn-primary" id="doc-gen">🤖 AIでドラフト生成</button>
      <button class="btn" onclick="window.print()">🖨 印刷 / PDF</button>
    </div>
    <div id="doc-out"><div class="card"><div class="empty">書類の種類と商談を選び、「AIでドラフト生成」を押してください</div></div></div>
  `;

  let docType = "quote";
  document.getElementById("doc-seg").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    docType = b.dataset.t;
    document.querySelectorAll("#doc-seg button").forEach((x) => x.classList.toggle("on", x === b));
  });

  document.getElementById("doc-gen").addEventListener("click", () => {
    const d = findDeal(document.getElementById("doc-target").value);
    const out = document.getElementById("doc-out");
    const today = todayStr();
    const num = "D-" + String(Date.now()).slice(-6);
    const tax = Math.round(d.amount * 0.1);

    const titles = { quote: "御 見 積 書", contract: "業務委託契約書", invoice: "御 請 求 書" };
    let body;
    if (docType === "contract") {
      body = `
        <p style="margin-bottom:12px;">${esc(d.client)}(以下「甲」という)と 株式会社VTaBridge(以下「乙」という)は、「${esc(d.title)}」の開発業務に関し、次のとおり契約を締結する。</p>
        <p><strong>第1条(目的)</strong> 乙は甲に対し、${esc(d.title)}の設計・開発・納品を行う。</p>
        <p><strong>第2条(委託料)</strong> 委託料は金${d.amount.toLocaleString("ja-JP")}円(税別)とする。</p>
        <p><strong>第3条(納期)</strong> 別途合意するスケジュールによる。</p>
        <p><strong>第4条(検収)</strong> 甲は納品後10営業日以内に検収を行う。</p>
        <p class="muted" style="margin-top:16px;">※ AIが生成したドラフトです。法務確認のうえご利用ください。</p>`;
    } else {
      body = `
        <table>
          <tr><th>品目</th><th style="text-align:right;">金額(税別)</th></tr>
          <tr><td>${esc(d.title)} 一式</td><td style="text-align:right; font-variant-numeric:tabular-nums;">${yen(d.amount)}</td></tr>
          <tr><td>消費税(10%)</td><td style="text-align:right; font-variant-numeric:tabular-nums;">${yen(tax)}</td></tr>
          <tr><td class="total">合計</td><td class="total" style="text-align:right; font-variant-numeric:tabular-nums;">${yen(d.amount + tax)}</td></tr>
        </table>
        ${docType === "invoice"
          ? `<p>お支払期限: 発行日の翌月末 / 振込先: ○○銀行 ○○支店 普通 1234567</p>`
          : `<p>有効期限: 発行日より30日間 / 納期・条件は別途ご相談ください。</p>`}
        <p class="muted" style="margin-top:16px;">※ AIが商談データから自動生成したドラフトです。</p>`;
    }

    out.innerHTML = `<div class="card" style="display:flex; justify-content:center;">
      <div class="doc-preview">
        <h3>${titles[docType]}</h3>
        <div style="display:flex; justify-content:space-between; margin-bottom:16px;">
          <div><strong>${esc(d.client)} 御中</strong><br><span style="font-size:12px;">ご担当: ${esc(d.contact)}</span></div>
          <div style="text-align:right; font-size:12px;">
            No. ${num}<br>発行日: ${today}<br><br>
            <strong>株式会社VTaBridge</strong><br>東京都○○区○○ 1-2-3
          </div>
        </div>
        ${body}
      </div>
    </div>`;
  });
}

/* ============================================================
   AI秘書チャット
============================================================ */
function assistantReply(q) {
  const k = DB.kpi;
  if (/今日|やること|タスク|優先/.test(q)) {
    const open = DB.todayTasks.filter((t) => !doneTasks.has(t.id));
    if (!open.length) return "今日の優先タスクはすべて完了しています。お疲れさまでした!🎉";
    return "今日の優先タスクは次の" + open.length + "件です(重要度順):\n" +
      open.map((t, i) => `${i + 1}. ${t.title}\n   → ${t.why}`).join("\n");
  }
  if (/危険|リスク|遅延|やばい/.test(q)) {
    return "現在の危険案件は" + DB.risks.length + "件です:\n" +
      DB.risks.map((r) => `・[${r.type}] ${r.text}`).join("\n") +
      "\n\n最優先はサクラ製作所の未回収128万円です。督促文面は作成済みです。";
  }
  if (/売上|受注|業績/.test(q)) {
    return `今月の状況です:\n・受注額 ${yenToMan(k.orderAmount)}(前月比 +14.3%)\n・請求額 ${yenToMan(k.invoicedAmount)}\n・入金額 ${yenToMan(k.paidAmount)}\n\n受注は好調ですが、入金が請求を下回っています。詳細は売上分析をご覧ください。`;
  }
  if (/キャッシュ|資金|入金|回収/.test(q)) {
    return `キャッシュフローは要注意です。\n・未回収金額: ${yenToMan(k.unpaidAmount)}(うち支払期日超過 128万円)\n・未請求の検収済み案件: 45万円\n\n未請求分を今週請求し、サクラ製作所へ督促を行えば、8月の入金見込みは計画比100%に回復します。`;
  }
  if (/エンジニア|稼働|リソース|空き/.test(q)) {
    const free = DB.engineers.filter((e) => e.load < 60);
    return `稼働エンジニアは${k.activeEngineers}名。佐藤・高橋が90%超で逼迫しています。\n余裕があるのは: ${free.map((e) => `${e.name}(${e.load}%)`).join("、")}\n\n渡辺をECサイト構築にアサインすれば、納期遅延の解消が見込めます。`;
  }
  if (/商談|営業|パイプライン/.test(q)) {
    return "パイプラインの状況です:\n" +
      DB.pipeline.map((p) => `・${p.stage}: ${p.count}件 / ${man(p.amount)}`).join("\n") +
      "\n\n見積提出中のアオバ案件(420万円)が今日の勝負どころです。";
  }
  return "承知しました。「今日やることは?」「危険案件を教えて」「今月の売上状況は?」「キャッシュフローは大丈夫?」「エンジニアの空きは?」などを聞いていただけます。\n\n※ 本デモではあらかじめ用意した経営データに基づいて回答しています。";
}

function renderAssistant() {
  $main.innerHTML = `
    ${pageHead("AI秘書", "経営データに基づいて質問に答えます")}
    <div class="card chat-box">
      <div class="chip-row">
        ${DB.assistantChips.map((c) => `<button class="chip">${esc(c)}</button>`).join("")}
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
  }
  function ask(q) {
    if (!q.trim()) return;
    addMsg(q, "user");
    input.value = "";
    setTimeout(() => addMsg(assistantReply(q), "ai"), 350);
  }
  addMsg(`おはようございます、社長。${todayStr()}の状況です。\n\n・今日の優先タスク: ${DB.todayTasks.filter((t) => !doneTasks.has(t.id)).length}件\n・危険案件: ${DB.risks.length}件(重大2件)\n・今月入金: ${yenToMan(DB.kpi.paidAmount)}\n\n何からお手伝いしましょうか?`, "ai");
  document.getElementById("chat-send").addEventListener("click", () => ask(input.value));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") ask(input.value); });
  document.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => ask(c.textContent)));
}

/* ============================================================
   設定
============================================================ */
function renderSettings() {
  $main.innerHTML = `
    ${pageHead("設定", "通知・連携・危険検知ルール")}
    <div class="grid grid-2">
      <div class="card">
        <h2>🔔 通知と自動化</h2>
        ${settingSwitch("notify", "朝のサマリー通知", "毎朝7:00に今日やること・危険案件を通知")}
        ${settingSwitch("riskDetect", "危険検知", "未返信・未請求・納期遅延・未回収を自動検知")}
        ${settingSwitch("crmSync", "CRM連携", "商談データをCRMと双方向同期(API優先)")}
        ${settingSwitch("autoInput", "入力自動化", "API不可のシステムのみRPAで入力を代行")}
      </div>
      <div class="card">
        <h2>⚙️ 危険検知しきい値</h2>
        <div class="setting-row">
          <div><div class="s-name">未回収アラート</div><div class="s-desc">支払期日からの経過日数</div></div>
          <select class="input" id="set-unpaid">
            ${[3, 7, 14].map((v) => `<option value="${v}" ${settings.unpaidDays === v ? "selected" : ""}>${v}日</option>`).join("")}
          </select>
        </div>
        <div class="setting-row">
          <div><div class="s-name">未返信アラート</div><div class="s-desc">顧客メールへの未返信営業日数</div></div>
          <select class="input" id="set-noreply">
            ${[1, 2, 3, 5].map((v) => `<option value="${v}" ${settings.noReplyDays === v ? "selected" : ""}>${v}営業日</option>`).join("")}
          </select>
        </div>
      </div>
    </div>
    <div class="card section" style="margin-top:16px;">
      <h2>📐 設計原則(v1.0)</h2>
      <ul style="padding-left:20px; color:var(--text-secondary);">
        <li>社長に表示する優先タスクは最大3件</li>
        <li>API優先、API不可のみRPA</li>
        <li>AIは判断、RPAは入力</li>
        <li>入力作業は極力自動化</li>
      </ul>
    </div>
  `;
  document.querySelectorAll(".switch input").forEach((sw) => {
    sw.addEventListener("change", () => {
      settings[sw.dataset.key] = sw.checked;
      Store.save("settings", settings);
    });
  });
  document.getElementById("set-unpaid").addEventListener("change", (e) => {
    settings.unpaidDays = +e.target.value; Store.save("settings", settings);
  });
  document.getElementById("set-noreply").addEventListener("change", (e) => {
    settings.noReplyDays = +e.target.value; Store.save("settings", settings);
  });
}

function settingSwitch(key, name, desc) {
  return `<div class="setting-row">
    <div><div class="s-name">${esc(name)}</div><div class="s-desc">${esc(desc)}</div></div>
    <label class="switch"><input type="checkbox" data-key="${key}" ${settings[key] ? "checked" : ""}><span class="sl"></span></label>
  </div>`;
}
