'use strict';
/*
 * ============================================================
 *  WEB AKUNTING - Server (Node.js bawaan, tanpa dependensi)
 *  Menyajikan aplikasi web akuntansi & laporan keuangan SAK.
 * ============================================================
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const store = require('./lib/db');
const { DATA_DIR } = require('./lib/paths');
const { DEFAULT_COA } = require('./lib/coa');
const auth = require('./lib/auth');
const acc = require('./lib/accounting');

// Modul AI & impor (opsional) — dimuat terpisah agar pembaruan AI tidak
// perlu mengubah berkas server.js lagi. Bila gagal dimuat, app tetap jalan.
let aiRoutes = null;
try { aiRoutes = require('./lib/routes-ai'); }
catch (e) { console.error('Modul AI tidak dimuat:', e.message); }

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------------- util ----------------
function send(res, status, obj, headers) {
  const body = JSON.stringify(obj);
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, headers || {}));
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 5e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}
function getSession(req) {
  const cookies = auth.parseCookies(req);
  const token = cookies[auth.COOKIE_NAME];
  const payload = auth.verifyToken(token);
  if (!payload) return null;
  const user = store.db().users.find(u => u.id === payload.uid);
  return user || null;
}
function setSessionCookie(res, user) {
  const token = auth.signToken({ uid: user.id });
  const cookie = `${auth.COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax`;
  res.setHeader('Set-Cookie', cookie);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${auth.COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}
function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, companyId: u.companyId };
}

// Perusahaan target untuk laporan (admin boleh melihat perusahaan lain)
function targetCompany(user, query) {
  if (user.role === 'admin' && query.companyId) return query.companyId;
  return user.companyId;
}

// Buat perusahaan + COA default untuk user baru
function bootstrapCompany(user, companyName) {
  const d = store.db();
  const company = { id: store.id(), name: companyName || `Perusahaan ${user.name}`, ownerUserId: user.id, createdAt: new Date().toISOString() };
  d.companies.push(company);
  user.companyId = company.id;
  for (const a of DEFAULT_COA) {
    d.accounts.push(Object.assign({ id: store.id(), companyId: company.id }, a));
  }
  store.saveNow();
  return company;
}

// ---------------- static ----------------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };
function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // fallback ke index.html (SPA)
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, idx) => {
        if (e2) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(idx);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------------- API ----------------
async function handleApi(req, res, pathname, query) {
  const method = req.method;
  const user = getSession(req);

  // -------- Auth publik --------
  if (pathname === '/api/register' && method === 'POST') {
    const b = await readBody(req);
    const name = (b.name || '').trim();
    const email = (b.email || '').trim().toLowerCase();
    const pass = String(b.password || '');
    if (!name || !email || pass.length < 6) return send(res, 400, { error: 'Nama, email, dan kata sandi (min. 6 karakter) wajib diisi.' });
    const d = store.db();
    if (d.users.find(u => u.email === email)) return send(res, 400, { error: 'Email sudah terdaftar.' });
    const { salt, hash } = auth.hashPassword(pass);
    const isFirst = d.users.length === 0; // user pertama otomatis admin/pemilik
    const newUser = { id: store.id(), name, email, salt, passwordHash: hash, role: isFirst ? 'admin' : 'user', companyId: null, createdAt: new Date().toISOString() };
    d.users.push(newUser);
    bootstrapCompany(newUser, b.companyName);
    store.saveNow();
    setSessionCookie(res, newUser);
    return send(res, 200, { user: publicUser(newUser) });
  }

  if (pathname === '/api/login' && method === 'POST') {
    const b = await readBody(req);
    const email = (b.email || '').trim().toLowerCase();
    const pass = String(b.password || '');
    const u = store.db().users.find(x => x.email === email);
    if (!u || !auth.verifyPassword(pass, u.salt, u.passwordHash)) return send(res, 401, { error: 'Email atau kata sandi salah.' });
    setSessionCookie(res, u);
    return send(res, 200, { user: publicUser(u) });
  }

  if (pathname === '/api/logout' && method === 'POST') {
    clearSessionCookie(res);
    return send(res, 200, { ok: true });
  }

  if (pathname === '/api/me' && method === 'GET') {
    if (!user) return send(res, 200, { user: null });
    const company = store.db().companies.find(c => c.id === user.companyId) || null;
    return send(res, 200, { user: publicUser(user), company });
  }

  // -------- Wajib login di bawah ini --------
  if (!user) return send(res, 401, { error: 'Silakan login terlebih dahulu.' });

  // -------- Perusahaan --------
  if (pathname === '/api/company' && method === 'PUT') {
    const b = await readBody(req);
    const c = store.db().companies.find(x => x.id === user.companyId);
    if (c && b.name) { c.name = String(b.name).trim(); store.saveNow(); }
    return send(res, 200, { company: c });
  }

  // -------- Bagan Akun --------
  if (pathname === '/api/accounts' && method === 'GET') {
    const cid = targetCompany(user, query);
    return send(res, 200, { accounts: acc.accountsOf(cid).sort((a, b) => a.code.localeCompare(b.code)) });
  }
  if (pathname === '/api/accounts' && method === 'POST') {
    const b = await readBody(req);
    const d = store.db();
    if (!b.code || !b.name || !b.category) return send(res, 400, { error: 'Kode, nama, dan kategori wajib diisi.' });
    if (d.accounts.find(a => a.companyId === user.companyId && a.code === b.code)) return send(res, 400, { error: 'Kode akun sudah ada.' });
    const a = {
      id: store.id(), companyId: user.companyId, code: String(b.code).trim(), name: String(b.name).trim(),
      category: b.category, subcategory: b.subcategory || '', normal: b.normal || 'D',
      cashFlow: b.cashFlow || 'operasi', isCash: !!b.isCash, isDepr: !!b.isDepr
    };
    d.accounts.push(a); store.saveNow();
    return send(res, 200, { account: a });
  }
  if (pathname.startsWith('/api/accounts/') && (method === 'PUT' || method === 'DELETE')) {
    const id = decodeURIComponent(pathname.split('/')[3]);
    const d = store.db();
    const a = d.accounts.find(x => x.id === id && x.companyId === user.companyId);
    if (!a) return send(res, 404, { error: 'Akun tidak ditemukan.' });
    if (method === 'DELETE') {
      const used = d.journals.some(j => j.companyId === user.companyId && (j.lines || []).some(l => l.accountCode === a.code));
      if (used) return send(res, 400, { error: 'Akun sudah dipakai di jurnal, tidak bisa dihapus.' });
      d.accounts = d.accounts.filter(x => x.id !== id); store.saveNow();
      return send(res, 200, { ok: true });
    }
    const b = await readBody(req);
    ['name', 'category', 'subcategory', 'normal', 'cashFlow'].forEach(k => { if (b[k] !== undefined) a[k] = b[k]; });
    if (b.isCash !== undefined) a.isCash = !!b.isCash;
    if (b.isDepr !== undefined) a.isDepr = !!b.isDepr;
    store.saveNow();
    return send(res, 200, { account: a });
  }

  // -------- Jurnal --------
  if (pathname === '/api/journals' && method === 'GET') {
    const cid = targetCompany(user, query);
    let js = acc.journalsOf(cid);
    if (query.from) js = js.filter(j => j.date >= query.from);
    if (query.to) js = js.filter(j => j.date <= query.to);
    js = js.sort((a, b) => (b.date + b.number).localeCompare(a.date + a.number));
    return send(res, 200, { journals: js });
  }
  if (pathname === '/api/journals' && method === 'POST') {
    const b = await readBody(req);
    const d = store.db();
    const lines = (b.lines || []).map(l => ({ accountCode: l.accountCode, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, memo: l.memo || '' }))
      .filter(l => l.accountCode && (l.debit > 0 || l.credit > 0));
    if (!b.date) return send(res, 400, { error: 'Tanggal wajib diisi.' });
    if (lines.length < 2) return send(res, 400, { error: 'Jurnal minimal memiliki 2 baris.' });
    const totD = lines.reduce((s, l) => s + l.debit, 0);
    const totK = lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totD - totK) > 0.005) return send(res, 400, { error: `Jurnal tidak seimbang. Debit ${totD} ≠ Kredit ${totK}.` });
    const validCodes = new Set(acc.accountsOf(user.companyId).map(a => a.code));
    for (const l of lines) if (!validCodes.has(l.accountCode)) return send(res, 400, { error: `Kode akun ${l.accountCode} tidak dikenal.` });
    const num = 'JU-' + String(store.nextNumber(user.companyId, 'journal')).padStart(5, '0');
    const j = { id: store.id(), companyId: user.companyId, date: b.date, number: num, description: (b.description || '').trim(), createdAt: new Date().toISOString(), lines };
    d.journals.push(j); store.saveNow();
    return send(res, 200, { journal: j });
  }
  if (pathname.startsWith('/api/journals/') && method === 'DELETE') {
    const id = decodeURIComponent(pathname.split('/')[3]);
    const d = store.db();
    const j = d.journals.find(x => x.id === id && x.companyId === user.companyId);
    if (!j) return send(res, 404, { error: 'Jurnal tidak ditemukan.' });
    d.journals = d.journals.filter(x => x.id !== id); store.saveNow();
    return send(res, 200, { ok: true });
  }

  // -------- Laporan --------
  if (pathname === '/api/reports/trial-balance' && method === 'GET') {
    return send(res, 200, acc.trialBalance(targetCompany(user, query), query.from, query.to));
  }
  if (pathname === '/api/reports/ledger' && method === 'GET') {
    return send(res, 200, acc.ledger(targetCompany(user, query), query.code, query.from, query.to));
  }
  if (pathname === '/api/reports/income-statement' && method === 'GET') {
    const cid = targetCompany(user, query);
    const cur = acc.incomeStatement(cid, query.from, query.to);
    let cmp = null;
    if (query.cmpFrom || query.cmpTo) cmp = acc.incomeStatement(cid, query.cmpFrom, query.cmpTo);
    return send(res, 200, { current: cur, compare: cmp });
  }
  if (pathname === '/api/reports/balance-sheet' && method === 'GET') {
    const cid = targetCompany(user, query);
    const cur = acc.balanceSheet(cid, query.asOf);
    let cmp = null;
    if (query.cmpAsOf) cmp = acc.balanceSheet(cid, query.cmpAsOf);
    return send(res, 200, { current: cur, compare: cmp });
  }
  if (pathname === '/api/reports/cash-flow' && method === 'GET') {
    return send(res, 200, acc.cashFlow(targetCompany(user, query), query.from, query.to));
  }
  if (pathname === '/api/reports/variance' && method === 'GET') {
    return send(res, 200, acc.variance(targetCompany(user, query), query.from, query.to, query.mode || 'anggaran', query.cmpFrom, query.cmpTo));
  }

  // -------- Anggaran --------
  if (pathname === '/api/budgets' && method === 'GET') {
    const cid = targetCompany(user, query);
    const year = query.year;
    const list = store.db().budgets.filter(b => b.companyId === cid && (!year || String(b.year) === String(year)));
    return send(res, 200, { budgets: list });
  }
  if (pathname === '/api/budgets' && method === 'POST') {
    const b = await readBody(req);
    const d = store.db();
    const year = String(b.year);
    const code = b.accountCode;
    if (!year || !code) return send(res, 400, { error: 'Tahun dan kode akun wajib diisi.' });
    let rec = d.budgets.find(x => x.companyId === user.companyId && String(x.year) === year && x.accountCode === code);
    if (!rec) { rec = { id: store.id(), companyId: user.companyId, year, accountCode: code, amounts: new Array(12).fill(0) }; d.budgets.push(rec); }
    if (Array.isArray(b.amounts)) rec.amounts = b.amounts.map(n => Number(n) || 0);
    store.saveNow();
    return send(res, 200, { budget: rec });
  }

  // -------- Rekonsiliasi Bank --------
  if (pathname === '/api/bank-recs' && method === 'GET') {
    const cid = targetCompany(user, query);
    return send(res, 200, { recs: store.db().bankRecs.filter(r => r.companyId === cid).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
  }
  if (pathname === '/api/bank-recs' && method === 'POST') {
    const b = await readBody(req);
    const d = store.db();
    const rec = {
      id: store.id(), companyId: user.companyId, accountCode: b.accountCode, statementDate: b.statementDate,
      statementBalance: Number(b.statementBalance) || 0, items: b.items || [], note: b.note || '', createdAt: new Date().toISOString()
    };
    d.bankRecs.push(rec); store.saveNow();
    return send(res, 200, { rec });
  }
  if (pathname.startsWith('/api/bank-recs/') && method === 'DELETE') {
    const id = decodeURIComponent(pathname.split('/')[3]);
    const d = store.db();
    d.bankRecs = d.bankRecs.filter(r => !(r.id === id && r.companyId === user.companyId)); store.saveNow();
    return send(res, 200, { ok: true });
  }

  // -------- Admin --------
  if (pathname === '/api/admin/users' && method === 'GET') {
    if (user.role !== 'admin') return send(res, 403, { error: 'Khusus admin.' });
    const d = store.db();
    const list = d.users.map(u => {
      const company = d.companies.find(c => c.id === u.companyId);
      const jCount = d.journals.filter(j => j.companyId === u.companyId).length;
      return { id: u.id, name: u.name, email: u.email, role: u.role, companyId: u.companyId, companyName: company ? company.name : '-', jumlahJurnal: jCount, createdAt: u.createdAt };
    });
    return send(res, 200, { users: list });
  }
  if (pathname.startsWith('/api/admin/users/') && method === 'DELETE') {
    if (user.role !== 'admin') return send(res, 403, { error: 'Khusus admin.' });
    const id = decodeURIComponent(pathname.split('/')[4]);
    if (id === user.id) return send(res, 400, { error: 'Tidak bisa menghapus akun sendiri.' });
    const d = store.db();
    const target = d.users.find(u => u.id === id);
    if (!target) return send(res, 404, { error: 'Pengguna tidak ditemukan.' });
    d.users = d.users.filter(u => u.id !== id);
    d.companies = d.companies.filter(c => c.id !== target.companyId);
    d.accounts = d.accounts.filter(a => a.companyId !== target.companyId);
    d.journals = d.journals.filter(j => j.companyId !== target.companyId);
    d.budgets = d.budgets.filter(bb => bb.companyId !== target.companyId);
    d.bankRecs = d.bankRecs.filter(r => r.companyId !== target.companyId);
    store.saveNow();
    return send(res, 200, { ok: true });
  }
  if (pathname === '/api/admin/set-role' && method === 'POST') {
    if (user.role !== 'admin') return send(res, 403, { error: 'Khusus admin.' });
    const b = await readBody(req);
    const d = store.db();
    const target = d.users.find(u => u.id === b.userId);
    if (!target) return send(res, 404, { error: 'Pengguna tidak ditemukan.' });
    if (['admin', 'user'].includes(b.role)) { target.role = b.role; store.saveNow(); }
    return send(res, 200, { ok: true });
  }

  // ---- Rute AI & Impor (modul terpisah) ----
  if (aiRoutes) {
    const handled = await aiRoutes.handle(req, res, { pathname, method, query, user, send, readBody });
    if (handled) return;
  }

  return send(res, 404, { error: 'Endpoint tidak ditemukan.' });
}

// ---------------- server ----------------
store.load();
const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname, parsed.query).catch(err => {
      console.error('API error:', err);
      send(res, 500, { error: 'Terjadi kesalahan pada server.' });
    });
  } else {
    serveStatic(req, res, pathname);
  }
});
server.listen(PORT, () => {
  console.log(`\n  Abhista Fin berjalan di:   http://localhost:${PORT}`);
  console.log(`  Data tersimpan di:         ${DATA_DIR}`);
  console.log(`  Tekan Ctrl+C untuk menghentikan.\n`);
});
