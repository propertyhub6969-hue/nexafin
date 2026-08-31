'use strict';
/*
 * Rute API buku akuntansi per-klien (multi-book). Semua operasi akuntansi
 * (bagan akun, jurnal, laporan, anggaran, rekonsiliasi) dapat dijalankan pada
 * buku klien mana pun yang boleh dilihat user, lewat prefix /api/books/:bookId/...
 *
 * Dipisah dari server.js (yang terkunci untuk ditulis) dan didelegasikan dari
 * routes-ai.js. Menggunakan kembali mesin laporan lib/accounting.js apa adanya.
 *
 * handle(req,res,ctx) -> true bila menangani rute. ctx = {pathname,method,query,user,send,readBody}
 */
const store = require('./db');
const acc = require('./accounting');
const books = require('./books');
const C = require('./consult');   // saveFile/deleteFile untuk lampiran jurnal (arsip dokumen)
const assets = require('./assets'); // aset tetap & penyusutan
const calk = require('./calk');     // Catatan atas Laporan Keuangan

const PREFIX = /^\/api\/books(\/|$)/;
function owns(pathname) { return PREFIX.test(pathname); }
function seg(pathname, i) { return decodeURIComponent((pathname.split('/')[i] || '')); }

const MAX_FILE_BYTES = 8 * 1024 * 1024;   // 8 MB per file (setelah kompresi di sisi klien)
function base64Bytes(b64) { const s = String(b64 || ''); const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0; return Math.floor(s.length * 3 / 4) - pad; }

// Buat dokumen lampiran (sumber:'jurnal') dari file unggahan; kembalikan {ids, error}
function addUploadedAttachments(firmaCompanyId, clientId, uploaderId, files) {
  const d = store.db(); const ids = [];
  for (const f of (files || [])) {
    if (!f || !f.base64 || !f.filename) continue;
    if (base64Bytes(f.base64) > MAX_FILE_BYTES) return { ids, error: `File "${f.filename}" melebihi batas ${(MAX_FILE_BYTES / 1048576)} MB.` };
    const docId = store.id();
    let file = null;
    try { const r = C.saveFile(firmaCompanyId, docId, f.filename, f.base64); file = { name: f.filename, mime: f.mime || 'application/octet-stream', size: r.size, stored: r.stored }; }
    catch (e) { return { ids, error: 'Gagal menyimpan lampiran: ' + e.message }; }
    d.documents.push({ id: docId, companyId: firmaCompanyId, clientId, kategori: 'Lampiran Jurnal', nama: f.filename,
      periode: '', status: 'ada', catatan: '', link: '', file, sumber: 'jurnal', uploadedBy: uploaderId, createdAt: new Date().toISOString() });
    ids.push(docId);
  }
  return { ids };
}
// Saat jurnal dihapus: lepas rujukan; hapus fisik file bila 0 rujukan lain & sumber 'jurnal'.
function cleanupAttachments(firmaCompanyId, journal) {
  const d = store.db(); const deletedNames = [];
  for (const docId of (journal.attachments || [])) {
    const doc = d.documents.find(x => x.id === docId);
    if (!doc) continue;
    const others = d.journals.filter(j => j.id !== journal.id && (j.attachments || []).includes(docId)).length;
    if (others === 0 && doc.sumber === 'jurnal') {
      if (doc.file) C.deleteFile(firmaCompanyId, doc.file.stored);
      d.documents = d.documents.filter(x => x.id !== docId);
      deletedNames.push(doc.nama || (doc.file && doc.file.name) || 'lampiran');
    }
    // sumber 'arsip' atau masih dirujuk jurnal lain: biarkan file-nya, rujukan lepas otomatis.
  }
  return deletedNames;
}
// Ringkas jurnal untuk daftar/kotak masuk (tanpa membocorkan field internal berlebih)
function jsonJournal(j, d) {
  return Object.assign({}, j, {
    attachmentCount: (j.attachments || []).length,
    commentCount: (j.comments || []).length
  });
}

async function handle(req, res, ctx) {
  const { pathname, method, query, user, send, readBody } = ctx;
  if (!user) { send(res, 401, { error: 'Silakan login.' }); return true; }
  const d = store.db();

  // ---- Daftar buku yang bisa dibuka user ----
  if (pathname === '/api/books' && method === 'GET') {
    const list = books.listBooks(user).map(b => Object.assign({}, b, { canWrite: books.canWriteBook(user, b.id) }));
    send(res, 200, { books: list, firmaId: user.companyId });
    return true;
  }

  // ---- Pindahkan buku firma (data lama) ke sebuah klien ----
  if (pathname === '/api/books/migrate' && method === 'POST') {
    const b = await readBody(req);
    const r = books.migrateFirmaToClient(user, b.targetClientId);
    if (!r.ok) { send(res, r.status || 400, { error: r.error }); return true; }
    send(res, 200, { ok: true, client: { id: r.client.id, nama: r.client.nama }, moved: r.moved });
    return true;
  }

  // ---- Kotak masuk konsultan: jurnal draf menunggu, dikelompokkan per klien ----
  if (pathname === '/api/books/inbox' && method === 'GET') {
    if (!books.isFirmSide(user)) { send(res, 403, { error: 'Khusus konsultan/staf firma.' }); return true; }
    const v = books.visibleClientIds(user);                    // null = semua klien
    const clientById = {}; d.clients.forEach(c => { if (c.companyId === user.companyId) clientById[c.id] = c; });
    // buku yang boleh dilihat = tiap klien terlihat (+ buku firma bila admin)
    const allowBook = (bid) => {
      if (bid === user.companyId) return books.roleFlags(user).isAdmin;
      const cl = clientById[bid]; if (!cl) return false;
      return v === null || v.has(bid);
    };
    const drafts = d.journals.filter(j => j.status === 'draf' && allowBook(j.companyId));
    const grup = {};
    for (const j of drafts) {
      const key = j.companyId;
      if (!grup[key]) grup[key] = { bookId: key, klien: key === user.companyId ? 'Buku Firma' : (clientById[key] ? clientById[key].nama : 'Klien'), jurnal: [] };
      grup[key].jurnal.push(jsonJournal(j, d));
    }
    const groups = Object.values(grup).map(g => { g.jurnal.sort((a, b) => (a.date || '').localeCompare(b.date || '')); return g; })
      .sort((a, b) => a.klien.localeCompare(b.klien));
    send(res, 200, { groups, total: drafts.length });
    return true;
  }

  // ---- Selebihnya: /api/books/:bookId/... ----
  const parts = pathname.split('/');            // ['','api','books',':bookId', ...]
  if (parts.length < 5) return false;
  const bookId = decodeURIComponent(parts[3]);
  const rest = '/' + parts.slice(4).join('/');  // sisa path setelah bookId

  const R = books.resolve(user, bookId);
  if (!R.ok) { send(res, R.status || 403, { error: R.error }); return true; }
  const cid = R.scopeId;

  // Guard tulis: melihat buku boleh bagi semua yang didelegasikan, tetapi mengubahnya
  // (POST/PUT/DELETE apa pun di bawah buku ini) hanya untuk yang berhak tulis.
  const canWriteThisBook = books.canWriteBook(user, cid);
  if (method !== 'GET' && !canWriteThisBook) {
    send(res, 403, { error: 'Mode baca-saja: hanya staf pembukuan atau pengawas penanggung jawab yang dapat mengubah buku klien ini.' });
    return true;
  }

  /* ---------------- Bagan Akun ---------------- */
  if (rest === '/accounts' && method === 'GET') {
    send(res, 200, { accounts: acc.accountsOf(cid).sort((a, b) => a.code.localeCompare(b.code)), book: R.book });
    return true;
  }
  if (rest === '/accounts' && method === 'POST') {
    const b = await readBody(req);
    if (!b.code || !b.name || !b.category) { send(res, 400, { error: 'Kode, nama, dan kategori wajib diisi.' }); return true; }
    if (d.accounts.find(a => a.companyId === cid && a.code === b.code)) { send(res, 400, { error: 'Kode akun sudah ada.' }); return true; }
    const a = { id: store.id(), companyId: cid, code: String(b.code).trim(), name: String(b.name).trim(),
      category: b.category, subcategory: b.subcategory || '', normal: b.normal || 'D',
      cashFlow: b.cashFlow || 'operasi', isCash: !!b.isCash, isDepr: !!b.isDepr };
    d.accounts.push(a); store.saveNow();
    send(res, 200, { account: a });
    return true;
  }
  if (/^\/accounts\/[^/]+$/.test(rest) && (method === 'PUT' || method === 'DELETE')) {
    const id = seg(rest, 2);
    const a = d.accounts.find(x => x.id === id && x.companyId === cid);
    if (!a) { send(res, 404, { error: 'Akun tidak ditemukan.' }); return true; }
    if (method === 'DELETE') {
      const used = d.journals.some(j => j.companyId === cid && (j.lines || []).some(l => l.accountCode === a.code));
      if (used) { send(res, 400, { error: 'Akun sudah dipakai di jurnal, tidak bisa dihapus.' }); return true; }
      d.accounts = d.accounts.filter(x => x.id !== id); store.saveNow();
      send(res, 200, { ok: true });
      return true;
    }
    const b = await readBody(req);
    ['name', 'category', 'subcategory', 'normal', 'cashFlow'].forEach(k => { if (b[k] !== undefined) a[k] = b[k]; });
    if (b.isCash !== undefined) a.isCash = !!b.isCash;
    if (b.isDepr !== undefined) a.isDepr = !!b.isDepr;
    store.saveNow();
    send(res, 200, { account: a });
    return true;
  }

  /* ---------------- Jurnal ---------------- */
  const rf = books.roleFlags(user);
  const firmSide = books.isFirmSide(user);          // admin/pengawas/staff (bukan klien-staff)
  const canManagePeriod = rf.isAdmin || rf.isPengawas;
  const parseLines = (b) => (b.lines || []).map(l => ({ accountCode: l.accountCode, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, memo: l.memo || '' }))
    .filter(l => l.accountCode && (l.debit > 0 || l.credit > 0));
  const validateLines = (lines) => {
    if (lines.length < 2) return 'Jurnal minimal memiliki 2 baris.';
    const totD = lines.reduce((s, l) => s + l.debit, 0), totK = lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totD - totK) > 0.005) return `Jurnal tidak seimbang. Debit ${totD} ≠ Kredit ${totK}.`;
    const valid = new Set(acc.accountsOf(cid).map(a => a.code));
    for (const l of lines) if (!valid.has(l.accountCode)) return `Kode akun ${l.accountCode} tidak dikenal.`;
    return null;
  };

  if (rest === '/journals' && method === 'GET') {
    let js = acc.journalsOf(cid);
    if (query.from) js = js.filter(j => j.date >= query.from);
    if (query.to) js = js.filter(j => j.date <= query.to);
    if (query.status) js = js.filter(j => (j.status || 'disetujui') === query.status);
    js = js.map(j => jsonJournal(j, d)).sort((a, b) => (b.date + b.number).localeCompare(a.date + a.number));
    send(res, 200, { journals: js, locks: books.locksFor(cid).filter(l => l.locked).map(l => l.periode) });
    return true;
  }
  if (rest === '/journals' && method === 'POST') {
    const b = await readBody(req);
    const lines = parseLines(b);
    if (!b.date) { send(res, 400, { error: 'Tanggal wajib diisi.' }); return true; }
    const err = validateLines(lines); if (err) { send(res, 400, { error: err }); return true; }
    if (books.isLocked(cid, b.date)) { send(res, 423, { error: `Periode ${books.periodeOf(b.date)} sudah dikunci. Buat jurnal koreksi di periode berjalan.` }); return true; }
    const num = 'JU-' + String(store.nextNumber(cid, 'journal')).padStart(5, '0');
    const status = firmSide ? 'disetujui' : 'draf';       // klien-staff → draf; sisi firma → langsung disetujui
    const j = { id: store.id(), companyId: cid, date: b.date, number: num, description: (b.description || '').trim(),
      createdAt: new Date().toISOString(), createdBy: user.id, createdByName: user.name,
      status, lines, comments: [], attachments: [] };
    if (status === 'draf') j.submittedAt = new Date().toISOString();
    else { j.approvedBy = user.id; j.approvedAt = new Date().toISOString(); }
    // lampiran (hanya buku klien): file unggahan + tautan dokumen arsip yang sudah ada
    if (!R.isFirma) {
      if (Array.isArray(b.files) && b.files.length) {
        const r = addUploadedAttachments(user.companyId, cid, user.id, b.files);
        if (r.error) { send(res, 400, { error: r.error }); return true; }
        j.attachments.push(...r.ids);
      }
      if (Array.isArray(b.attachDocIds)) {
        for (const docId of b.attachDocIds) { const doc = d.documents.find(x => x.id === docId && x.clientId === cid); if (doc && !j.attachments.includes(docId)) j.attachments.push(docId); }
      }
    }
    d.journals.push(j); store.saveNow();
    send(res, 200, { journal: jsonJournal(j, d) });
    return true;
  }
  // Setujui jurnal draf (sisi firma)
  if (/^\/journals\/[^/]+\/approve$/.test(rest) && method === 'POST') {
    if (!firmSide) { send(res, 403, { error: 'Hanya konsultan/staf firma yang dapat menyetujui.' }); return true; }
    const j = d.journals.find(x => x.id === seg(rest, 2) && x.companyId === cid);
    if (!j) { send(res, 404, { error: 'Jurnal tidak ditemukan.' }); return true; }
    if (books.isLocked(cid, j.date)) { send(res, 423, { error: 'Periode jurnal ini terkunci; tidak dapat disetujui.' }); return true; }
    j.status = 'disetujui'; j.approvedBy = user.id; j.approvedByName = user.name; j.approvedAt = new Date().toISOString();
    store.saveNow();
    send(res, 200, { journal: jsonJournal(j, d) });
    return true;
  }
  // Tolak jurnal draf → tetap draf + komentar penolakan (sisi firma)
  if (/^\/journals\/[^/]+\/reject$/.test(rest) && method === 'POST') {
    if (!firmSide) { send(res, 403, { error: 'Hanya konsultan/staf firma yang dapat menolak.' }); return true; }
    const b = await readBody(req);
    if (!b.note || !String(b.note).trim()) { send(res, 400, { error: 'Beri catatan alasan penolakan.' }); return true; }
    const j = d.journals.find(x => x.id === seg(rest, 2) && x.companyId === cid);
    if (!j) { send(res, 404, { error: 'Jurnal tidak ditemukan.' }); return true; }
    j.status = 'draf';
    j.comments = j.comments || [];
    j.comments.push({ id: store.id(), userId: user.id, userName: user.name, kind: 'tolak', text: String(b.note).trim(), at: new Date().toISOString() });
    j.rejectedBy = user.id; j.rejectedAt = new Date().toISOString();
    store.saveNow();
    send(res, 200, { journal: jsonJournal(j, d) });
    return true;
  }
  // Komentar per jurnal (dua arah: konsultan ↔ staf klien)
  if (/^\/journals\/[^/]+\/comment$/.test(rest) && method === 'POST') {
    const b = await readBody(req);
    if (!b.text || !String(b.text).trim()) { send(res, 400, { error: 'Komentar kosong.' }); return true; }
    const j = d.journals.find(x => x.id === seg(rest, 2) && x.companyId === cid);
    if (!j) { send(res, 404, { error: 'Jurnal tidak ditemukan.' }); return true; }
    j.comments = j.comments || [];
    j.comments.push({ id: store.id(), userId: user.id, userName: user.name, kind: 'catatan', text: String(b.text).trim(), at: new Date().toISOString() });
    store.saveNow();
    send(res, 200, { journal: jsonJournal(j, d) });
    return true;
  }
  if (/^\/journals\/[^/]+$/.test(rest) && (method === 'PUT' || method === 'DELETE')) {
    const id = seg(rest, 2);
    const j = d.journals.find(x => x.id === id && x.companyId === cid);
    if (!j) { send(res, 404, { error: 'Jurnal tidak ditemukan.' }); return true; }
    // klien-staff hanya boleh menyentuh draf miliknya sendiri
    if (!firmSide && !(j.status === 'draf' && j.createdBy === user.id)) { send(res, 403, { error: 'Anda hanya dapat mengubah/menghapus draf jurnal Anda sendiri.' }); return true; }
    if (books.isLocked(cid, j.date)) {
      send(res, 423, { error: method === 'DELETE' ? 'Periode terkunci — buat jurnal koreksi, bukan hapus.' : 'Periode terkunci — jurnal ini tidak dapat diubah.' });
      return true;
    }
    if (method === 'DELETE') {
      const deletedFiles = cleanupAttachments(user.companyId, j);
      books.logJournalDeletion(user.companyId, cid, user, j, deletedFiles);
      d.journals = d.journals.filter(x => x.id !== id); store.saveNow();
      send(res, 200, { ok: true, deletedFiles });
      return true;
    }
    const b = await readBody(req);
    const lines = parseLines(b);
    const err = validateLines(lines); if (err) { send(res, 400, { error: err }); return true; }
    if (b.date && books.isLocked(cid, b.date)) { send(res, 423, { error: `Tidak dapat memindahkan jurnal ke periode terkunci ${books.periodeOf(b.date)}.` }); return true; }
    if (b.date) j.date = b.date;
    if (b.description !== undefined) j.description = String(b.description).trim();
    j.lines = lines;
    // lampiran (buku klien)
    if (!R.isFirma) {
      j.attachments = j.attachments || [];
      if (Array.isArray(b.files) && b.files.length) {
        const r = addUploadedAttachments(user.companyId, cid, user.id, b.files);
        if (r.error) { send(res, 400, { error: r.error }); return true; }
        j.attachments.push(...r.ids);
      }
      if (Array.isArray(b.attachDocIds)) for (const docId of b.attachDocIds) { const doc = d.documents.find(x => x.id === docId && x.clientId === cid); if (doc && !j.attachments.includes(docId)) j.attachments.push(docId); }
      if (Array.isArray(b.detachDocIds) && b.detachDocIds.length) {
        const drop = new Set(b.detachDocIds);
        const removed = j.attachments.filter(x => drop.has(x));
        j.attachments = j.attachments.filter(x => !drop.has(x));
        // bila lampiran dilepas & tak dirujuk jurnal lain & sumber 'jurnal' → hapus fisik
        for (const docId of removed) {
          const doc = d.documents.find(x => x.id === docId);
          if (!doc) continue;
          const others = d.journals.some(jj => jj.id !== j.id && (jj.attachments || []).includes(docId));
          if (!others && doc.sumber === 'jurnal') { if (doc.file) C.deleteFile(user.companyId, doc.file.stored); d.documents = d.documents.filter(x => x.id !== docId); }
        }
      }
    }
    j.editCount = (j.editCount || 0) + 1;
    j.editedAt = new Date().toISOString();
    // bila draf milik klien-staff diedit setelah ditolak, tetap draf (siap diajukan ulang)
    store.saveNow();
    send(res, 200, { journal: jsonJournal(j, d) });
    return true;
  }
  // Lampiran sebuah jurnal (detail utk pratinjau/daftar)
  if (/^\/journals\/[^/]+\/attachments$/.test(rest) && method === 'GET') {
    const j = d.journals.find(x => x.id === seg(rest, 2) && x.companyId === cid);
    if (!j) { send(res, 404, { error: 'Jurnal tidak ditemukan.' }); return true; }
    const atts = (j.attachments || []).map(docId => {
      const doc = d.documents.find(x => x.id === docId); if (!doc) return null;
      return { id: doc.id, nama: doc.nama, sumber: doc.sumber || 'arsip', punyaFile: !!doc.file, mime: doc.file ? doc.file.mime : '', link: doc.link || '' };
    }).filter(Boolean);
    send(res, 200, { attachments: atts });
    return true;
  }

  /* ---------------- Periode terkunci ---------------- */
  if (rest === '/locks' && method === 'GET') {
    send(res, 200, { locks: books.locksFor(cid) });
    return true;
  }
  if (rest === '/locks' && method === 'POST') {
    if (!canManagePeriod) { send(res, 403, { error: 'Hanya pengawas/konsultan yang dapat mengunci periode.' }); return true; }
    const b = await readBody(req);
    if (!/^\d{4}-\d{2}$/.test(b.periode || '')) { send(res, 400, { error: 'Periode harus format YYYY-MM.' }); return true; }
    const r = books.lockPeriode(user, user.companyId, cid, b.periode);
    if (!r.ok) { send(res, r.status || 400, { error: r.error }); return true; }
    send(res, 200, { lock: r.lock });
    return true;
  }
  if (rest === '/locks/unlock' && method === 'POST') {
    if (!canManagePeriod) { send(res, 403, { error: 'Hanya pengawas/konsultan yang dapat membuka kunci periode.' }); return true; }
    const b = await readBody(req);
    if (!/^\d{4}-\d{2}$/.test(b.periode || '')) { send(res, 400, { error: 'Periode harus format YYYY-MM.' }); return true; }
    if (!b.note || !String(b.note).trim()) { send(res, 400, { error: 'Wajib beri catatan alasan membuka kunci (angka yang sudah dilaporkan bisa berubah).' }); return true; }
    const r = books.unlockPeriode(user, cid, b.periode, b.note);
    if (!r.ok) { send(res, r.status || 400, { error: r.error }); return true; }
    send(res, 200, { lock: r.lock });
    return true;
  }

  /* ---------------- Log penghapusan jurnal (audit) ---------------- */
  if (rest === '/deletions' && method === 'GET') {
    if (!firmSide) { send(res, 403, { error: 'Khusus konsultan/staf firma.' }); return true; }
    send(res, 200, { deletions: books.deletionsFor(cid) });
    return true;
  }

  /* ---------------- CALK (Catatan atas Laporan Keuangan) ---------------- */
  if (rest === '/calk' && method === 'GET') {
    const tahun = query.tahun || String(new Date().getFullYear());
    const client = d.clients.find(c => c.id === cid);
    const jenisUsaha = client ? (client.jenisUsaha || '') : '';
    const stored = calk.getStored(cid);
    const narasi = (query.bawaan || !stored) ? calk.defaultCALK(jenisUsaha) : stored;
    send(res, 200, {
      calk: narasi, tersimpan: !!stored,
      nama: R.book.name, jenisUsaha,
      auto: calk.buildAuto(cid, tahun)
    });
    return true;
  }
  if (rest === '/calk' && method === 'POST') {
    if (!firmSide) { send(res, 403, { error: 'Hanya konsultan/staf firma yang dapat menyunting CALK.' }); return true; }
    const b = await readBody(req);
    const rec = calk.save(cid, b);
    send(res, 200, { ok: true, calk: rec });
    return true;
  }

  /* ---------------- Aset Tetap & Penyusutan ---------------- */
  if (rest === '/assets/meta' && method === 'GET') {
    const accs = acc.accountsOf(cid);
    const asetTetap = accs.filter(a => a.category === 'ASET' && a.subcategory === 'Aset Tetap' && a.normal === 'D');
    const akumulasi = accs.filter(a => a.category === 'ASET' && a.normal === 'K');
    const beban = accs.filter(a => a.category === 'BEBAN');
    send(res, 200, {
      fiskal: assets.FISKAL, metode: assets.METODE,
      akunAset: asetTetap.map(a => ({ code: a.code, name: a.name })),
      akunAkumulasi: akumulasi.map(a => ({ code: a.code, name: a.name })),
      akunBeban: beban.map(a => ({ code: a.code, name: a.name })),
      defaultBeban: (beban.find(a => a.isDepr) || {}).code || ''
    });
    return true;
  }
  if (rest === '/assets' && method === 'GET') {
    const sampai = query.sampai || new Date().toISOString().slice(0, 7);
    const list = assets.assetsOf(cid).map(a => Object.assign({}, a, assets.assetSummary(a, sampai)))
      .sort((x, y) => (x.tanggalPerolehan || '').localeCompare(y.tanggalPerolehan || ''));
    send(res, 200, { assets: list, sampai });
    return true;
  }
  if (rest === '/assets' && method === 'POST') {
    if (!firmSide) { send(res, 403, { error: 'Hanya konsultan/staf firma yang dapat menambah aset.' }); return true; }
    const b = await readBody(req);
    if (!b.nama || !b.tanggalPerolehan || !(Number(b.harga) > 0)) { send(res, 400, { error: 'Nama, tanggal perolehan, dan harga wajib diisi.' }); return true; }
    const a = {
      id: store.id(), companyId: cid, nama: String(b.nama).trim(),
      tanggalPerolehan: b.tanggalPerolehan, harga: Number(b.harga) || 0, nilaiResidu: Number(b.nilaiResidu) || 0,
      metode: assets.METODE[b.metode] ? b.metode : 'garis-lurus', masaManfaat: Number(b.masaManfaat) || 0,
      kelompokFiskal: assets.FISKAL[b.kelompokFiskal] ? b.kelompokFiskal : 'non-penyusutan',
      metodeFiskal: b.metodeFiskal === 'saldo-menurun' ? 'saldo-menurun' : 'garis-lurus',
      akunAset: b.akunAset || '', akunAkumulasi: b.akunAkumulasi || '', akunBeban: b.akunBeban || '',
      catatan: b.catatan || '', aktif: true, penyusutanPosted: [], createdAt: new Date().toISOString()
    };
    (store.db().assets = store.db().assets || []).push(a);
    store.saveNow();
    send(res, 200, { asset: a });
    return true;
  }
  if (/^\/assets\/[^/]+$/.test(rest) && (method === 'PUT' || method === 'DELETE')) {
    if (!firmSide) { send(res, 403, { error: 'Khusus konsultan/staf firma.' }); return true; }
    const id = seg(rest, 2);
    const a = (store.db().assets || []).find(x => x.id === id && x.companyId === cid);
    if (!a) { send(res, 404, { error: 'Aset tidak ditemukan.' }); return true; }
    if (method === 'DELETE') {
      store.db().assets = store.db().assets.filter(x => x.id !== id); store.saveNow();
      send(res, 200, { ok: true, catatan: (a.penyusutanPosted || []).length ? 'Jurnal penyusutan yang sudah diposting tetap tersimpan sebagai riwayat.' : '' });
      return true;
    }
    const b = await readBody(req);
    ['nama', 'tanggalPerolehan', 'catatan', 'akunAset', 'akunAkumulasi', 'akunBeban'].forEach(k => { if (b[k] !== undefined) a[k] = b[k]; });
    ['harga', 'nilaiResidu', 'masaManfaat'].forEach(k => { if (b[k] !== undefined) a[k] = Number(b[k]) || 0; });
    if (b.metode !== undefined && assets.METODE[b.metode]) a.metode = b.metode;
    if (b.kelompokFiskal !== undefined && assets.FISKAL[b.kelompokFiskal]) a.kelompokFiskal = b.kelompokFiskal;
    if (b.metodeFiskal !== undefined) a.metodeFiskal = b.metodeFiskal === 'saldo-menurun' ? 'saldo-menurun' : 'garis-lurus';
    if (b.aktif !== undefined) a.aktif = !!b.aktif;
    store.saveNow();
    send(res, 200, { asset: a });
    return true;
  }
  // Jadwal penyusutan satu aset (komersial bulanan + fiskal tahunan)
  if (/^\/assets\/[^/]+\/schedule$/.test(rest) && method === 'GET') {
    const a = (store.db().assets || []).find(x => x.id === seg(rest, 2) && x.companyId === cid);
    if (!a) { send(res, 404, { error: 'Aset tidak ditemukan.' }); return true; }
    const kom = assets.komSchedule(a); const fis = assets.fiskalSchedule(a);
    // agregasi per tahun untuk tampilan ringkas
    const perYear = {};
    kom.forEach(r => { const y = r.periode.slice(0, 4); (perYear[y] = perYear[y] || { tahun: y, komersial: 0, fiskal: 0 }).komersial += r.amount; });
    fis.forEach(r => { const y = r.periode.slice(0, 4); (perYear[y] = perYear[y] || { tahun: y, komersial: 0, fiskal: 0 }).fiskal += r.amount; });
    const tahunan = Object.values(perYear).map(x => ({ tahun: x.tahun, komersial: Math.round(x.komersial), fiskal: Math.round(x.fiskal), koreksi: Math.round(x.komersial - x.fiskal) })).sort((p, q) => p.tahun.localeCompare(q.tahun));
    send(res, 200, { asset: a, tahunan, postedMonths: (a.penyusutanPosted || []).length, totalBulan: kom.length });
    return true;
  }
  // Koreksi fiskal (komersial vs fiskal) untuk satu tahun, seluruh aset buku
  if (rest === '/assets/koreksi-fiskal' && method === 'GET') {
    const tahun = query.tahun || String(new Date().getFullYear());
    const rows = assets.assetsOf(cid).map(a => {
      const k = assets.koreksiTahun(a, tahun);
      return { id: a.id, nama: a.nama, kelompokFiskal: a.kelompokFiskal, komersial: k.komersial, fiskal: k.fiskal, koreksi: k.koreksi };
    }).filter(r => r.komersial || r.fiskal);
    const tot = rows.reduce((s, r) => ({ komersial: s.komersial + r.komersial, fiskal: s.fiskal + r.fiskal, koreksi: s.koreksi + r.koreksi }), { komersial: 0, fiskal: 0, koreksi: 0 });
    send(res, 200, { tahun, rows, total: tot });
    return true;
  }
  // Jalankan penyusutan komersial s/d bulan tertentu → posting jurnal otomatis (idempoten)
  if (rest === '/assets/depreciate' && method === 'POST') {
    if (!firmSide) { send(res, 403, { error: 'Hanya konsultan/staf firma yang dapat menjalankan penyusutan.' }); return true; }
    const b = await readBody(req);
    const sampai = /^\d{4}-\d{2}$/.test(b.sampai || '') ? b.sampai : new Date().toISOString().slice(0, 7);
    let dibuat = 0, terkunci = 0, dilewati = 0;
    const detail = [];
    for (const a of assets.assetsOf(cid)) {
      if (a.aktif === false) continue;
      if (!a.akunBeban || !a.akunAkumulasi) { dilewati++; continue; }
      const due = assets.dueMonths(a, sampai);
      for (const m of due) {
        if (books.isLocked(cid, m.periode + '-01')) { terkunci++; continue; }
        const num = 'JU-' + String(store.nextNumber(cid, 'journal')).padStart(5, '0');
        const j = {
          id: store.id(), companyId: cid, date: m.periode + '-' + String(new Date(Number(m.periode.slice(0, 4)), Number(m.periode.slice(5, 7)), 0).getDate()).padStart(2, '0'),
          number: num, description: `Penyusutan ${a.nama} — ${m.periode}`, createdAt: new Date().toISOString(),
          status: 'disetujui', createdBy: user.id, createdByName: user.name, dariPenyusutan: a.id,
          lines: [{ accountCode: a.akunBeban, debit: m.amount, credit: 0 }, { accountCode: a.akunAkumulasi, debit: 0, credit: m.amount }]
        };
        store.db().journals.push(j);
        a.penyusutanPosted = a.penyusutanPosted || []; a.penyusutanPosted.push(m.periode);
        dibuat++;
      }
    }
    store.saveNow();
    send(res, 200, { dibuat, terkunci, dilewati });
    return true;
  }

  /* ---------------- Laporan ---------------- */
  if (rest === '/reports/trial-balance' && method === 'GET') {
    send(res, 200, acc.trialBalance(cid, query.from, query.to)); return true;
  }
  if (rest === '/reports/ledger' && method === 'GET') {
    send(res, 200, acc.ledger(cid, query.code, query.from, query.to)); return true;
  }
  if (rest === '/reports/income-statement' && method === 'GET') {
    const cur = acc.incomeStatement(cid, query.from, query.to);
    let cmp = null;
    if (query.cmpFrom || query.cmpTo) cmp = acc.incomeStatement(cid, query.cmpFrom, query.cmpTo);
    send(res, 200, { current: cur, compare: cmp }); return true;
  }
  if (rest === '/reports/balance-sheet' && method === 'GET') {
    const cur = acc.balanceSheet(cid, query.asOf);
    let cmp = null;
    if (query.cmpAsOf) cmp = acc.balanceSheet(cid, query.cmpAsOf);
    send(res, 200, { current: cur, compare: cmp }); return true;
  }
  if (rest === '/reports/cash-flow' && method === 'GET') {
    send(res, 200, acc.cashFlow(cid, query.from, query.to)); return true;
  }
  if (rest === '/reports/equity' && method === 'GET') {
    send(res, 200, acc.equityStatement(cid, query.from, query.to)); return true;
  }
  if (rest === '/reports/variance' && method === 'GET') {
    send(res, 200, acc.variance(cid, query.from, query.to, query.mode || 'anggaran', query.cmpFrom, query.cmpTo)); return true;
  }

  /* ---------------- Anggaran ---------------- */
  if (rest === '/budgets' && method === 'GET') {
    const year = query.year;
    const list = d.budgets.filter(b => b.companyId === cid && (!year || String(b.year) === String(year)));
    send(res, 200, { budgets: list }); return true;
  }
  if (rest === '/budgets' && method === 'POST') {
    const b = await readBody(req);
    const year = String(b.year), code = b.accountCode;
    if (!year || !code) { send(res, 400, { error: 'Tahun dan kode akun wajib diisi.' }); return true; }
    let rec = d.budgets.find(x => x.companyId === cid && String(x.year) === year && x.accountCode === code);
    if (!rec) { rec = { id: store.id(), companyId: cid, year, accountCode: code, amounts: new Array(12).fill(0) }; d.budgets.push(rec); }
    if (Array.isArray(b.amounts)) rec.amounts = b.amounts.map(n => Number(n) || 0);
    store.saveNow();
    send(res, 200, { budget: rec }); return true;
  }

  /* ---------------- Rekonsiliasi Bank ---------------- */
  if (rest === '/bank-recs' && method === 'GET') {
    send(res, 200, { recs: d.bankRecs.filter(r => r.companyId === cid).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }); return true;
  }
  if (rest === '/bank-recs' && method === 'POST') {
    const b = await readBody(req);
    const rec = { id: store.id(), companyId: cid, accountCode: b.accountCode, statementDate: b.statementDate,
      statementBalance: Number(b.statementBalance) || 0, items: b.items || [], note: b.note || '', createdAt: new Date().toISOString() };
    d.bankRecs.push(rec); store.saveNow();
    send(res, 200, { rec }); return true;
  }
  if (/^\/bank-recs\/[^/]+$/.test(rest) && method === 'DELETE') {
    const id = seg(rest, 2);
    d.bankRecs = d.bankRecs.filter(r => !(r.id === id && r.companyId === cid)); store.saveNow();
    send(res, 200, { ok: true }); return true;
  }

  /* ---------------- Seed COA default ---------------- */
  if (rest === '/seed' && method === 'POST') {
    const n = books.seedCOA(cid);
    send(res, 200, { ok: true, ditambah: n }); return true;
  }

  send(res, 404, { error: 'Endpoint buku tidak ditemukan.' });
  return true;
}

module.exports = { owns, handle };
