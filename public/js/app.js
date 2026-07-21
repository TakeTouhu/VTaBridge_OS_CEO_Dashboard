'use strict';

/* XSS対策: DOMはすべて createElement + textContent で構築する */

const root = document.getElementById('app');
let currentUser = null;

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  const { dataset, ...rest } = props;
  Object.assign(node, rest);
  if (dataset) Object.assign(node.dataset, dataset);
  for (const child of children) node.append(child);
  return node;
}

function man(amount) { return `${Math.round((amount || 0) / 10000).toLocaleString()}万円`; }

/* ===== ログイン ===== */

function renderLogin(message = '') {
  currentUser = null;
  const error = el('p', { className: 'error', textContent: message });
  const email = el('input', { type: 'email', name: 'email', required: true, autocomplete: 'username', placeholder: 'ceo@example.com' });
  const password = el('input', { type: 'password', name: 'password', required: true, autocomplete: 'current-password' });
  const submit = el('button', { type: 'submit', textContent: 'ログイン' });

  const form = el('form', { className: 'card login-card' }, [
    el('h1', { textContent: 'VTaBridge OS' }),
    el('p', { className: 'muted', textContent: 'CEO Dashboard にログイン' }),
    el('label', { textContent: 'メールアドレス' }, [email]),
    el('label', { textContent: 'パスワード' }, [password]),
    error,
    submit,
  ]);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submit.disabled = true;
    error.textContent = '';
    try {
      const { user } = await api('/api/auth/login', { body: { email: email.value, password: password.value } });
      currentUser = user;
      location.hash = '#/';
      route();
    } catch (err) {
      error.textContent = err.message;
      submit.disabled = false;
    }
  });

  root.replaceChildren(el('div', { className: 'center' }, [form]));
  email.focus();
}

/* ===== 共通レイアウト ===== */

function layout(title, content) {
  const logout = el('button', { type: 'button', textContent: 'ログアウト', className: 'secondary small' });
  logout.addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    renderLogin();
  });

  const navLink = (href, text) => el('a', {
    href, textContent: text,
    className: location.hash === href || (href !== '#/' && location.hash.startsWith(href)) ? 'active' : '',
  });

  root.replaceChildren(
    el('header', {}, [
      el('nav', {}, [
        el('strong', { textContent: 'VTaBridge OS' }),
        navLink('#/', 'ホーム'),
        navLink('#/projects', '案件'),
        navLink('#/deals', '商談'),
        navLink('#/analytics', '売上分析'),
        navLink('#/minutes', 'AI議事録'),
        navLink('#/assistant', 'AI秘書'),
        navLink('#/settings', '設定'),
      ]),
      el('div', { className: 'user' }, [
        el('span', { className: 'muted', textContent: currentUser ? currentUser.name : '' }),
        logout,
      ]),
    ]),
    el('main', {}, [el('h1', { textContent: title }), content]),
  );
}

function section(title, node) {
  return el('section', { className: 'card' }, [el('h2', { textContent: title }), node]);
}

function table(headers, rows) {
  return el('div', { className: 'table-wrap' }, [
    el('table', {}, [
      el('thead', {}, [el('tr', {}, headers.map((h) => el('th', { textContent: h })))]),
      el('tbody', {}, rows),
    ]),
  ]);
}

/* ===== ホーム ===== */

function kpiCard(label, value, delta) {
  const children = [el('span', { className: 'muted', textContent: label }), el('strong', { textContent: value })];
  if (delta !== undefined) {
    const up = delta >= 0;
    children.push(el('span', {
      className: up ? 'delta-up' : 'delta-down',
      textContent: `前月比 ${up ? '+' : ''}${Math.round(delta / 10000).toLocaleString()}万円`,
    }));
  }
  return el('div', { className: 'kpi' }, children);
}

function riskList(risks) {
  if (!risks.length) return el('p', { className: 'muted', textContent: '検知された危険はありません。' });
  return el('ul', { className: 'risks' }, risks.map((r) => el('li', {}, [
    el('span', { className: `level ${r.level}`, textContent: r.type }),
    el('a', { href: r.link, textContent: r.text }),
  ])));
}

function engineerList(engineers) {
  if (!engineers.length) return el('p', { className: 'muted', textContent: 'エンジニアは設定画面から登録できます。' });
  return el('div', { style: 'display:grid; gap:0.5rem' }, engineers.map((e) => el('div', { className: 'eng' }, [
    el('span', { textContent: e.name }),
    el('div', { className: 'loadbar' }, [el('div', { className: e.load >= 90 ? 'hot' : '', style: `width:${e.load}%` })]),
    el('span', { className: 'muted', textContent: `${e.load}%` }),
  ])));
}

async function renderHome() {
  const d = await api('/api/dashboard');

  const tasks = d.todayTasks.length
    ? el('ol', { className: 'today' }, d.todayTasks.map((t) => el('li', {}, [
        el('a', { href: t.link, textContent: t.title }),
        el('p', { className: 'muted', textContent: t.why }),
      ])))
    : el('p', { className: 'muted', textContent: '今日やることはありません。' });

  const k = d.kpi;
  const kpis = el('div', { className: 'kpis' }, [
    kpiCard('今月の受注額', man(k.orderAmount), k.orderAmount - k.orderAmountPrev),
    kpiCard('今月の入金額', man(k.paidAmount), k.paidAmount - k.paidAmountPrev),
    kpiCard('期日超過の未回収', k.unpaidAmount ? `${man(k.unpaidAmount)}(${k.unpaidCount}件)` : 'なし'),
    kpiCard('進行中の商談', `${k.dealCount}件`),
    kpiCard('見積提出中', `${k.quoteCount}件`),
    kpiCard('契約待ち', `${k.awaitingContract}件`),
    kpiCard('開発中の案件', `${k.inDevelopment}件`),
    kpiCard('稼働エンジニア', `${k.activeEngineers}人`),
  ]);

  const chart = el('div');
  const pipe = el('div', { className: 'pipeline' }, d.pipeline.map((s) => el('div', { className: 'stage' }, [
    el('span', { className: 'muted', textContent: s.stage }),
    el('strong', { textContent: `${s.count}件` }),
    el('span', { className: 'muted', textContent: `${s.amount.toLocaleString()}万円` }),
  ])));

  const sugg = d.suggestions.length
    ? el('ul', { className: 'suggestions' }, d.suggestions.map((s) => el('li', {}, [
        el('span', { textContent: s.icon }),
        el('span', {}, [
          el('span', { textContent: s.text }),
          el('span', { className: 'muted', textContent: `(${s.reason})` }),
        ]),
      ])))
    : el('p', { className: 'muted', textContent: '現在の提案はありません。' });

  layout('ホーム', el('div', {}, [
    section('今日やること(最大3件)', tasks),
    section('危険案件', riskList(d.risks)),
    section('KPI', kpis),
    section('売上推移(6ヶ月・万円)', chart),
    section('営業パイプライン', pipe),
    section('エンジニア稼働状況', engineerList(d.engineers)),
    section('AI営業アドバイス', sugg),
  ]));

  Charts.line(chart, {
    labels: d.monthlySales.map((m) => m.month),
    series: [
      { name: '受注', color: '#38bdf8', values: d.monthlySales.map((m) => m.order) },
      { name: '請求', color: '#facc15', values: d.monthlySales.map((m) => m.invoice) },
      { name: '入金', color: '#4ade80', values: d.monthlySales.map((m) => m.paid) },
    ],
    format: (v) => `${v.toLocaleString()}万円`,
  });
}

/* ===== 売上分析 ===== */

async function renderAnalytics(months = 6) {
  const { monthlySales } = await api(`/api/analytics?months=${months}`);

  const tabs = el('div', { className: 'tabs' }, [3, 6, 12].map((n) => {
    const b = el('button', { textContent: `${n}ヶ月`, className: n === months ? 'on' : 'secondary' });
    b.addEventListener('click', () => renderAnalytics(n));
    return b;
  }));

  const chart = el('div');
  const rows = monthlySales.map((m) => el('tr', {}, [
    el('td', { textContent: m.month }),
    el('td', { textContent: `${m.order.toLocaleString()}万円` }),
    el('td', { textContent: `${m.invoice.toLocaleString()}万円` }),
    el('td', { textContent: `${m.paid.toLocaleString()}万円` }),
  ]));

  layout('売上分析', el('div', {}, [
    section('期間', tabs),
    section('受注・請求・入金の推移(万円)', chart),
    section('月次テーブル', table(['月', '受注', '請求', '入金'], rows)),
  ]));

  Charts.line(chart, {
    labels: monthlySales.map((m) => m.month),
    series: [
      { name: '受注', color: '#38bdf8', values: monthlySales.map((m) => m.order) },
      { name: '請求', color: '#facc15', values: monthlySales.map((m) => m.invoice) },
      { name: '入金', color: '#4ade80', values: monthlySales.map((m) => m.paid) },
    ],
    format: (v) => `${v.toLocaleString()}万円`,
  });
}

/* ===== 設定 ===== */

async function renderSettings() {
  const [{ settings }, { engineers }] = await Promise.all([api('/api/settings'), api('/api/engineers')]);

  /* 危険検知しきい値 */
  const riskOn = el('input', { type: 'checkbox', checked: settings.riskDetect === '1' });
  const unpaid = el('input', { type: 'number', min: 1, value: settings.unpaidDays });
  const noReply = el('input', { type: 'number', min: 1, value: settings.noReplyDays });
  const quoteFollow = el('input', { type: 'number', min: 1, value: settings.quoteFollowDays });
  const thMsg = el('p', { className: 'muted' });
  const thForm = el('form', { className: 'grid-form' }, [
    el('label', { textContent: '危険検知を有効にする' }, [riskOn]),
    el('label', { textContent: '未回収を重大とする日数' }, [unpaid]),
    el('label', { textContent: '商談滞留の検知日数' }, [noReply]),
    el('label', { textContent: '見積フォロー提案の日数' }, [quoteFollow]),
    el('button', { type: 'submit', textContent: '保存' }), thMsg,
  ]);
  thForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    thMsg.textContent = '';
    try {
      await api('/api/settings', { method: 'PATCH', body: {
        riskDetect: riskOn.checked ? '1' : '0', unpaidDays: unpaid.value,
        noReplyDays: noReply.value, quoteFollowDays: quoteFollow.value,
      } });
      thMsg.textContent = '保存しました';
    } catch (err) { thMsg.textContent = err.message; }
  });

  /* 自社情報 */
  const cName = el('input', { value: settings.companyName });
  const cAddr = el('input', { value: settings.companyAddress });
  const cBank = el('input', { value: settings.bankInfo });
  const coMsg = el('p', { className: 'muted' });
  const coForm = el('form', { className: 'grid-form' }, [
    el('label', { textContent: '会社名' }, [cName]),
    el('label', { textContent: '住所' }, [cAddr]),
    el('label', { textContent: '振込先' }, [cBank]),
    el('button', { type: 'submit', textContent: '保存' }), coMsg,
  ]);
  coForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    coMsg.textContent = '';
    try {
      await api('/api/settings', { method: 'PATCH', body: { companyName: cName.value, companyAddress: cAddr.value, bankInfo: cBank.value } });
      coMsg.textContent = '保存しました';
    } catch (err) { coMsg.textContent = err.message; }
  });

  /* エンジニア管理 */
  const engRows = engineers.map((eng) => {
    const load = el('input', { type: 'number', min: 0, max: 100, value: eng.load, style: 'width:5rem' });
    const proj = el('input', { value: eng.current_project, placeholder: '現在の案件', style: 'width:10rem' });
    const save = el('button', { type: 'button', textContent: '保存', className: 'small' });
    save.addEventListener('click', async () => {
      await api(`/api/engineers/${eng.id}`, { method: 'PATCH', body: { load: Number(load.value), current_project: proj.value } }).catch(() => {});
      renderSettings();
    });
    const toggle = el('button', { type: 'button', textContent: eng.active ? '無効化' : '有効化', className: 'secondary small' });
    toggle.addEventListener('click', async () => {
      await api(`/api/engineers/${eng.id}`, { method: 'PATCH', body: { active: !eng.active } }).catch(() => {});
      renderSettings();
    });
    return el('tr', {}, [
      el('td', { textContent: eng.name + (eng.active ? '' : '(無効)') }),
      el('td', {}, [proj]),
      el('td', {}, [load]),
      el('td', {}, [save, toggle]),
    ]);
  });
  const newEng = el('input', { placeholder: 'エンジニア名', required: true });
  const engForm = el('form', { className: 'row' }, [newEng, el('button', { type: 'submit', textContent: '追加' })]);
  engForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/engineers', { body: { name: newEng.value } });
      renderSettings();
    } catch { /* 入力エラーは無視 */ }
  });

  /* パスワード変更 */
  const cur = el('input', { type: 'password', autocomplete: 'current-password' });
  const next = el('input', { type: 'password', autocomplete: 'new-password' });
  const pwMsg = el('p', { className: 'muted' });
  const pwForm = el('form', { className: 'grid-form' }, [
    el('label', { textContent: '現在のパスワード' }, [cur]),
    el('label', { textContent: '新しいパスワード(8文字以上)' }, [next]),
    el('button', { type: 'submit', textContent: '変更' }), pwMsg,
  ]);
  pwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    pwMsg.textContent = '';
    pwMsg.className = 'muted';
    try {
      await api('/api/auth/password', { body: { current: cur.value, next: next.value } });
      pwMsg.textContent = '変更しました';
      cur.value = next.value = '';
    } catch (err) { pwMsg.textContent = err.message; pwMsg.className = 'error'; }
  });

  layout('設定', el('div', {}, [
    section('危険検知', thForm),
    section('自社情報', coForm),
    section('エンジニア管理', el('div', {}, [
      engineers.length ? table(['名前', '現在の案件', '稼働率(%)', ''], engRows) : el('p', { className: 'muted', textContent: 'エンジニアはまだ登録されていません。' }),
      engForm,
    ])),
    section('パスワード変更', pwForm),
  ]));
}

/* ===== 案件 ===== */

async function renderProjects() {
  const { projects } = await api('/api/projects');

  const rows = projects.map((p) => {
    const tr = el('tr', { className: 'clickable' }, [
      el('td', {}, [el('a', { href: `#/projects/${p.id}`, textContent: p.name })]),
      el('td', { textContent: p.client }),
      el('td', {}, [el('span', { className: `badge s-${p.status}`, textContent: p.status })]),
      el('td', { textContent: man(p.amount) }),
      el('td', { textContent: p.deadline || '—' }),
      el('td', { textContent: `${p.progress}%` }),
      el('td', { textContent: p.open_tasks ? `${p.open_tasks}件` : '—' }),
    ]);
    return tr;
  });

  const name = el('input', { placeholder: '案件名', required: true });
  const client = el('input', { placeholder: '顧客名', required: true });
  const amount = el('input', { type: 'number', placeholder: '金額(円)', min: 0 });
  const deadline = el('input', { type: 'date' });
  const error = el('p', { className: 'error' });
  const form = el('form', { className: 'row' }, [name, client, amount, deadline,
    el('button', { type: 'submit', textContent: '登録' }), error]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    try {
      await api('/api/projects', { body: { name: name.value, client: client.value, amount: Number(amount.value) || 0, deadline: deadline.value } });
      renderProjects();
    } catch (err) { error.textContent = err.message; }
  });

  layout('案件一覧', el('div', {}, [
    section('新規案件', form),
    section(`案件(${projects.length}件)`,
      projects.length ? table(['案件名', '顧客', '状態', '金額', '納期', '進捗', '未完了タスク'], rows)
        : el('p', { className: 'muted', textContent: '案件はまだありません。商談を受注にすると自動作成されます。' })),
  ]));
}

async function renderProjectDetail(id) {
  const { project: p } = await api(`/api/projects/${id}`);

  /* 基本情報編集 */
  const statusSel = el('select', {}, ['開発中', '契約待ち', '保守', '完了'].map((s) =>
    el('option', { value: s, textContent: s, selected: s === p.status })));
  const progress = el('input', { type: 'number', min: 0, max: 100, value: p.progress });
  const amount = el('input', { type: 'number', min: 0, value: p.amount });
  const deadline = el('input', { type: 'date', value: p.deadline || '' });
  const pm = el('input', { value: p.pm, placeholder: 'PM' });
  const note = el('textarea', { value: p.note, rows: 3, placeholder: 'メモ' });
  const saveMsg = el('p', { className: 'muted' });
  const saveBtn = el('button', { type: 'submit', textContent: '保存' });
  const editForm = el('form', { className: 'grid-form' }, [
    el('label', { textContent: '状態' }, [statusSel]),
    el('label', { textContent: '進捗(%)' }, [progress]),
    el('label', { textContent: '金額(円)' }, [amount]),
    el('label', { textContent: '納期' }, [deadline]),
    el('label', { textContent: 'PM' }, [pm]),
    el('label', { textContent: 'メモ' }, [note]),
    saveBtn, saveMsg,
  ]);
  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    saveMsg.textContent = '';
    try {
      await api(`/api/projects/${p.id}`, { method: 'PATCH', body: {
        status: statusSel.value, progress: Number(progress.value),
        amount: Number(amount.value), deadline: deadline.value, pm: pm.value, note: note.value,
      } });
      renderProjectDetail(id);
    } catch (err) { saveMsg.textContent = err.message; saveMsg.className = 'error'; }
  });

  /* タスク */
  const taskRows = p.tasks.map((t) => {
    const check = el('input', { type: 'checkbox', checked: !!t.done });
    check.addEventListener('change', async () => {
      await api(`/api/tasks/${t.id}`, { method: 'PATCH', body: { done: check.checked } }).catch(() => {});
      renderProjectDetail(id);
    });
    const del = el('button', { type: 'button', textContent: '削除', className: 'secondary small' });
    del.addEventListener('click', async () => {
      await api(`/api/tasks/${t.id}`, { method: 'DELETE' }).catch(() => {});
      renderProjectDetail(id);
    });
    return el('li', { className: t.done ? 'done' : '' }, [
      check,
      el('span', { textContent: t.title }),
      el('span', { className: 'muted', textContent: t.due ? `期限 ${t.due}` : '' }),
      del,
    ]);
  });
  const taskTitle = el('input', { placeholder: '新しいタスク', required: true });
  const taskDue = el('input', { type: 'date' });
  const taskForm = el('form', { className: 'row' }, [taskTitle, taskDue, el('button', { type: 'submit', textContent: '追加' })]);
  taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api(`/api/projects/${p.id}/tasks`, { body: { title: taskTitle.value, due: taskDue.value } });
      renderProjectDetail(id);
    } catch { /* 入力エラーは無視 */ }
  });

  const events = el('ul', { className: 'timeline' }, p.events.map((ev) =>
    el('li', {}, [el('span', { className: 'muted', textContent: ev.date }), el('span', { textContent: ev.text })])));

  layout(`${p.name}(${p.client})`, el('div', {}, [
    el('p', {}, [el('a', { href: '#/projects', textContent: '← 案件一覧' })]),
    section('基本情報', editForm),
    section(`タスク(未完了${p.tasks.filter((t) => !t.done).length}件)`, el('div', {}, [
      el('ul', { className: 'tasks' }, taskRows), taskForm,
    ])),
    section('タイムライン', p.events.length ? events : el('p', { className: 'muted', textContent: '履歴はまだありません。' })),
  ]));
}

/* ===== 商談 ===== */

async function renderDeals() {
  const { deals, pipeline } = await api('/api/deals');

  const pipe = el('div', { className: 'pipeline' }, pipeline.map((s) => el('div', { className: 'stage' }, [
    el('span', { className: 'muted', textContent: s.stage }),
    el('strong', { textContent: `${s.count}件` }),
    el('span', { className: 'muted', textContent: `${s.amount.toLocaleString()}万円` }),
  ])));

  const rows = deals.map((d) => el('tr', {}, [
    el('td', {}, [el('a', { href: `#/deals/${d.id}`, textContent: d.title })]),
    el('td', { textContent: d.client }),
    el('td', {}, [el('span', { className: `badge s-${d.stage}`, textContent: d.stage })]),
    el('td', { textContent: man(d.amount) }),
    el('td', { textContent: `${d.probability}%` }),
    el('td', { textContent: d.next_action || '—' }),
  ]));

  const client = el('input', { placeholder: '顧客名', required: true });
  const title = el('input', { placeholder: '商談名', required: true });
  const amount = el('input', { type: 'number', placeholder: '金額(円)', min: 0 });
  const error = el('p', { className: 'error' });
  const form = el('form', { className: 'row' }, [client, title, amount,
    el('button', { type: 'submit', textContent: '登録' }), error]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    try {
      await api('/api/deals', { body: { client: client.value, title: title.value, amount: Number(amount.value) || 0 } });
      renderDeals();
    } catch (err) { error.textContent = err.message; }
  });

  layout('商談', el('div', {}, [
    section('営業パイプライン', pipe),
    section('新規商談', form),
    section(`商談(${deals.length}件)`,
      deals.length ? table(['商談名', '顧客', 'ステージ', '金額', '確度', '次アクション'], rows)
        : el('p', { className: 'muted', textContent: '商談はまだありません。' })),
  ]));
}

async function renderDealDetail(id) {
  const { deal: d, activities, stages } = await api(`/api/deals/${id}`);

  const stageSel = el('select', {}, [...stages, '失注'].map((s) =>
    el('option', { value: s, textContent: s, selected: s === d.stage })));
  const amount = el('input', { type: 'number', min: 0, value: d.amount });
  const probability = el('input', { type: 'number', min: 0, max: 100, value: d.probability });
  const nextAction = el('input', { value: d.next_action, placeholder: '次アクション' });
  const msg = el('p', { className: 'muted' });
  const form = el('form', { className: 'grid-form' }, [
    el('label', { textContent: 'ステージ' }, [stageSel]),
    el('label', { textContent: '金額(円)' }, [amount]),
    el('label', { textContent: '確度(%)' }, [probability]),
    el('label', { textContent: '次アクション' }, [nextAction]),
    el('button', { type: 'submit', textContent: '保存' }), msg,
  ]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';
    msg.className = 'muted';
    try {
      const res = await api(`/api/deals/${d.id}`, { method: 'PATCH', body: {
        stage: stageSel.value, amount: Number(amount.value),
        probability: Number(probability.value), next_action: nextAction.value,
      } });
      if (res.createdProjectId) {
        msg.replaceChildren('受注により案件を自動作成しました → ',
          el('a', { href: `#/projects/${res.createdProjectId}`, textContent: '案件を開く' }));
      } else {
        renderDealDetail(id);
      }
    } catch (err) { msg.textContent = err.message; msg.className = 'error'; }
  });

  const actText = el('input', { placeholder: '活動メモ(訪問・電話・メールなど)', required: true });
  const actForm = el('form', { className: 'row' }, [actText, el('button', { type: 'submit', textContent: '記録' })]);
  actForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api(`/api/deals/${d.id}/activities`, { body: { text: actText.value } });
      renderDealDetail(id);
    } catch { /* 入力エラーは無視 */ }
  });

  const acts = el('ul', { className: 'timeline' }, activities.map((a) =>
    el('li', {}, [el('span', { className: 'muted', textContent: a.date }), el('span', { textContent: a.text })])));

  layout(`${d.title}(${d.client})`, el('div', {}, [
    el('p', {}, [el('a', { href: '#/deals', textContent: '← 商談一覧' })]),
    d.project_id ? el('p', {}, [el('a', { href: `#/projects/${d.project_id}`, textContent: '→ 受注済み: 案件を開く' })]) : '',
    section('商談情報', form),
    section('活動履歴', el('div', {}, [actForm, acts])),
  ]));
}

/* ===== AI共通 ===== */

function sourceBadge(source, model) {
  return el('span', {
    className: 'badge ai-badge',
    textContent: source === 'ai' ? `🤖 AI(${model || 'Claude'})` : '📋 ルールベース',
  });
}

/* ===== AI議事録取込 ===== */

async function renderMinutes() {
  const { projects } = await api('/api/projects');

  const input = el('textarea', { rows: 10, placeholder: '会議の議事録を貼り付けてください。\n例:\n・要件定義書を7/25までに送付する\n・見積書を作成する(来週)' });
  const extractBtn = el('button', { type: 'button', textContent: 'TODOを抽出' });
  const error = el('p', { className: 'error' });
  const resultArea = el('div');

  extractBtn.addEventListener('click', async () => {
    error.textContent = '';
    resultArea.replaceChildren(el('p', { className: 'muted', textContent: '抽出中…' }));
    extractBtn.disabled = true;
    try {
      const result = await api('/api/ai/extract', { body: { text: input.value } });
      renderExtractResult(result);
    } catch (err) {
      error.textContent = err.message;
      resultArea.replaceChildren();
    } finally {
      extractBtn.disabled = false;
    }
  });

  function renderExtractResult(result) {
    if (!result.todos.length) {
      resultArea.replaceChildren(el('p', { className: 'muted', textContent: 'TODOが見つかりませんでした。' }));
      return;
    }
    const checks = result.todos.map((t) => {
      const box = el('input', { type: 'checkbox', checked: true });
      return { box, todo: t, row: el('li', {}, [box,
        el('span', { textContent: t.title }),
        el('span', { className: 'muted', textContent: t.due ? `期限 ${t.due}` : '期限なし' })]) };
    });
    const projSel = el('select', {}, projects.map((p) =>
      el('option', { value: p.id, textContent: `${p.name}(${p.client})` })));
    const registerBtn = el('button', { type: 'button', textContent: '選択したTODOを案件に登録' });
    const msg = el('p', { className: 'muted' });
    registerBtn.addEventListener('click', async () => {
      const selected = checks.filter((c) => c.box.checked).map((c) => c.todo);
      if (!selected.length || !projSel.value) return;
      registerBtn.disabled = true;
      try {
        await api(`/api/projects/${projSel.value}/tasks`, { body: { tasks: selected, source: 'minutes' } });
        msg.replaceChildren(`${selected.length}件を登録しました → `,
          el('a', { href: `#/projects/${projSel.value}`, textContent: '案件を開く' }));
      } catch (err) { msg.textContent = err.message; msg.className = 'error'; }
      registerBtn.disabled = false;
    });
    resultArea.replaceChildren(
      el('div', { className: 'row' }, [sourceBadge(result.source, result.model),
        result.note ? el('span', { className: 'muted', textContent: result.note }) : '']),
      el('ul', { className: 'tasks' }, checks.map((c) => c.row)),
      projects.length
        ? el('div', { className: 'row' }, [projSel, registerBtn, msg])
        : el('p', { className: 'muted', textContent: '登録先の案件がありません。先に案件を作成してください。' }),
    );
  }

  layout('AI議事録取込', el('div', {}, [
    section('議事録からTODOを抽出', el('div', { style: 'display:grid; gap:0.8rem' }, [input, el('div', { className: 'row' }, [extractBtn, error])])),
    section('抽出結果', resultArea),
  ]));
}

/* ===== AI秘書 ===== */

const chatHistory = [];

async function renderAssistant() {
  const d = await api('/api/dashboard');

  const log = el('div', { className: 'chat-log' });
  const renderMsg = (role, text, source, model) => {
    const bubble = el('div', { className: `chat-msg ${role}` }, [
      role === 'assistant' && source ? sourceBadge(source, model) : '',
      el('p', { textContent: text }),
    ]);
    log.append(bubble);
    log.scrollTop = log.scrollHeight;
  };
  for (const m of chatHistory) renderMsg(m.role, m.content, m.source, m.model);
  if (!chatHistory.length) {
    log.append(el('p', { className: 'muted', textContent: '「今日やることは?」「危険案件は?」「今月の売上は?」など、経営データに基づいて回答します。' }));
  }

  const q = el('input', { placeholder: '質問を入力…', required: true });
  const send = el('button', { type: 'submit', textContent: '送信' });
  const form = el('form', { className: 'row' }, [q, send]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = q.value.trim();
    if (!question) return;
    q.value = '';
    send.disabled = true;
    renderMsg('user', question);
    chatHistory.push({ role: 'user', content: question });
    const thinking = el('p', { className: 'muted', textContent: '考え中…' });
    log.append(thinking);
    try {
      const res = await api('/api/ai/chat', { body: { question, history: chatHistory.map(({ role, content }) => ({ role, content })) } });
      thinking.remove();
      renderMsg('assistant', res.reply, res.source, res.model);
      chatHistory.push({ role: 'assistant', content: res.reply, source: res.source, model: res.model });
    } catch (err) {
      thinking.remove();
      renderMsg('assistant', `エラー: ${err.message}`);
    }
    send.disabled = false;
    q.focus();
  });

  layout('AI秘書', el('div', {}, [
    section(d.ai.enabled ? `Claude API 連携中(${d.ai.model})` : 'APIキー未設定(ルールベースで動作中)',
      el('div', { style: 'display:grid; gap:0.8rem' }, [log, form])),
  ]));
  q.focus();
}

/* ===== ルーター ===== */

async function route() {
  if (!currentUser) {
    try {
      const { user } = await api('/api/auth/me');
      currentUser = user;
    } catch {
      renderLogin();
      return;
    }
  }
  const hash = location.hash || '#/';
  let m;
  try {
    if (hash === '#/' || hash === '') await renderHome();
    else if (hash === '#/projects') await renderProjects();
    else if ((m = /^#\/projects\/(\d+)$/.exec(hash))) await renderProjectDetail(m[1]);
    else if (hash === '#/deals') await renderDeals();
    else if ((m = /^#\/deals\/(\d+)$/.exec(hash))) await renderDealDetail(m[1]);
    else if (hash === '#/analytics') await renderAnalytics();
    else if (hash === '#/minutes') await renderMinutes();
    else if (hash === '#/assistant') await renderAssistant();
    else if (hash === '#/settings') await renderSettings();
    else await renderHome();
  } catch (err) {
    if (err.status === 401) { renderLogin(); return; }
    layout('エラー', el('p', { className: 'error', textContent: err.message }));
  }
}

window.addEventListener('hashchange', route);
route();
