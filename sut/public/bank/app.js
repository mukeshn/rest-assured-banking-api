// Northbridge Bank - shared client helpers
export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
export const WARNING_BEFORE_MS = 60 * 1000;

export const token = {
  get: () => sessionStorage.getItem('nb.token'),
  set: (t) => sessionStorage.setItem('nb.token', t),
  clear: () => sessionStorage.removeItem('nb.token'),
};
export async function api(path, opts = {}) {
  const headers = { 'content-type': 'application/json', ...(token.get() ? { authorization: `Bearer ${token.get()}` } : {}) };
  const res = await fetch(path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (res.status === 401 && token.get()) { token.clear(); location.href = '/bank/login.html?reason=expired'; }
  const data = res.status === 204 ? null : (res.headers.get('content-type') || '').includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw Object.assign(new Error(data?.message || data?.error), { status: res.status, data });
  return data;
}
export const eur = (v) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v);
export const formatIban = (iban) => (iban || '').replace(/(.{4})/g, '$1 ').trim();

export function requireLogin() {
  if (!token.get()) { location.href = '/bank/login.html'; throw new Error('redirect'); }
}

export function renderShell(active) {
  const h = document.createElement('header');
  h.className = 'top';
  h.innerHTML = `<strong>Northbridge Bank</strong>
    <nav class="links" aria-label="Main">
      <a href="/bank/dashboard.html" ${active === 'dashboard' ? 'aria-current="page"' : ''}>Accounts</a> ·
      <a href="/bank/transfer.html" ${active === 'transfer' ? 'aria-current="page"' : ''} data-testid="nav-transfer">Transfer</a> ·
      <a href="/bank/loan.html" ${active === 'loan' ? 'aria-current="page"' : ''} data-testid="nav-loan">Loans</a>
    </nav><span class="spacer"></span>
    <span data-testid="customer-name">${sessionStorage.getItem('nb.name') || ''}</span>
    <a href="#" data-testid="logout">Log out</a>`;
  document.body.prepend(h);
  h.querySelector('[data-testid="logout"]').addEventListener('click', async (e) => {
    e.preventDefault();
    try { await api('/api/bank/auth/logout', { method: 'POST' }); } catch {}
    token.clear();
    location.href = '/bank/login.html?reason=logout';
  });
  startIdleTimer();
}

function startIdleTimer() {
  const dlg = document.createElement('dialog');
  dlg.setAttribute('data-testid', 'timeout-warning');
  dlg.innerHTML = `<h2>Are you still there?</h2><p>For your security you will be logged out in <span data-testid="timeout-countdown">60</span> seconds.</p>
    <button class="btn" data-testid="stay-logged-in">Stay logged in</button>`;
  document.body.append(dlg);
  let last = Date.now();
  const reset = () => { last = Date.now(); if (dlg.open) dlg.close(); };
  ['click', 'keydown'].forEach((ev) => document.addEventListener(ev, (e) => { if (!dlg.contains(e.target)) last = Date.now(); }));
  dlg.querySelector('button').addEventListener('click', reset);
  setInterval(() => {
    const idle = Date.now() - last;
    if (idle >= IDLE_TIMEOUT_MS) { token.clear(); location.href = '/bank/login.html?reason=timeout'; return; }
    if (idle >= IDLE_TIMEOUT_MS - WARNING_BEFORE_MS) {
      if (!dlg.open) dlg.showModal();
      dlg.querySelector('[data-testid="timeout-countdown"]').textContent = Math.ceil((IDLE_TIMEOUT_MS - idle) / 1000);
    }
  }, 1000);
}
