import { send } from '../lib.mjs';
import { randomUUID } from 'node:crypto';

// Northbridge Bank mock. Every login gets its own copy of the account data,
// so parallel test workers never fight over balances.
export const DAILY_LIMIT = 5000;
const USERS = {
  'j.schneider': { password: 'Demo#2026', name: 'Julia Schneider', customerId: 'C-48213' },
  'm.weber': { password: 'Demo#2026', name: 'Max Weber', customerId: 'C-50077' },
  'blocked.user': { password: 'Demo#2026', name: 'Blocked User', customerId: 'C-00001', blocked: true },
};
const OTP = '246810';
const CLIENTS = { 'partner-app': { secret: 'p4rtn3r-s3cret', scopes: ['accounts:read', 'transfers:write'] }, 'readonly-app': { secret: 'r34d-0nly', scopes: ['accounts:read'] } };

const seedAccounts = (customerId) => [
  { id: 'ACC-001', type: 'CHECKING', name: 'Girokonto', iban: 'DE89370400440532013000', currency: 'EUR', balance: 3250.75, customerId },
  { id: 'ACC-002', type: 'SAVINGS', name: 'Tagesgeld', iban: 'DE02120300000000202051', currency: 'EUR', balance: 12500.0, customerId },
  { id: 'ACC-003', type: 'CREDIT_CARD', name: 'Visa Card', iban: null, maskedPan: '**** **** **** 4417', currency: 'EUR', balance: -420.1, limit: 2500, customerId },
];
const seedTx = () => [
  { id: 'TX-9001', accountId: 'ACC-001', date: '2026-11-02', description: 'Salary November', amount: 3200.0, category: 'INCOME' },
  { id: 'TX-9002', accountId: 'ACC-001', date: '2026-11-03', description: 'Rent Oberhausen', amount: -1150.0, category: 'HOUSING' },
  { id: 'TX-9003', accountId: 'ACC-001', date: '2026-11-05', description: 'REWE Markt', amount: -64.37, category: 'GROCERIES' },
  { id: 'TX-9004', accountId: 'ACC-001', date: '2026-11-07', description: 'Deutsche Bahn', amount: -89.9, category: 'TRAVEL' },
  { id: 'TX-9005', accountId: 'ACC-001', date: '2026-11-09', description: 'Stadtwerke Strom', amount: -72.0, category: 'UTILITIES' },
  { id: 'TX-9006', accountId: 'ACC-002', date: '2026-11-01', description: 'Interest', amount: 18.23, category: 'INCOME' },
  { id: 'TX-9007', accountId: 'ACC-003', date: '2026-11-04', description: 'Online Shop', amount: -120.1, category: 'SHOPPING' },
  { id: 'TX-9008', accountId: 'ACC-003', date: '2026-11-06', description: 'Restaurant', amount: -300.0, category: 'DINING' },
];

const challenges = new Map();
const sessions = new Map();

export function validIban(raw) {
  const iban = String(raw || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  if (iban.startsWith('DE') && iban.length !== 22) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const d of digits) rem = (rem * 10 + Number(d)) % 97;
  return rem === 1;
}

function session(ctx, scope) {
  const h = ctx.req.headers.authorization || '';
  const s = h.startsWith('Bearer ') ? sessions.get(h.slice(7)) : null;
  if (!s) { send(ctx.res, 401, { error: 'UNAUTHORIZED', message: 'Missing or invalid access token' }); return null; }
  if (s.expiresAt < Date.now()) { sessions.delete(h.slice(7)); send(ctx.res, 401, { error: 'TOKEN_EXPIRED' }); return null; }
  if (scope && !s.scopes.includes(scope)) { send(ctx.res, 403, { error: 'INSUFFICIENT_SCOPE', required: scope }); return null; }
  return s;
}
function newSession(data) {
  const token = randomUUID();
  const s = { ...data, accounts: seedAccounts(data.customerId), transactions: seedTx(), transfers: [], beneficiaries: [], spentToday: 0, expiresAt: Date.now() + 15 * 60_000 };
  sessions.set(token, s);
  return token;
}

export function register(r) {
  r.post('/api/bank/auth/login', ({ res, body }) => {
    const u = USERS[body.username];
    if (!u || u.password !== body.password) return send(res, 401, { error: 'INVALID_CREDENTIALS', message: 'Username or password is incorrect' });
    if (u.blocked) return send(res, 403, { error: 'ACCOUNT_BLOCKED', message: 'Online banking access is blocked' });
    const challengeId = randomUUID();
    challenges.set(challengeId, { username: body.username, attempts: 0 });
    send(res, 200, { challengeId, method: 'SMS', maskedPhone: '+49 *** ****21' });
  });
  // Test hook: real banks expose a sandbox OTP; we keep it fixed and documented.
  r.get('/api/bank/__test/otp', ({ res }) => send(res, 200, { otp: OTP }));
  r.post('/api/bank/auth/otp', ({ res, body }) => {
    const c = challenges.get(body.challengeId);
    if (!c) return send(res, 400, { error: 'INVALID_CHALLENGE' });
    if (body.otp !== OTP) {
      c.attempts += 1;
      if (c.attempts >= 3) { challenges.delete(body.challengeId); return send(res, 429, { error: 'TOO_MANY_ATTEMPTS', message: 'Too many attempts. Please log in again.' }); }
      return send(res, 401, { error: 'INVALID_OTP', attemptsLeft: 3 - c.attempts });
    }
    challenges.delete(body.challengeId);
    const u = USERS[c.username];
    const token = newSession({ username: c.username, name: u.name, customerId: u.customerId, scopes: ['accounts:read', 'transfers:write'] });
    send(res, 200, { accessToken: token, tokenType: 'Bearer', expiresIn: 900, customer: { name: u.name, customerId: u.customerId } });
  });
  r.post('/api/bank/oauth/token', ({ req, res, body }) => {
    let id = body.client_id, secret = body.client_secret;
    const basic = req.headers.authorization?.startsWith('Basic ') ? Buffer.from(req.headers.authorization.slice(6), 'base64').toString().split(':') : null;
    if (basic) [id, secret] = basic;
    if (body.grant_type !== 'client_credentials') return send(res, 400, { error: 'unsupported_grant_type' });
    const c = CLIENTS[id];
    if (!c || c.secret !== secret) return send(res, 401, { error: 'invalid_client' });
    const requested = body.scope ? String(body.scope).split(' ') : c.scopes;
    if (requested.some((s) => !c.scopes.includes(s))) return send(res, 400, { error: 'invalid_scope' });
    const token = newSession({ username: id, name: id, customerId: 'C-48213', scopes: requested });
    send(res, 200, { access_token: token, token_type: 'Bearer', expires_in: 900, scope: requested.join(' ') });
  });
  r.post('/api/bank/auth/logout', (ctx) => { const s = session(ctx); if (!s) return; sessions.delete(ctx.req.headers.authorization.slice(7)); send(ctx.res, 204, ''); });

  r.get('/api/bank/accounts', (ctx) => { const s = session(ctx, 'accounts:read'); if (s) send(ctx.res, 200, { customer: s.name, accounts: s.accounts }); });
  r.get('/api/bank/accounts/:id', (ctx) => {
    const s = session(ctx, 'accounts:read'); if (!s) return;
    const a = s.accounts.find((x) => x.id === ctx.params.id);
    a ? send(ctx.res, 200, a) : send(ctx.res, 404, { error: 'ACCOUNT_NOT_FOUND' });
  });
  r.get('/api/bank/accounts/:id/transactions', (ctx) => {
    const s = session(ctx, 'accounts:read'); if (!s) return;
    if (!s.accounts.some((a) => a.id === ctx.params.id)) return send(ctx.res, 404, { error: 'ACCOUNT_NOT_FOUND' });
    let tx = s.transactions.filter((t) => t.accountId === ctx.params.id);
    const from = ctx.query.get('from'), to = ctx.query.get('to'), cat = ctx.query.get('category');
    if (from) tx = tx.filter((t) => t.date >= from);
    if (to) tx = tx.filter((t) => t.date <= to);
    if (cat) tx = tx.filter((t) => t.category === cat);
    tx.sort((a, b) => b.date.localeCompare(a.date));
    send(ctx.res, 200, { accountId: ctx.params.id, count: tx.length, transactions: tx });
  });
  r.get('/api/bank/accounts/:id/statement.csv', (ctx) => {
    const s = session(ctx, 'accounts:read'); if (!s) return;
    const tx = s.transactions.filter((t) => t.accountId === ctx.params.id);
    const csv = ['date;description;category;amount', ...tx.map((t) => `${t.date};${t.description};${t.category};${t.amount.toFixed(2)}`)].join('\n');
    send(ctx.res, 200, csv, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="statement-${ctx.params.id}-2026-11.csv"` });
  });

  r.post('/api/bank/iban/validate', ({ res, body }) => {
    const iban = String(body.iban || '').replace(/\s+/g, '').toUpperCase();
    send(res, 200, { iban, valid: validIban(iban), country: iban.slice(0, 2) || null, bankCode: iban.startsWith('DE') ? iban.slice(4, 12) : null });
  });

  r.post('/api/bank/transfers', (ctx) => {
    const s = session(ctx, 'transfers:write'); if (!s) return;
    const { fromAccountId, beneficiaryName, iban, amount, reference = '', executionDate } = ctx.body;
    const errors = [];
    const from = s.accounts.find((a) => a.id === fromAccountId);
    if (!from) errors.push({ field: 'fromAccountId', message: 'Unknown account' });
    else if (from.type === 'CREDIT_CARD') errors.push({ field: 'fromAccountId', message: 'Transfers from credit card accounts are not allowed' });
    if (!beneficiaryName || String(beneficiaryName).trim().length < 2) errors.push({ field: 'beneficiaryName', message: 'Beneficiary name is required' });
    if (!validIban(iban)) errors.push({ field: 'iban', message: 'IBAN is invalid' });
    if (typeof amount !== 'number' || !(amount > 0)) errors.push({ field: 'amount', message: 'Amount must be greater than 0' });
    else if (Math.round(amount * 100) !== amount * 100) errors.push({ field: 'amount', message: 'Amount can have at most 2 decimals' });
    if (String(reference).length > 140) errors.push({ field: 'reference', message: 'Reference must be at most 140 characters' });
    if (errors.length) return send(ctx.res, 422, { error: 'VALIDATION', errors });
    if (from.iban && from.iban === String(iban).replace(/\s+/g, '').toUpperCase()) return send(ctx.res, 422, { error: 'VALIDATION', errors: [{ field: 'iban', message: 'Cannot transfer to the same account' }] });
    if (amount > from.balance) return send(ctx.res, 409, { error: 'INSUFFICIENT_FUNDS', available: from.balance });
    if (s.spentToday + amount > DAILY_LIMIT) return send(ctx.res, 409, { error: 'DAILY_LIMIT_EXCEEDED', limit: DAILY_LIMIT, remaining: +(DAILY_LIMIT - s.spentToday).toFixed(2) });
    const scheduled = executionDate && executionDate > new Date().toISOString().slice(0, 10);
    const t = { id: `TRF-${Math.random().toString(36).slice(2, 10).toUpperCase()}`, fromAccountId, beneficiaryName, iban: String(iban).replace(/\s+/g, '').toUpperCase(), amount, currency: 'EUR', reference, status: scheduled ? 'SCHEDULED' : 'EXECUTED', executionDate: executionDate || new Date().toISOString().slice(0, 10), createdAt: new Date().toISOString() };
    if (!scheduled) {
      from.balance = +(from.balance - amount).toFixed(2);
      s.spentToday += amount;
      s.transactions.push({ id: `TX-${t.id.slice(4)}`, accountId: fromAccountId, date: t.executionDate, description: `Transfer to ${beneficiaryName}`, amount: -amount, category: 'TRANSFER' });
    }
    s.transfers.push(t);
    send(ctx.res, 201, t, { location: `/api/bank/transfers/${t.id}` });
  });
  r.get('/api/bank/transfers/:id', (ctx) => {
    const s = session(ctx, 'accounts:read'); if (!s) return;
    const t = s.transfers.find((x) => x.id === ctx.params.id);
    t ? send(ctx.res, 200, t) : send(ctx.res, 404, { error: 'TRANSFER_NOT_FOUND' });
  });
  r.delete('/api/bank/transfers/:id', (ctx) => {
    const s = session(ctx, 'transfers:write'); if (!s) return;
    const t = s.transfers.find((x) => x.id === ctx.params.id);
    if (!t) return send(ctx.res, 404, { error: 'TRANSFER_NOT_FOUND' });
    if (t.status !== 'SCHEDULED') return send(ctx.res, 409, { error: 'NOT_CANCELLABLE', message: 'Only scheduled transfers can be cancelled' });
    t.status = 'CANCELLED';
    send(ctx.res, 200, t);
  });
  r.get('/api/bank/beneficiaries', (ctx) => { const s = session(ctx, 'accounts:read'); if (s) send(ctx.res, 200, s.beneficiaries); });
  r.post('/api/bank/beneficiaries', (ctx) => {
    const s = session(ctx, 'transfers:write'); if (!s) return;
    const { name, iban } = ctx.body;
    if (!name || !validIban(iban)) return send(ctx.res, 422, { error: 'VALIDATION', message: 'name and a valid iban are required' });
    if (s.beneficiaries.some((b) => b.iban === iban)) return send(ctx.res, 409, { error: 'DUPLICATE_BENEFICIARY' });
    const b = { id: `BEN-${s.beneficiaries.length + 1}`, name, iban };
    s.beneficiaries.push(b);
    send(ctx.res, 201, b);
  });
  r.post('/api/bank/loans/quote', ({ res, body }) => {
    const { amount, termMonths, annualRate } = body;
    if (!(amount >= 1000 && amount <= 100000)) return send(res, 422, { error: 'VALIDATION', message: 'amount must be between 1000 and 100000' });
    if (![12, 24, 36, 48, 60, 72, 84].includes(termMonths)) return send(res, 422, { error: 'VALIDATION', message: 'termMonths must be one of 12..84 in steps of 12' });
    const i = (annualRate ?? 5.99) / 100 / 12;
    const monthly = i === 0 ? amount / termMonths : (amount * i) / (1 - Math.pow(1 + i, -termMonths));
    // Customers pay the rounded instalment, so totals are based on it.
    const instalment = Math.round(monthly * 100) / 100;
    const total = Math.round(instalment * termMonths * 100) / 100;
    send(res, 200, { amount, termMonths, annualRate: annualRate ?? 5.99, monthlyPayment: instalment, totalRepayment: total, totalInterest: Math.round((total - amount) * 100) / 100 });
  });
}
