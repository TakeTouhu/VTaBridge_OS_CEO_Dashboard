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

async function renderHome() {
  const d = await api('/api/dashboard');

  const tasks = d.todayTasks.length
    ? el('ol', { className: 'today' }, d.todayTasks.map((t) => el('li', {}, [
        el('a', { href: t.link, textContent: t.title }),
        el('p', { className: 'muted', textContent: t.why }),
      ])))
    : el('p', { className: 'muted', textContent: '今日やることはありません。' });

  const pipe = el('div', { className: 'pipeline' }, d.pipeline.map((s) => el('div', { className: 'stage' }, [
    el('span', { className: 'muted', textContent: s.stage }),
    el('strong', { textContent: `${s.count}件` }),
    el('span', { className: 'muted', textContent: `${s.amount.toLocaleString()}万円` }),
  ])));

  layout('ホーム', el('div', {}, [
    section('今日やること(最大3件)', tasks),
    section('営業パイプライン', pipe),
    section('KPI・危険検知', el('p', { className: 'muted', textContent: 'Phase 3 で実装されます。' })),
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
    else await renderHome();
  } catch (err) {
    if (err.status === 401) { renderLogin(); return; }
    layout('エラー', el('p', { className: 'error', textContent: err.message }));
  }
}

window.addEventListener('hashchange', route);
route();
