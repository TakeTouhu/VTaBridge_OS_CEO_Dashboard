'use strict';

/* XSS対策: DOMはすべて createElement + textContent で構築する */

const app = document.getElementById('app');

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const child of children) node.append(child);
  return node;
}

function renderLogin(message = '') {
  const error = el('p', { className: 'error', textContent: message });
  const email = el('input', { type: 'email', name: 'email', required: true, autocomplete: 'username', placeholder: 'ceo@example.com' });
  const password = el('input', { type: 'password', name: 'password', required: true, autocomplete: 'current-password' });
  const submit = el('button', { type: 'submit', textContent: 'ログイン' });

  const form = el('form', { className: 'card' }, [
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
      renderHome(user);
    } catch (err) {
      error.textContent = err.message;
      submit.disabled = false;
    }
  });

  app.replaceChildren(form);
  email.focus();
}

function renderHome(user) {
  const logout = el('button', { type: 'button', textContent: 'ログアウト', className: 'secondary' });
  logout.addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    renderLogin();
  });

  app.replaceChildren(el('div', { className: 'card' }, [
    el('h1', { textContent: 'VTaBridge OS — CEO Dashboard' }),
    el('p', { textContent: `ログイン中: ${user.name}(${user.email})` }),
    el('p', { className: 'muted', textContent: 'ホーム画面(今日やること最大3件・KPI・危険案件)は Phase 2 以降で実装されます。' }),
    logout,
  ]));
}

(async function init() {
  try {
    const { user } = await api('/api/auth/me');
    renderHome(user);
  } catch {
    renderLogin();
  }
})();
