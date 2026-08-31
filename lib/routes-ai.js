'use strict';
/*
 * Rute API untuk fitur AI & impor. Dipisah dari server.js agar pembaruan fitur AI
 * berikutnya tidak perlu menyentuh berkas root server.js.
 *
 * handle(req, res, ctx) -> mengembalikan true bila menangani rute, selain itu false.
 * ctx = { pathname, method, query, user, send, readBody }
 */
const store = require('./db');
const acc = require('./accounting');
const importer = require('./importer');
const clf = require('./classifier');
const ai = require('./ai');
let routesConsult = null;
try { routesConsult = require('./routes-consult'); }
catch (e) { console.error('Modul konsultan tidak dimuat:', e.message); }
let routesBooks = null;
try { routesBooks = require('./routes-books'); }
catch (e) { console.error('Modul buku per-klien tidak dimuat:', e.message); }
const books = (() => { try { return require('./books'); } catch (e) { return null; } })();

function aiSettings() {
  const d = store.db();
  d.settings = d.settings || {};
  return d.settings;
}

/* Tentukan buku (scope) efektif untuk impor: dari bookId (body/query) bila ada &
 * boleh diakses, selain itu jatuh ke buku firma user. Mengembalikan companyId scope. */
function bookScope(user, query, body) {
  const bid = (body && (body.bookId || body.companyId)) || (query && (query.bookId || query.companyId));
  if (!bid || bid === user.companyId) return user.companyId;
  if (!books) return user.companyId;
  const r = books.resolve(user, bid);
  return r.ok ? r.scopeId : user.companyId;
}

/* Cocokkan baris impor dengan jurnal yang sudah ada (hindari dobel-posting). */
function findMatch(companyId, bankCode, tanggal, nominal) {
  const js = acc.journalsOf(companyId);
  const t0 = Date.parse(tanggal);
  for (const j of js) {
    const dt = Date.parse(j.date);
    if (Math.abs(dt - t0) > 3 * 864e5) continue; // ±3 hari
    for (const l of (j.lines || [])) {
      if (l.accountCode === bankCode && Math.abs((Number(l.debit) || 0) + (Number(l.credit) || 0) - nominal) < 1) {
        return j.id;
      }
    }
  }
  return null;
}

// Pastikan akun standar tertentu tersedia (mis. Dompet Digital) untuk perusahaan lama.
function ensureStandardAccounts(companyId) {
  const d = store.db();
  const extra = [
    { code: '1-1250', name: 'Kas — Dompet Digital (e-Wallet)', category: 'ASET', subcategory: 'Aset Lancar', normal: 'D', cashFlow: 'operasi', isCash: true }
  ];
  let added = false;
  for (const a of extra) {
    if (!d.accounts.some(x => x.companyId === companyId && x.code === a.code)) {
      d.accounts.push(Object.assign({ id: store.id(), companyId }, a)); added = true;
    }
  }
  if (added) store.saveNow();
}

function buildRows(companyId, bankCode, transaksi) {
  const accounts = acc.accountsOf(companyId);
  const rules = clf.rulesFor(companyId);
  const anomali = clf.detectAnomalies(transaksi);
  const byCode = {}; accounts.forEach(a => byCode[a.code] = a);
  return transaksi.map((t, i) => {
    const c = clf.classify(companyId, t.keterangan, t.arah, accounts, rules);
    return {
      id: store.id(),
      tanggal: t.tanggal, keterangan: t.keterangan, nominal: t.nominal, arah: t.arah,
      suggestedCode: c.code, confidence: c.confidence, source: c.source,
      jenis: clf.jenisDari(byCode[c.code]),
      splits: null,
      anomali: anomali[i] || [],
      matchedJournalId: findMatch(companyId, bankCode, t.tanggal, t.nominal),
      skip: false, posted: false, journalId: null
    };
  });
}

async function handle(req, res, ctx) {
  const { pathname, method, query, user, send, readBody } = ctx;
  // Delegasikan ke modul konsultan / buku per-klien bila cocok
  if (routesConsult && routesConsult.owns(pathname)) return await routesConsult.handle(req, res, ctx);
  if (routesBooks && routesBooks.owns(pathname)) return await routesBooks.handle(req, res, ctx);
  if (!/^\/api\/(ai|import|classify|settings|rules|journals)/.test(pathname)) return false;
  if (!user) { send(res, 401, { error: 'Silakan login.' }); return true; }
  const d = store.db();

  /* ---------- Setelan AI (admin) ---------- */
  if (pathname === '/api/settings/ai' && method === 'GET') {
    const s = aiSettings();
    send(res, 200, { hasKey: !!s.aiKey, model: s.aiModel || 'claude-3-5-sonnet-latest', enabled: !!s.aiEnabled });
    return true;
  }
  if (pathname === '/api/settings/ai' && method === 'POST') {
    if (user.role !== 'admin') { send(res, 403, { error: 'Khusus admin.' }); return true; }
    const b = await readBody(req);
    const s = aiSettings();
    if (typeof b.key === 'string' && b.key.trim()) s.aiKey = b.key.trim();
    if (b.clearKey) s.aiKey = '';
    if (typeof b.model === 'string' && b.model.trim()) s.aiModel = b.model.trim();
    if (b.enabled !== undefined) s.aiEnabled = !!b.enabled;
    store.saveNow();
    send(res, 200, { ok: true, hasKey: !!s.aiKey, model: s.aiModel, enabled: !!s.aiEnabled });
    return true;
  }

  /* ---------- Klasifikasi cepat (bantu entri manual) ---------- */
  if (pathname === '/api/classify' && method === 'POST') {
    const b = await readBody(req);
    const scope = bookScope(user, query, b);
    const c = clf.classify(scope, b.keterangan || '', b.arah || 'keluar', acc.accountsOf(scope));
    send(res, 200, c);
    return true;
  }

  /* ---------- Impor: parse CSV/XLSX ---------- */
  if (pathname === '/api/import/parse' && method === 'POST') {
    const b = await readBody(req);
    const bankCode = b.bankAccountCode;
    if (!bankCode) { send(res, 400, { error: 'Pilih akun kas/bank tujuan terlebih dahulu.' }); return true; }
    let hasil;
    try {
      if (b.kind === 'xlsx') hasil = importer.importFromXlsx(Buffer.from(b.base64 || '', 'base64'));
      else hasil = importer.importFromCSV(b.text || '');
    } catch (e) { send(res, 400, { error: 'Gagal membaca file: ' + e.message }); return true; }
    const scope = bookScope(user, query, b);
    ensureStandardAccounts(scope);
    const rows = buildRows(scope, bankCode, hasil.transaksi);
    const batch = {
      id: store.id(), companyId: scope, createdAt: new Date().toISOString(),
      source: b.kind === 'xlsx' ? 'xlsx' : 'csv', filename: b.filename || '', bankAccountCode: bankCode,
      rows, warnings: hasil.warnings || []
    };
    d.imports.push(batch); store.saveNow();
    send(res, 200, { batch });
    return true;
  }

  /* ---------- Impor: OCR nota/PDF (AI) ---------- */
  if (pathname === '/api/ai/ocr' && method === 'POST') {
    const b = await readBody(req);
    const s = aiSettings();
    const bankCode = b.bankAccountCode;
    if (!bankCode) { send(res, 400, { error: 'Pilih akun kas/bank pembayaran terlebih dahulu.' }); return true; }
    let data;
    try {
      data = await ai.extractDocument({ key: s.aiKey, model: s.aiModel, base64: b.base64, mediaType: b.mediaType });
    } catch (e) { send(res, 400, { error: e.message }); return true; }
    const nominal = Number(data.total) || Number(data.subtotal) || 0;
    const trx = [{
      tanggal: data.tanggal || new Date().toISOString().slice(0, 10),
      keterangan: `${data.vendor || 'Nota'}${data.keterangan ? ' - ' + data.keterangan : ''}`,
      nominal, arah: (data.arah === 'masuk' ? 'masuk' : 'keluar')
    }];
    const scope = bookScope(user, query, b);
    const rows = buildRows(scope, bankCode, trx);
    // pakai saran kategori dari AI bila cocok
    const batch = {
      id: store.id(), companyId: scope, createdAt: new Date().toISOString(),
      source: 'ocr', filename: b.filename || 'nota', bankAccountCode: bankCode, rows, warnings: [],
      ocr: data
    };
    d.imports.push(batch); store.saveNow();
    send(res, 200, { batch, extracted: data });
    return true;
  }

  /* ---------- Daftar & detail batch ---------- */
  if (pathname === '/api/import' && method === 'GET') {
    const cid = bookScope(user, query, null);
    const list = d.imports.filter(x => x.companyId === cid)
      .map(x => ({ id: x.id, createdAt: x.createdAt, source: x.source, filename: x.filename,
        jumlah: x.rows.length, terposting: x.rows.filter(r => r.posted).length }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    send(res, 200, { imports: list });
    return true;
  }
  if (/^\/api\/import\/[^/]+$/.test(pathname) && method === 'GET') {
    const id = pathname.split('/')[3];
    const batch = d.imports.find(x => x.id === id);
    if (!batch) { send(res, 404, { error: 'Batch tidak ditemukan.' }); return true; }
    send(res, 200, { batch });
    return true;
  }
  if (/^\/api\/import\/[^/]+\/row$/.test(pathname) && method === 'POST') {
    const id = pathname.split('/')[3];
    const b = await readBody(req);
    const batch = d.imports.find(x => x.id === id);
    if (!batch || !books || !books.resolve(user, batch.companyId).ok) { send(res, 404, { error: 'Batch tidak ditemukan.' }); return true; }
    const row = batch.rows.find(r => r.id === b.rowId);
    if (!row) { send(res, 404, { error: 'Baris tidak ditemukan.' }); return true; }
    const byCode = {}; acc.accountsOf(batch.companyId).forEach(a => byCode[a.code] = a);
    if (b.suggestedCode !== undefined) { row.suggestedCode = b.suggestedCode; row.jenis = clf.jenisDari(byCode[b.suggestedCode]); row.splits = null; }
    if (b.arah !== undefined) row.arah = b.arah;
    if (b.skip !== undefined) row.skip = !!b.skip;
    if (b.keterangan !== undefined) row.keterangan = b.keterangan;
    if (b.splits !== undefined) {
      // splits = [{accountCode, amount}] pada sisi lawan; harus berjumlah = nominal
      if (Array.isArray(b.splits) && b.splits.length) {
        const clean = b.splits.map(s => ({ accountCode: s.accountCode, amount: Number(s.amount) || 0 })).filter(s => s.accountCode && s.amount > 0);
        const sum = clean.reduce((a, s) => a + s.amount, 0);
        if (Math.abs(sum - row.nominal) > 0.5) { send(res, 400, { error: `Total pecahan (${sum}) harus sama dengan nominal transaksi (${row.nominal}).` }); return true; }
        row.splits = clean; row.jenis = 'Pecahan (' + clean.length + ' akun)';
      } else row.splits = null;
    }
    store.saveNow();
    send(res, 200, { row });
    return true;
  }
  if (/^\/api\/import\/[^/]+\/post$/.test(pathname) && method === 'POST') {
    const id = pathname.split('/')[3];
    const batch = d.imports.find(x => x.id === id);
    if (!batch || !books || !books.resolve(user, batch.companyId).ok) { send(res, 404, { error: 'Batch tidak ditemukan.' }); return true; }
    const scope = batch.companyId;
    const bankCode = batch.bankAccountCode;
    const valid = new Set(acc.accountsOf(scope).map(a => a.code));
    const impStatus = books.isFirmSide(user) ? 'disetujui' : 'draf';   // impor oleh staf klien → draf
    let dibuat = 0, terkunci = 0;
    for (const row of batch.rows) {
      if (row.skip || row.posted || row.matchedJournalId) continue;
      if (!valid.has(bankCode)) continue;
      if (books.isLocked(scope, row.tanggal)) { terkunci++; continue; }   // lewati baris di periode terkunci
      // sisi lawan: pakai pecahan bila ada, selain itu satu akun
      const counter = (row.splits && row.splits.length)
        ? row.splits.map(s => ({ accountCode: s.accountCode, amount: Number(s.amount) || 0 }))
        : [{ accountCode: row.suggestedCode, amount: row.nominal }];
      if (counter.some(c => !valid.has(c.accountCode))) continue;
      const sum = counter.reduce((a, c) => a + c.amount, 0);
      if (Math.abs(sum - row.nominal) > 0.5) continue;
      const lines = row.arah === 'masuk'
        ? [{ accountCode: bankCode, debit: row.nominal, credit: 0 }, ...counter.map(c => ({ accountCode: c.accountCode, debit: 0, credit: c.amount }))]
        : [...counter.map(c => ({ accountCode: c.accountCode, debit: c.amount, credit: 0 })), { accountCode: bankCode, debit: 0, credit: row.nominal }];
      const num = 'JU-' + String(store.nextNumber(scope, 'journal')).padStart(5, '0');
      const j = { id: store.id(), companyId: scope, date: row.tanggal, number: num,
        description: row.keterangan, createdAt: new Date().toISOString(), lines, dariImpor: batch.id,
        status: impStatus, createdBy: user.id, createdByName: user.name };
      if (impStatus === 'draf') j.submittedAt = new Date().toISOString();
      d.journals.push(j);
      row.posted = true; row.journalId = j.id;
      counter.forEach(c => clf.train(scope, row.keterangan, c.accountCode)); // belajar dari konfirmasi
      dibuat++;
    }
    store.saveNow();
    send(res, 200, { dibuat, terkunci, status: impStatus });
    return true;
  }
  if (/^\/api\/import\/[^/]+$/.test(pathname) && method === 'DELETE') {
    const id = pathname.split('/')[3];
    const batch = d.imports.find(x => x.id === id);
    if (batch && books && books.resolve(user, batch.companyId).ok) d.imports = d.imports.filter(x => x.id !== id);
    store.saveNow();
    send(res, 200, { ok: true });
    return true;
  }

  /* ---------- Aturan tetap (keterangan -> akun) ---------- */
  if (pathname === '/api/rules' && method === 'GET') {
    const cid = bookScope(user, query, null);
    send(res, 200, { rules: (d.rules || []).filter(r => r.companyId === cid) });
    return true;
  }
  if (pathname === '/api/rules' && method === 'POST') {
    const b = await readBody(req);
    if (!b.contains || !b.counterCode) { send(res, 400, { error: 'Kata kunci dan akun wajib diisi.' }); return true; }
    const scope = bookScope(user, query, b);
    const rule = { id: store.id(), companyId: scope, contains: String(b.contains).trim(),
      arah: (b.arah === 'masuk' || b.arah === 'keluar') ? b.arah : '', counterCode: b.counterCode, createdAt: new Date().toISOString() };
    d.rules.push(rule); store.saveNow();
    send(res, 200, { rule });
    return true;
  }
  if (/^\/api\/rules\/[^/]+$/.test(pathname) && method === 'DELETE') {
    const id = pathname.split('/')[3];
    const rule = d.rules.find(r => r.id === id);
    if (rule && books && books.resolve(user, rule.companyId).ok) d.rules = d.rules.filter(r => r.id !== id);
    store.saveNow();
    send(res, 200, { ok: true });
    return true;
  }

  /* ---------- Terapkan massal ke baris yang cocok ---------- */
  if (/^\/api\/import\/[^/]+\/bulk$/.test(pathname) && method === 'POST') {
    const id = pathname.split('/')[3];
    const b = await readBody(req);
    const batch = d.imports.find(x => x.id === id);
    if (!batch || !books || !books.resolve(user, batch.companyId).ok) { send(res, 404, { error: 'Batch tidak ditemukan.' }); return true; }
    const scope = batch.companyId;
    const filter = String(b.filter || '').toLowerCase();
    const counterCode = b.counterCode;
    const valid = new Set(acc.accountsOf(scope).map(a => a.code));
    if (!counterCode || !valid.has(counterCode)) { send(res, 400, { error: 'Pilih akun yang valid.' }); return true; }
    const byCode = {}; acc.accountsOf(scope).forEach(a => byCode[a.code] = a);
    const jenis = clf.jenisDari(byCode[counterCode]);
    let terpengaruh = 0;
    for (const row of batch.rows) {
      if (row.posted) continue;
      if (filter && !(row.keterangan || '').toLowerCase().includes(filter)) continue;
      if (b.arah && row.arah !== b.arah) continue;
      row.suggestedCode = counterCode; row.jenis = jenis; row.splits = null; row.source = 'aturan-tetap'; row.confidence = 0.99;
      terpengaruh++;
    }
    // opsional: simpan sebagai aturan tetap
    if (b.alsoRule && filter) {
      const exists = d.rules.some(r => r.companyId === scope && r.contains.toLowerCase() === filter && r.counterCode === counterCode);
      if (!exists) d.rules.push({ id: store.id(), companyId: scope, contains: filter, arah: b.arah || '', counterCode, createdAt: new Date().toISOString() });
    }
    store.saveNow();
    send(res, 200, { terpengaruh, batch });
    return true;
  }

  /* ---------- Edit jurnal (dengan penanda pernah diedit) ---------- */
  if (/^\/api\/journals\/[^/]+$/.test(pathname) && method === 'PUT') {
    const id = pathname.split('/')[3];
    const b = await readBody(req);
    const j = d.journals.find(x => x.id === id && x.companyId === user.companyId);
    if (!j) { send(res, 404, { error: 'Jurnal tidak ditemukan.' }); return true; }
    const lines = (b.lines || []).map(l => ({ accountCode: l.accountCode, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, memo: l.memo || '' }))
      .filter(l => l.accountCode && (l.debit > 0 || l.credit > 0));
    if (!b.date) { send(res, 400, { error: 'Tanggal wajib diisi.' }); return true; }
    if (lines.length < 2) { send(res, 400, { error: 'Jurnal minimal memiliki 2 baris.' }); return true; }
    const totD = lines.reduce((s, l) => s + l.debit, 0), totK = lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totD - totK) > 0.005) { send(res, 400, { error: `Jurnal tidak seimbang. Debit ${totD} ≠ Kredit ${totK}.` }); return true; }
    const valid = new Set(acc.accountsOf(user.companyId).map(a => a.code));
    for (const l of lines) if (!valid.has(l.accountCode)) { send(res, 400, { error: `Kode akun ${l.accountCode} tidak dikenal.` }); return true; }
    j.date = b.date; j.description = (b.description || '').trim(); j.lines = lines;
    j.editCount = (j.editCount || 0) + 1; j.editedAt = new Date().toISOString();
    store.saveNow();
    send(res, 200, { journal: j });
    return true;
  }

  /* ---------- Insight AI ---------- */
  if (pathname === '/api/ai/insight' && method === 'POST') {
    const b = await readBody(req);
    const s = aiSettings();
    const cid = bookScope(user, query, b);
    const ringkasan = buildSummary(cid, b.from, b.to);
    try {
      const text = await ai.generateInsight({ key: s.aiKey, model: s.aiModel, ringkasan });
      send(res, 200, { text, ringkasan });
    } catch (e) { send(res, 400, { error: e.message }); }
    return true;
  }

  return false;
}

/* Ringkasan angka untuk insight */
function buildSummary(companyId, from, to) {
  const cur = acc.incomeStatement(companyId, from, to);
  const bs = acc.balanceSheet(companyId, to);
  const cf = acc.cashFlow(companyId, from, to);
  // periode pembanding (bulan sebelumnya) bila from/to satu bulan
  let prev = null;
  if (from && to && from.slice(0, 7) === to.slice(0, 7)) {
    const [y, m] = from.slice(0, 7).split('-').map(Number);
    const pd = new Date(y, m - 2, 1); const pym = pd.toISOString().slice(0, 7);
    const last = new Date(pd.getFullYear(), pd.getMonth() + 1, 0).getDate();
    prev = acc.incomeStatement(companyId, `${pym}-01`, `${pym}-${String(last).padStart(2, '0')}`);
  }
  const topBeban = [];
  for (const sc of ['Beban Pokok Penjualan', 'Beban Operasional', 'Beban Lain-lain']) {
    (cur.groups[sc] || []).forEach(it => topBeban.push({ akun: it.name, jumlah: it.amount }));
  }
  topBeban.sort((a, b) => b.jumlah - a.jumlah);
  return {
    periode: { from, to },
    labaRugi: {
      pendapatanUsaha: cur.pendapatanUsaha, bpp: cur.bpp, labaBruto: cur.labaBruto,
      bebanOperasional: cur.bebanOperasional, labaUsaha: cur.labaUsaha, labaBersih: cur.labaBersih,
      marginBruto: cur.pendapatanUsaha ? +(cur.labaBruto / cur.pendapatanUsaha * 100).toFixed(1) : 0,
      marginBersih: cur.pendapatanUsaha ? +(cur.labaBersih / cur.pendapatanUsaha * 100).toFixed(1) : 0
    },
    labaBersihBulanLalu: prev ? prev.labaBersih : null,
    pendapatanBulanLalu: prev ? prev.pendapatanUsaha : null,
    bebanTerbesar: topBeban.slice(0, 5),
    neraca: { totalAset: bs.totalAset, totalLiabilitas: bs.totalLiabilitas, totalEkuitas: bs.totalEkuitas },
    arusKas: { operasi: cf.totOperasi, investasi: cf.totInvestasi, pendanaan: cf.totPendanaan, kasAkhir: cf.kasAkhir, kenaikanBersih: cf.kenaikanBersih }
  };
}

module.exports = { handle, buildSummary };
