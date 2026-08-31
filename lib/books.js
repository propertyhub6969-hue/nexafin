'use strict';
/*
 * Buku akuntansi per-klien ("multi-book").
 * Setiap klien konsultan punya buku akuntansi sendiri (COA, jurnal, laporan,
 * anggaran, rekonsiliasi) yang benar-benar terpisah. Sebuah "buku" diidentifikasi
 * oleh sebuah scopeId:
 *   - scopeId = companyId firma  -> buku milik firma sendiri.
 *   - scopeId = clientId         -> buku milik klien tsb.
 * Karena seluruh mesin akuntansi (lib/accounting.js) memfilter koleksi berdasarkan
 * field `companyId`, kita cukup menyimpan baris buku klien dengan companyId = clientId.
 * Dengan begitu acc.trialBalance(clientId, ...) dst. langsung bekerja tanpa perubahan.
 *
 * Akses dibatasi mengikuti aturan visibilitas klien (peran/tim) yang sama dengan
 * modul konsultan: admin=semua, pengawas=timnya, staff=klien tugasnya.
 */
const store = require('./db');
const { DEFAULT_COA } = require('./coa');

function roleFlags(user) {
  const isAdmin = user.role === 'admin' || user.role === 'user';
  const isPengawas = user.role === 'pengawas';
  const isStaff = user.role === 'staff';
  const isKlienStaff = user.role === 'klien-staff';   // staf perusahaan klien: terikat 1 klien
  return { isAdmin, isPengawas, isStaff, isKlienStaff };
}
function teamIds(user) {
  const d = store.db();
  return d.users.filter(u => u.companyId === user.companyId && u.supervisorId === user.id).map(u => u.id);
}
function myScope(user) {
  const { isAdmin, isPengawas } = roleFlags(user);
  if (isAdmin) return null;                              // null = semua
  return isPengawas ? [user.id, ...teamIds(user)] : [user.id];
}
// Himpunan clientId yang boleh dilihat user (null = semua klien firma).
function visibleClientIds(user) {
  const { isAdmin, isKlienStaff } = roleFlags(user);
  if (isAdmin) return null;
  // klien-staff: hanya klien yang terikat padanya (himpunan berisi satu elemen)
  if (isKlienStaff) return new Set(user.clientId ? [user.clientId] : []);
  const d = store.db();
  const scope = new Set(myScope(user));
  const ids = new Set();
  d.clients.forEach(c => { if (c.companyId === user.companyId && scope.has(c.assignedTo)) ids.add(c.id); });
  d.tasks.forEach(t => { if (t.companyId === user.companyId && scope.has(t.assignedTo)) ids.add(t.clientId); });
  return ids;
}
// Peran sisi firma (boleh menyetujui, kelola periode, dsb.)
function isFirmSide(user) {
  const { isKlienStaff } = roleFlags(user);
  return !isKlienStaff;
}
function canSeeClient(user, clientId) {
  const v = visibleClientIds(user);
  return v === null || v.has(clientId);
}

// Daftar buku yang boleh dibuka user: buku firma (khusus admin) + buku tiap klien terlihat.
function listBooks(user) {
  const d = store.db();
  const { isAdmin } = roleFlags(user);
  const books = [];
  if (isAdmin) {
    const comp = d.companies.find(c => c.id === user.companyId);
    books.push({ id: user.companyId, name: (comp ? comp.name : 'Firma') + ' (buku firma)', type: 'firma', status: 'aktif' });
  }
  const v = visibleClientIds(user);
  d.clients
    .filter(c => c.companyId === user.companyId)
    .filter(c => v === null || v.has(c.id))
    .sort((a, b) => (a.nama || '').localeCompare(b.nama || ''))
    .forEach(c => books.push({ id: c.id, name: c.nama, type: 'klien', status: c.status || 'aktif', npwp: c.npwp || '' }));
  return books;
}

// Berapa akun yang sudah ada pada sebuah buku.
function accountCount(scopeId) {
  return store.db().accounts.filter(a => a.companyId === scopeId).length;
}
// Seed COA default untuk sebuah buku (hanya bila belum ada akun).
function seedCOA(scopeId) {
  const d = store.db();
  if (d.accounts.some(a => a.companyId === scopeId)) return 0;
  let n = 0;
  for (const a of DEFAULT_COA) { d.accounts.push(Object.assign({ id: store.id(), companyId: scopeId }, a)); n++; }
  if (n) store.saveNow();
  return n;
}

/*
 * Resolusi & otorisasi buku.
 * Mengembalikan { ok, scopeId, isFirma, book } atau { ok:false, status, error }.
 * Jika buku klien belum punya COA, otomatis diisi COA default (lazy seed) sehingga
 * entri jurnal & laporan langsung bisa dipakai.
 */
function resolve(user, bookId, opts) {
  opts = opts || {};
  const d = store.db();
  const { isAdmin } = roleFlags(user);
  const bid = bookId || user.companyId;
  // Buku firma
  if (bid === user.companyId) {
    if (!isAdmin) return { ok: false, status: 403, error: 'Buku firma hanya untuk konsultan/admin.' };
    const comp = d.companies.find(c => c.id === user.companyId);
    return { ok: true, scopeId: user.companyId, isFirma: true, book: { id: user.companyId, name: comp ? comp.name : 'Firma', type: 'firma' } };
  }
  // Buku klien
  const client = d.clients.find(c => c.id === bid && c.companyId === user.companyId);
  if (!client) return { ok: false, status: 404, error: 'Buku/klien tidak ditemukan.' };
  if (!canSeeClient(user, client.id)) return { ok: false, status: 403, error: 'Anda tidak berwenang membuka buku klien ini.' };
  if (opts.seed !== false) seedCOA(client.id);
  return { ok: true, scopeId: client.id, isFirma: false, book: { id: client.id, name: client.nama, type: 'klien' } };
}

/*
 * Pindahkan seluruh data akuntansi buku firma (companyId = firma) ke sebuah klien.
 * Dipakai sekali untuk mengubah data lama menjadi buku salah satu klien.
 */
function migrateFirmaToClient(user, targetClientId) {
  const { isAdmin } = roleFlags(user);
  if (!isAdmin) return { ok: false, status: 403, error: 'Khusus konsultan/admin.' };
  const d = store.db();
  const from = user.companyId;
  const client = d.clients.find(c => c.id === targetClientId && c.companyId === from);
  if (!client) return { ok: false, status: 404, error: 'Klien tujuan tidak ditemukan.' };
  if (d.accounts.some(a => a.companyId === targetClientId)) {
    return { ok: false, status: 400, error: `Buku klien "${client.nama}" sudah berisi data. Pemindahan dibatalkan agar tidak menimpa.` };
  }
  let cAcc = 0, cJur = 0, cBud = 0, cRek = 0;
  d.accounts.forEach(a => { if (a.companyId === from) { a.companyId = targetClientId; cAcc++; } });
  d.journals.forEach(j => { if (j.companyId === from) { j.companyId = targetClientId; cJur++; } });
  d.budgets.forEach(b => { if (b.companyId === from) { b.companyId = targetClientId; cBud++; } });
  d.bankRecs.forEach(r => { if (r.companyId === from) { r.companyId = targetClientId; cRek++; } });
  (d.imports || []).forEach(im => { if (im.companyId === from) im.companyId = targetClientId; });
  (d.rules || []).forEach(r => { if (r.companyId === from) r.companyId = targetClientId; });
  // pindahkan counter nomor jurnal
  d.counters = d.counters || {};
  if (d.counters[from]) {
    d.counters[targetClientId] = Object.assign({}, d.counters[targetClientId] || {}, d.counters[from]);
    delete d.counters[from];
  }
  // pindahkan model klasifikasi belajar-pola
  d.classifiers = d.classifiers || {};
  if (d.classifiers[from]) { d.classifiers[targetClientId] = d.classifiers[from]; delete d.classifiers[from]; }
  store.saveNow();
  return { ok: true, client, moved: { accounts: cAcc, journals: cJur, budgets: cBud, bankRecs: cRek } };
}

/* ---------------- Periode terkunci (per buku) ---------------- */
function periodeOf(dateStr) { return String(dateStr || '').slice(0, 7); } // 'YYYY-MM'
function lockRecord(bookId, periode) {
  return (store.db().periodLocks || []).find(l => l.bookId === bookId && l.periode === periode);
}
function isLocked(bookId, dateOrPeriode) {
  const per = /^\d{4}-\d{2}$/.test(dateOrPeriode || '') ? dateOrPeriode : periodeOf(dateOrPeriode);
  const r = lockRecord(bookId, per);
  return !!(r && r.locked);
}
function locksFor(bookId) {
  return (store.db().periodLocks || []).filter(l => l.bookId === bookId).sort((a, b) => (b.periode || '').localeCompare(a.periode || ''));
}
// Kunci sebuah periode. Hanya admin/pengawas dengan akses buku.
function lockPeriode(user, firmaCompanyId, bookId, periode) {
  const d = store.db();
  d.periodLocks = d.periodLocks || [];
  let r = lockRecord(bookId, periode);
  if (r && r.locked) return { ok: false, status: 400, error: 'Periode ini sudah terkunci.' };
  if (!r) { r = { id: store.id(), companyId: firmaCompanyId, bookId, periode }; d.periodLocks.push(r); }
  r.locked = true; r.lockedBy = user.id; r.lockedByName = user.name; r.lockedAt = new Date().toISOString();
  r.unlockedBy = null; r.unlockedByName = null; r.unlockedAt = null; r.unlockNote = '';
  store.saveNow();
  return { ok: true, lock: r };
}
// Buka kunci. Hanya admin/pengawas. Wajib catatan alasan.
function unlockPeriode(user, bookId, periode, note) {
  const d = store.db();
  const r = lockRecord(bookId, periode);
  if (!r || !r.locked) return { ok: false, status: 400, error: 'Periode ini tidak sedang terkunci.' };
  r.locked = false; r.unlockedBy = user.id; r.unlockedByName = user.name; r.unlockedAt = new Date().toISOString();
  r.unlockNote = String(note || '');
  store.saveNow();
  return { ok: true, lock: r };
}

/* ---------------- Log penghapusan jurnal (audit, Pasal 28 UU KUP) ---------------- */
function logJournalDeletion(firmaCompanyId, bookId, user, journal, deletedFiles) {
  const d = store.db();
  d.journalDeletions = d.journalDeletions || [];
  d.journalDeletions.push({
    id: store.id(), companyId: firmaCompanyId, bookId,
    deletedBy: user.id, deletedByName: user.name, at: new Date().toISOString(),
    journal: { number: journal.number, date: journal.date, description: journal.description, status: journal.status || 'disetujui',
      lines: (journal.lines || []).map(l => ({ accountCode: l.accountCode, debit: l.debit || 0, credit: l.credit || 0, memo: l.memo || '' })) },
    files: deletedFiles || []
  });
  // batasi 5000 terakhir per firma (retensi jangka panjang, tetap ringan)
  const mine = d.journalDeletions.filter(x => x.companyId === firmaCompanyId);
  if (mine.length > 5000) {
    const buang = new Set(mine.slice(0, mine.length - 5000).map(x => x.id));
    d.journalDeletions = d.journalDeletions.filter(x => !buang.has(x.id));
  }
}
function deletionsFor(bookId) {
  return (store.db().journalDeletions || []).filter(x => x.bookId === bookId).sort((a, b) => b.at.localeCompare(a.at));
}

module.exports = {
  roleFlags, isFirmSide, visibleClientIds, canSeeClient, listBooks,
  accountCount, seedCOA, resolve, migrateFirmaToClient,
  isLocked, locksFor, lockPeriode, unlockPeriode, periodeOf,
  logJournalDeletion, deletionsFor
};
