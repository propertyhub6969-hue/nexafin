'use strict';
/*
 * Rute API Modul Konsultan Pajak: klien, arsip dokumen (upload file + tautan),
 * pekerjaan/progres SPT, invoice klien, staff (akun login), dan dashboard.
 * Didelegasikan dari routes-ai.js agar tidak perlu mengubah server.js.
 *
 * handle(req, res, ctx) -> true bila menangani. ctx = { pathname, method, query, user, send, readBody }
 */
const store = require('./db');
const auth = require('./auth');
const C = require('./consult');

const PREFIX = /^\/api\/(clients|tasks|invoices|documents|staff|consult)(\/|$)/;
function owns(pathname) { return PREFIX.test(pathname); }

function seg(pathname, i) { return pathname.split('/')[i]; }

async function handle(req, res, ctx) {
  const { pathname, method, query, user, send, readBody } = ctx;
  if (!user) { send(res, 401, { error: 'Silakan login.' }); return true; }
  const d = store.db();
  const cid = user.companyId;
  const isAdmin = user.role === 'admin' || user.role === 'user';
  const isPengawas = user.role === 'pengawas';
  const isStaff = user.role === 'staff';
  const isKlienStaff = user.role === 'klien-staff';              // staf perusahaan klien (terikat 1 klien)
  const canManage = isAdmin;                                     // kelola staff, invoice, hapus klien
  const isOwner = user.role === 'admin';                         // pemilik platform (registrant pertama) — kelola kalender libur global
  const canInv = isAdmin || !!(user.perms && user.perms.invoice);
  const teamIds = () => d.users.filter(u => u.companyId === cid && u.supervisorId === user.id).map(u => u.id);
  // Penanggung Jawab (PJ) = ditunjuk sbg assignedTo minimal satu klien. PJ boleh buat/kelola akun anggota rosternya.
  const isPJ = d.clients.some(c => c.companyId === cid && c.assignedTo === user.id);
  const myRosterUserIds = () => { const set = new Set(); d.clients.forEach(c => { if (c.companyId === cid && c.assignedTo === user.id) { (c.pembukuanBy || []).forEach(x => set.add(x)); (c.perpajakanBy || []).forEach(x => set.add(x)); } }); return set; };
  const canManageAccount = (u) => { if (isAdmin) return true; if (!isPJ) return false; if (u.role === 'admin' || u.role === 'user') return false; return myRosterUserIds().has(u.id); };
  const myScope = () => isAdmin ? null : (isPengawas ? [user.id, ...teamIds()] : [user.id]);
  const canSeeTask = (t) => { if (isAdmin) return true; return myScope().includes(t.assignedTo); };
  const canEditTask = (t) => {
    if (isAdmin) return true;
    const cl = d.clients.find(c => c.id === t.clientId);
    if (cl && Array.isArray(cl.perpajakanBy) && cl.perpajakanBy.includes(user.id)) return true; // pelaksana pajak klien
    if (isPengawas) return [user.id, ...teamIds()].includes(t.assignedTo);
    return t.assignedTo === user.id;
  };
  const clientNameOf = (cidx) => (d.clients.find(c => c.id === cidx) || {}).nama || 'klien';
  // Klien yang boleh dilihat: PIC dalam lingkup, atau punya tugas dari anggota dalam lingkup (null = semua/admin)
  const visibleClientIds = () => {
    if (isAdmin) return null;
    if (isKlienStaff) return new Set(user.clientId ? [user.clientId] : []);  // hanya kliennya sendiri
    const scope = new Set(myScope());
    const ids = new Set();
    d.clients.forEach(c => {
      if (c.companyId !== cid) return;
      if (scope.has(c.assignedTo)) ids.add(c.id);                                                     // penanggung jawab (PJ) / PIC
      else if (Array.isArray(c.pembukuanBy) && c.pembukuanBy.some(x => scope.has(x))) ids.add(c.id);   // pelaksana pembukuan
      else if (Array.isArray(c.perpajakanBy) && c.perpajakanBy.some(x => scope.has(x))) ids.add(c.id); // pelaksana pajak (ditunjuk)
    });
    d.tasks.forEach(t => { if (t.companyId === cid && scope.has(t.assignedTo)) ids.add(t.clientId); }); // pelaksana SPT (via tugas)
    return ids;
  };
  // Sanitasi daftar pelaksana: boleh anggota firma mana pun (staff/pengawas), bukan klien-staff/admin.
  const sanitizePelaksana = (arr) => {
    if (!Array.isArray(arr)) return undefined;
    const valid = new Set(d.users.filter(u => u.companyId === cid && (u.role === 'staff' || u.role === 'pengawas')).map(u => u.id));
    return [...new Set(arr.filter(x => valid.has(x)))];
  };
  const sanitizePembukuan = sanitizePelaksana;
  const sanitizePerpajakan = sanitizePelaksana;
  const canSeeClient = (clientId) => { const v = visibleClientIds(); return v === null || v.has(clientId); };

  // Staf perusahaan klien tidak memakai modul konsultan: hanya boleh meta & membuka file lampiran kliennya.
  if (isKlienStaff) {
    const bolehMeta = pathname === '/api/consult/meta' && method === 'GET';
    const bolehFile = /^\/api\/documents\/[^/]+\/file$/.test(pathname) && method === 'GET';
    if (!bolehMeta && !bolehFile) { send(res, 403, { error: 'Akses khusus konsultan/staf firma.' }); return true; }
  }

  /* ---------- Meta (konstanta untuk dropdown) ---------- */
  if (pathname === '/api/consult/meta' && method === 'GET') {
    const isKlienStaff = user.role === 'klien-staff';
    const klienNama = isKlienStaff ? ((d.clients.find(c => c.id === user.clientId) || {}).nama || '') : '';
    send(res, 200, { kategoriDokumen: C.KATEGORI_DOKUMEN, jenisSPT: C.JENIS_SPT, statusTugas: C.STATUS_TUGAS, statusInvoice: C.STATUS_INVOICE, jenisUsaha: C.JENIS_USAHA,
      role: user.role, perms: user.perms || {}, canInvoice: canInv, isAdmin, isPengawas, isPJ, isOwner,
      isKlienStaff, clientId: isKlienStaff ? (user.clientId || null) : null, klienNama });
    return true;
  }

  /* ---------- Dashboard ---------- */
  if (pathname === '/api/consult/dashboard' && method === 'GET') {
    const data = C.dashboard(cid, myScope(), isAdmin || isPengawas);
    if (!canInv) { data.invoice = null; data.totalPendapatan = null; data.totalTagihan = null; data.piutangUsaha = null; }
    data.aktivitas = C.activities(cid, { limit: 15, excludeInvoice: !canInv });
    data.scope = isAdmin ? 'semua' : (isPengawas ? 'tim' : 'saya');
    send(res, 200, data);
    return true;
  }

  /* ---------- Pengingat tenggat SPT ---------- */
  if (pathname === '/api/consult/reminders' && method === 'GET') {
    const days = parseInt(query.days, 10) || 30;
    send(res, 200, C.reminders(cid, isStaff ? user.id : null, days));
    return true;
  }
  /* ---------- Buat tugas SPT otomatis (tenggat terhitung) ---------- */
  if (pathname === '/api/consult/generate-spt' && method === 'POST') {
    const b = await readBody(req);
    if (!b.clientId || !Array.isArray(b.jenisList) || !b.jenisList.length || !b.periode) { send(res, 400, { error: 'Klien, periode, dan minimal satu jenis wajib diisi.' }); return true; }
    let dibuat = 0, dilewati = 0;
    for (const jenis of b.jenisList) {
      const per = /tahunan/i.test(jenis) ? String(b.periode).slice(0, 4) : b.periode; // Tahunan pakai tahun
      if (d.tasks.some(t => t.companyId === cid && t.clientId === b.clientId && t.jenis === jenis && t.periode === per)) { dilewati++; continue; }
      const deadline = C.computeDeadline(jenis, per);
      d.tasks.push({ id: store.id(), companyId: cid, clientId: b.clientId, jenis, periode: per,
        assignedTo: b.assignedTo || user.id, status: 'belum', deadline, catatan: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      dibuat++;
    }
    store.saveNow();
    send(res, 200, { dibuat, dilewati });
    return true;
  }

  /* ---------- Hari libur (untuk penyesuaian tenggat) ---------- */
  if (pathname === '/api/consult/holidays' && method === 'GET') {
    const m = C.holidayMap();
    const custom = new Set(((d.settings && d.settings.holidays) || []).map(h => h.date));
    const list = Object.entries(m).map(([date, nama]) => ({ date, nama, custom: custom.has(date) })).sort((a, b) => a.date.localeCompare(b.date));
    send(res, 200, { holidays: list });
    return true;
  }
  // Data bawaan per tahun (untuk pratinjau/impor 1-klik) — khusus owner.
  if (pathname === '/api/consult/holidays/bawaan' && method === 'GET') {
    if (!isOwner) { send(res, 403, { error: 'Khusus pemilik (owner).' }); return true; }
    const tahun = String(query.tahun || new Date().getFullYear());
    send(res, 200, { tahun, items: (C.LIBUR_BAWAAN[tahun] || []), tahunTersedia: Object.keys(C.LIBUR_BAWAAN) });
    return true;
  }
  // Impor massal libur setahun (owner). Body: {items:[{date,nama}]}. Anti-dobel & lewati libur tetap.
  if (pathname === '/api/consult/holidays/import' && method === 'POST') {
    if (!isOwner) { send(res, 403, { error: 'Kalender libur hanya dikelola pemilik (owner).' }); return true; }
    const b = await readBody(req);
    const items = Array.isArray(b.items) ? b.items : [];
    d.settings = d.settings || {}; d.settings.holidays = d.settings.holidays || [];
    const fixedDates = new Set(); const yy = new Set(items.map(i => String(i.date || '').slice(0, 4)).filter(Boolean));
    yy.forEach(y => C.fixedHolidays(y).forEach(([dt]) => fixedDates.add(dt)));   // libur tanggal-tetap sudah otomatis
    const ada = new Set(d.settings.holidays.map(h => h.date));
    let ditambah = 0, dilewati = 0;
    for (const it of items) {
      const date = String(it.date || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { dilewati++; continue; }
      if (fixedDates.has(date) || ada.has(date)) { dilewati++; continue; }       // sudah tercakup
      d.settings.holidays.push({ date, nama: (it.nama || 'Libur Nasional').toString().trim() });
      ada.add(date); ditambah++;
    }
    store.saveNow(); send(res, 200, { ditambah, dilewati });
    return true;
  }
  if (pathname === '/api/consult/holidays' && method === 'POST') {
    if (!isOwner) { send(res, 403, { error: 'Kalender libur hanya dikelola pemilik (owner).' }); return true; }
    const b = await readBody(req);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) { send(res, 400, { error: 'Tanggal (YYYY-MM-DD) wajib diisi.' }); return true; }
    d.settings = d.settings || {}; d.settings.holidays = d.settings.holidays || [];
    if (!d.settings.holidays.some(h => h.date === b.date)) d.settings.holidays.push({ date: b.date, nama: (b.nama || 'Libur Nasional').trim() });
    store.saveNow(); send(res, 200, { ok: true });
    return true;
  }
  if (/^\/api\/consult\/holidays\/\d{4}-\d{2}-\d{2}$/.test(pathname) && method === 'DELETE') {
    if (!isOwner) { send(res, 403, { error: 'Kalender libur hanya dikelola pemilik (owner).' }); return true; }
    const date = pathname.split('/')[4];
    d.settings = d.settings || {}; d.settings.holidays = (d.settings.holidays || []).filter(h => h.date !== date);
    store.saveNow(); send(res, 200, { ok: true });
    return true;
  }

  /* ---------- Staff (akun login) ---------- */
  if (pathname === '/api/staff' && method === 'GET') {
    let members = d.users.filter(u => u.companyId === cid);
    if (!isAdmin) {
      const visible = new Set([user.id]);                                  // selalu lihat diri sendiri
      if (isPengawas) [user.id, ...teamIds()].forEach(x => visible.add(x)); // kompat: tim (supervisorId)
      myRosterUserIds().forEach(x => visible.add(x));                       // anggota roster klien yg dia-PJ-kan
      members = members.filter(u => visible.has(u.id));
    }
    const nameById = {}; d.users.forEach(u => nameById[u.id] = u.name);
    const clientNameById = {}; d.clients.forEach(c => clientNameById[c.id] = c.nama);
    const list = members.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, perms: u.perms || {},
      supervisorId: u.supervisorId || null, supervisorName: u.supervisorId ? (nameById[u.supervisorId] || '') : '',
      clientId: u.clientId || null, clientName: u.clientId ? (clientNameById[u.clientId] || '') : '' }));
    send(res, 200, { staff: list });
    return true;
  }
  if (pathname === '/api/staff' && method === 'POST') {
    if (!(isAdmin || isPJ)) { send(res, 403, { error: 'Hanya admin atau penanggung jawab klien yang dapat membuat akun.' }); return true; }
    const b = await readBody(req);
    const name = (b.name || '').trim(), email = (b.email || '').trim().toLowerCase(), pass = String(b.password || '');
    if (!name || !email || pass.length < 6) { send(res, 400, { error: 'Nama, email, dan kata sandi (min. 6) wajib diisi.' }); return true; }
    if (d.users.find(u => u.email === email)) { send(res, 400, { error: 'Email sudah terdaftar.' }); return true; }
    const { salt, hash } = auth.hashPassword(pass);
    // Hanya dua jenis akun: Staff (anggota firma) atau Staf Klien. Peran per-klien (PJ/pelaksana)
    // diatur di menu Penugasan — bukan titel global. "Pengawas" sudah dihapus.
    const role = (b.role === 'klien-staff') ? 'klien-staff' : 'staff';
    // klien-staff wajib terikat ke satu klien firma; PJ hanya untuk klien yang dia pegang.
    let clientId = null;
    if (role === 'klien-staff') {
      const cl = d.clients.find(c => c.id === b.clientId && c.companyId === cid);
      if (!cl) { send(res, 400, { error: 'Pilih klien yang akan ditangani staf perusahaan ini.' }); return true; }
      if (!isAdmin && cl.assignedTo !== user.id) { send(res, 403, { error: 'Anda hanya bisa membuat staf klien untuk klien yang Anda pegang (PJ).' }); return true; }
      clientId = cl.id;
    }
    const u = { id: store.id(), name, email, salt, passwordHash: hash, role, companyId: cid, perms: {},
      supervisorId: (isAdmin && role === 'staff') ? (b.supervisorId || null) : null, clientId, createdAt: new Date().toISOString() };
    d.users.push(u); store.saveNow();
    send(res, 200, { staff: { id: u.id, name: u.name, email: u.email, role: u.role, perms: u.perms, supervisorId: u.supervisorId, clientId: u.clientId } });
    return true;
  }
  /* Kelola akun: reset password / edit nama-email (admin atau PJ atas rosternya) + ubah peran (admin) */
  if (/^\/api\/staff\/[^/]+$/.test(pathname) && method === 'PUT') {
    const id = seg(pathname, 3);
    const u = d.users.find(x => x.id === id && x.companyId === cid);
    if (!u) { send(res, 404, { error: 'Anggota tidak ditemukan.' }); return true; }
    if (!canManageAccount(u)) { send(res, 403, { error: 'Anda tidak berwenang mengelola akun ini.' }); return true; }
    const b = await readBody(req);
    // Edit nama & email
    if (b.name !== undefined && String(b.name).trim()) u.name = String(b.name).trim();
    if (b.email !== undefined) {
      const email = String(b.email).trim().toLowerCase();
      if (email && email !== u.email) {
        if (d.users.find(x => x.email === email && x.id !== u.id)) { send(res, 400, { error: 'Email sudah dipakai akun lain.' }); return true; }
        u.email = email;
      }
    }
    // Reset password
    if (b.password !== undefined) {
      const pass = String(b.password);
      if (pass.length < 6) { send(res, 400, { error: 'Kata sandi minimal 6 karakter.' }); return true; }
      const { salt, hash } = auth.hashPassword(pass); u.salt = salt; u.passwordHash = hash;
    }
    // Ubah peran / pengawas: HANYA admin
    store.saveNow();
    send(res, 200, { ok: true });
    return true;
  }
  /* Beri/cabut izin (invoice / kelola tugas orang lain) */
  if (/^\/api\/staff\/[^/]+\/perms$/.test(pathname) && method === 'POST') {
    if (!canManage) { send(res, 403, { error: 'Khusus konsultan/admin.' }); return true; }
    const id = seg(pathname, 3);
    const b = await readBody(req);
    const u = d.users.find(x => x.id === id && x.companyId === cid && (x.role === 'staff' || x.role === 'pengawas'));
    if (!u) { send(res, 404, { error: 'Anggota tidak ditemukan.' }); return true; }
    u.perms = u.perms || {};
    if (b.invoice !== undefined) u.perms.invoice = !!b.invoice;
    store.saveNow();
    send(res, 200, { ok: true, perms: u.perms });
    return true;
  }
  if (/^\/api\/staff\/[^/]+$/.test(pathname) && method === 'DELETE') {
    if (!canManage) { send(res, 403, { error: 'Khusus konsultan/admin.' }); return true; }
    const id = seg(pathname, 3);
    if (id === user.id) { send(res, 400, { error: 'Tidak bisa menghapus akun sendiri.' }); return true; }
    const t = d.users.find(u => u.id === id && u.companyId === cid && (u.role === 'staff' || u.role === 'pengawas' || u.role === 'klien-staff'));
    if (!t) { send(res, 404, { error: 'Anggota tidak ditemukan.' }); return true; }
    d.users = d.users.filter(u => u.id !== id);
    d.tasks.forEach(tk => { if (tk.assignedTo === id) tk.assignedTo = null; });
    d.users.forEach(u => { if (u.supervisorId === id) u.supervisorId = null; });
    store.saveNow();
    send(res, 200, { ok: true });
    return true;
  }

  /* ---------- Klien ---------- */
  if (pathname === '/api/clients' && method === 'GET') {
    let list = C.byCompany('clients', cid);
    const v = visibleClientIds(); if (v) list = list.filter(c => v.has(c.id));
    send(res, 200, { clients: list.sort((a, b) => (a.nama || '').localeCompare(b.nama || '')) });
    return true;
  }
  if (pathname === '/api/clients' && method === 'POST') {
    if (isStaff) { send(res, 403, { error: 'Staff tidak dapat menambah klien. Hubungi konsultan/pengawas.' }); return true; }
    const b = await readBody(req);
    if (!b.nama) { send(res, 400, { error: 'Nama klien wajib diisi.' }); return true; }
    // pengawas: PIC harus anggota timnya (atau dirinya) agar tetap terlihat
    let assignedTo = b.assignedTo || null;
    if (isPengawas) { const allowed = [user.id, ...teamIds()]; if (!assignedTo || !allowed.includes(assignedTo)) assignedTo = user.id; }
    const c = { id: store.id(), companyId: cid, nama: b.nama.trim(), npwp: b.npwp || '', jenisUsaha: b.jenisUsaha || '',
      pic: b.pic || '', email: b.email || '', telepon: b.telepon || '', status: b.status === 'nonaktif' ? 'nonaktif' : 'aktif',
      assignedTo, pembukuanBy: sanitizePembukuan(b.pembukuanBy) || [], perpajakanBy: sanitizePerpajakan(b.perpajakanBy) || [], createdAt: new Date().toISOString() };
    d.clients.push(c);
    C.logActivity(cid, user, 'client', `menambah klien ${c.nama}`);
    store.saveNow();
    send(res, 200, { client: c });
    return true;
  }
  if (/^\/api\/clients\/[^/]+$/.test(pathname) && method === 'PUT') {
    const c = d.clients.find(x => x.id === seg(pathname, 3) && x.companyId === cid);
    if (!c) { send(res, 404, { error: 'Klien tidak ditemukan.' }); return true; }
    if (!isAdmin && !(isPengawas && canSeeClient(c.id))) { send(res, 403, { error: 'Anda tidak berwenang mengubah klien ini.' }); return true; }
    const b = await readBody(req);
    ['nama', 'npwp', 'jenisUsaha', 'pic', 'email', 'telepon', 'status'].forEach(k => { if (b[k] !== undefined) c[k] = b[k]; });
    // Menunjuk Penanggung Jawab (assignedTo) HANYA Admin. Non-admin edit pelaksana → PJ tak tersentuh.
    if (isAdmin && b.assignedTo !== undefined) c.assignedTo = b.assignedTo || null;
    // Delegasi pelaksana: admin atau pengawas yang boleh melihat klien ini.
    if (b.pembukuanBy !== undefined) { const p = sanitizePembukuan(b.pembukuanBy); if (p) c.pembukuanBy = p; }
    if (b.perpajakanBy !== undefined) { const p = sanitizePerpajakan(b.perpajakanBy); if (p) c.perpajakanBy = p; }
    store.saveNow();
    send(res, 200, { client: c });
    return true;
  }
  if (/^\/api\/clients\/[^/]+$/.test(pathname) && method === 'DELETE') {
    if (!canManage) { send(res, 403, { error: 'Khusus konsultan/admin.' }); return true; }
    const id = seg(pathname, 3);
    const c = d.clients.find(x => x.id === id && x.companyId === cid);
    if (!c) { send(res, 404, { error: 'Klien tidak ditemukan.' }); return true; }
    // hapus dokumen (beserta file), tugas, invoice terkait
    d.documents.filter(dk => dk.clientId === id && dk.file).forEach(dk => C.deleteFile(cid, dk.file.stored));
    d.documents = d.documents.filter(dk => dk.clientId !== id);
    d.tasks.filter(t => t.clientId === id && t.bukti).forEach(t => C.deleteFile(cid, t.bukti.stored));
    d.tasks = d.tasks.filter(t => t.clientId !== id);
    d.invoices = d.invoices.filter(i => i.clientId !== id);
    d.clients = d.clients.filter(x => x.id !== id);
    store.saveNow();
    send(res, 200, { ok: true });
    return true;
  }

  /* ---------- Pekerjaan / Progres SPT ---------- */
  if (pathname === '/api/tasks' && method === 'GET') {
    let list = C.byCompany('tasks', cid);
    if (query.clientId) list = list.filter(t => t.clientId === query.clientId);
    // pelingkupan peran: tugas milik lingkupnya + tugas klien yang boleh dilihat (berbagi, read-only bila bukan miliknya)
    if (!isAdmin) { const scope = new Set(myScope()); list = list.filter(t => scope.has(t.assignedTo) || canSeeClient(t.clientId)); }
    // "Lihat sebagai" staf tertentu (admin, atau pengawas dalam timnya)
    if (query.asStaff && (isAdmin || (isPengawas && [user.id, ...teamIds()].includes(query.asStaff)))) {
      list = list.filter(t => t.assignedTo === query.asStaff);
    }
    if (query.mine === '1') list = list.filter(t => t.assignedTo === user.id);
    list = list.map(t => { const note = C.deadlineNote(t.jenis, t.deadline); return Object.assign({}, t, {
        clientName: (d.clients.find(c => c.id === t.clientId) || {}).nama || '—', assigneeName: C.staffName(t.assignedTo),
        catatanTenggat: note ? note.catatan : '', deadlineEfektif: note ? note.efektif : t.deadline,
        canEdit: canEditTask(t), punyaBukti: !!(t.bukti || t.buktiLink) }); })
      .sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));
    send(res, 200, { tasks: list });
    return true;
  }
  if (pathname === '/api/tasks' && method === 'POST') {
    const b = await readBody(req);
    if (!b.clientId || !b.jenis) { send(res, 400, { error: 'Klien dan jenis pekerjaan wajib diisi.' }); return true; }
    // penentuan penerima tugas sesuai peran
    let assignedTo = b.assignedTo || user.id;
    if (isStaff) assignedTo = user.id;                                   // staff hanya untuk dirinya
    else if (isPengawas) { const allowed = [user.id, ...teamIds()]; if (!allowed.includes(assignedTo)) assignedTo = user.id; } // pengawas hanya ke timnya
    const t = { id: store.id(), companyId: cid, clientId: b.clientId, jenis: b.jenis, periode: b.periode || '',
      assignedTo, status: C.STATUS_TUGAS.includes(b.status) ? b.status : 'belum',
      deadline: b.deadline || '', catatan: b.catatan || '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    d.tasks.push(t);
    C.logActivity(cid, user, 'task', `membuat tugas ${t.jenis} — ${clientNameOf(t.clientId)}`);
    store.saveNow();
    send(res, 200, { task: t });
    return true;
  }
  if (/^\/api\/tasks\/[^/]+$/.test(pathname) && method === 'PUT') {
    const t = d.tasks.find(x => x.id === seg(pathname, 3) && x.companyId === cid);
    if (!t) { send(res, 404, { error: 'Pekerjaan tidak ditemukan.' }); return true; }
    if (!canEditTask(t)) { send(res, 403, { error: 'Anda tidak berwenang mengubah pekerjaan ini.' }); return true; }
    const b = await readBody(req);
    const oldAssignee = t.assignedTo;
    ['clientId', 'jenis', 'periode', 'assignedTo', 'deadline', 'catatan'].forEach(k => { if (b[k] !== undefined) t[k] = b[k]; });
    // batasi penugasan ulang sesuai peran
    if (!isAdmin) {
      if (isPengawas) { const allowed = [user.id, ...teamIds()]; if (!allowed.includes(t.assignedTo)) t.assignedTo = oldAssignee; }
      else t.assignedTo = oldAssignee; // staff tak boleh menugaskan ulang
    }
    if (b.status !== undefined && C.STATUS_TUGAS.includes(b.status)) {
      // Menandai Selesai wajib ada bukti lapor (BPE)
      if (b.status === 'selesai' && !(t.bukti || t.buktiLink)) {
        send(res, 400, { error: 'Lampiran Bukti Penerimaan Elektronik (BPE) wajib dilampirkan sebelum menandai Selesai.', butuhBukti: true });
        return true;
      }
      const berubah = t.status !== b.status;
      t.status = b.status;
      if (b.status === 'selesai') t.selesaiAt = t.selesaiAt || new Date().toISOString();
      if (berubah) C.logActivity(cid, user, 'task', `mengubah status ${t.jenis} — ${clientNameOf(t.clientId)} → ${b.status}`);
    }
    t.updatedAt = new Date().toISOString();
    store.saveNow();
    send(res, 200, { task: t });
    return true;
  }
  /* Tandai Selesai dengan melampirkan bukti lapor (BPE Coretax) */
  if (/^\/api\/tasks\/[^/]+\/selesai$/.test(pathname) && method === 'POST') {
    const id = seg(pathname, 3);
    const t = d.tasks.find(x => x.id === id && x.companyId === cid);
    if (!t) { send(res, 404, { error: 'Pekerjaan tidak ditemukan.' }); return true; }
    if (!canEditTask(t)) { send(res, 403, { error: 'Anda tidak berwenang menyelesaikan pekerjaan ini.' }); return true; }
    const b = await readBody(req);
    const adaFile = b.base64 && b.filename;
    const adaLink = b.link && String(b.link).trim();
    if (!adaFile && !adaLink && !(t.bukti || t.buktiLink)) {
      send(res, 400, { error: 'Lampiran Bukti Penerimaan Elektronik (BPE) wajib dilampirkan sebelum menandai Selesai.', butuhBukti: true });
      return true;
    }
    if (adaFile) {
      if (t.bukti) C.deleteFile(cid, t.bukti.stored);
      try { const rf = C.saveFile(cid, 'bukti-' + id, b.filename, b.base64); t.bukti = { name: b.filename, mime: b.mime || 'application/octet-stream', size: rf.size, stored: rf.stored }; }
      catch (e) { send(res, 400, { error: 'Gagal menyimpan bukti: ' + e.message }); return true; }
    }
    if (adaLink) t.buktiLink = String(b.link).trim();
    if (b.nomor !== undefined) t.buktiNomor = String(b.nomor).trim();
    if (b.tanggal !== undefined) t.buktiTanggal = b.tanggal;
    t.status = 'selesai'; t.selesaiAt = new Date().toISOString(); t.updatedAt = t.selesaiAt;
    C.logActivity(cid, user, 'task', `menyelesaikan ${t.jenis} — ${clientNameOf(t.clientId)}${t.periode ? ` (${t.periode})` : ''}, bukti BPE dilampirkan`);
    store.saveNow();
    send(res, 200, { task: t });
    return true;
  }
  /* Unduh bukti lapor (BPE) */
  if (/^\/api\/tasks\/[^/]+\/bukti\/file$/.test(pathname) && method === 'GET') {
    const t = d.tasks.find(x => x.id === seg(pathname, 3) && x.companyId === cid);
    if (!t || !t.bukti) { send(res, 404, { error: 'Bukti tidak ada.' }); return true; }
    if (!canSeeTask(t)) { send(res, 403, { error: 'Tidak berwenang.' }); return true; }
    try {
      const fs = require('fs');
      const buf = fs.readFileSync(C.filePath(cid, t.bukti.stored));
      const disp = query.inline ? 'inline' : 'attachment'; // inline = tampil di aplikasi, attachment = unduh
      res.writeHead(200, { 'Content-Type': t.bukti.mime || 'application/octet-stream',
        'Content-Disposition': `${disp}; filename="${encodeURIComponent(t.bukti.name)}"`, 'Content-Length': buf.length });
      res.end(buf);
    } catch (e) { send(res, 404, { error: 'File bukti tidak ditemukan.' }); }
    return true;
  }
  if (/^\/api\/tasks\/[^/]+$/.test(pathname) && method === 'DELETE') {
    const th = d.tasks.find(x => x.id === seg(pathname, 3) && x.companyId === cid);
    if (!th) { send(res, 404, { error: 'Pekerjaan tidak ditemukan.' }); return true; }
    const bolehHapus = isAdmin || (isPengawas && [user.id, ...teamIds()].includes(th.assignedTo));
    if (!bolehHapus) { send(res, 403, { error: 'Tidak berwenang menghapus pekerjaan ini.' }); return true; }
    if (th.bukti) C.deleteFile(cid, th.bukti.stored);
    d.tasks = d.tasks.filter(x => x.id !== th.id); store.saveNow();
    send(res, 200, { ok: true });
    return true;
  }

  /* ---------- Invoice Klien (khusus konsultan/admin) ---------- */
  if (pathname === '/api/invoices' && method === 'GET') {
    if (!canInv) { send(res, 403, { error: 'Anda belum diberi izin akses invoice oleh konsultan.' }); return true; }
    const list = C.byCompany('invoices', cid).map(i => Object.assign({}, i, {
        clientName: (d.clients.find(c => c.id === i.clientId) || {}).nama || '—',
        assigneeName: i.assignedTo ? C.staffName(i.assignedTo) : '' }))
      .sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));
    send(res, 200, { invoices: list });
    return true;
  }
  if (pathname === '/api/invoices' && method === 'POST') {
    if (!canInv) { send(res, 403, { error: 'Anda belum diberi izin akses invoice oleh konsultan.' }); return true; }
    const b = await readBody(req);
    if (!b.clientId || !b.jumlah) { send(res, 400, { error: 'Klien dan jumlah wajib diisi.' }); return true; }
    const nomor = b.nomor || ('INV-' + String(store.nextNumber(cid, 'invoice')).padStart(4, '0'));
    const inv = { id: store.id(), companyId: cid, clientId: b.clientId, nomor, tanggal: b.tanggal || new Date().toISOString().slice(0, 10),
      jatuhTempo: b.jatuhTempo || '', jumlah: Number(b.jumlah) || 0, keterangan: b.keterangan || '', assignedTo: b.assignedTo || null,
      status: C.STATUS_INVOICE.includes(b.status) ? b.status : 'belum', paidAt: b.status === 'lunas' ? new Date().toISOString() : null, createdAt: new Date().toISOString() };
    d.invoices.push(inv);
    C.logActivity(cid, user, 'invoice', `membuat invoice ${inv.nomor} — ${clientNameOf(inv.clientId)}`);
    store.saveNow();
    send(res, 200, { invoice: inv });
    return true;
  }
  if (/^\/api\/invoices\/[^/]+$/.test(pathname) && method === 'PUT') {
    if (!canInv) { send(res, 403, { error: 'Anda belum diberi izin akses invoice oleh konsultan.' }); return true; }
    const inv = d.invoices.find(x => x.id === seg(pathname, 3) && x.companyId === cid);
    if (!inv) { send(res, 404, { error: 'Invoice tidak ditemukan.' }); return true; }
    const b = await readBody(req);
    ['clientId', 'nomor', 'tanggal', 'jatuhTempo', 'keterangan', 'assignedTo'].forEach(k => { if (b[k] !== undefined) inv[k] = b[k]; });
    if (b.jumlah !== undefined) inv.jumlah = Number(b.jumlah) || 0;
    if (b.status !== undefined && C.STATUS_INVOICE.includes(b.status)) {
      const ubah = inv.status !== b.status;
      inv.status = b.status; inv.paidAt = b.status === 'lunas' ? (inv.paidAt || new Date().toISOString()) : null;
      if (ubah) C.logActivity(cid, user, 'invoice', `menandai invoice ${inv.nomor} — ${clientNameOf(inv.clientId)}: ${b.status === 'lunas' ? 'Lunas' : b.status === 'tertunda' ? 'Tertunda' : 'Belum Lunas'}`);
    }
    store.saveNow();
    send(res, 200, { invoice: inv });
    return true;
  }
  if (/^\/api\/invoices\/[^/]+$/.test(pathname) && method === 'DELETE') {
    if (!canManage) { send(res, 403, { error: 'Khusus konsultan/admin.' }); return true; }
    d.invoices = d.invoices.filter(x => !(x.id === seg(pathname, 3) && x.companyId === cid)); store.saveNow();
    send(res, 200, { ok: true });
    return true;
  }

  /* ---------- Arsip Dokumen ---------- */
  if (pathname === '/api/documents' && method === 'GET') {
    let list = C.byCompany('documents', cid);
    const vDoc = visibleClientIds(); if (vDoc) list = list.filter(x => vDoc.has(x.clientId));
    if (query.clientId) list = list.filter(x => x.clientId === query.clientId);
    if (query.kategori) list = list.filter(x => x.kategori === query.kategori);
    list = list.map(x => Object.assign({}, x, { clientName: (d.clients.find(c => c.id === x.clientId) || {}).nama || '—',
      punyaFile: !!x.file, uploader: C.staffName(x.uploadedBy) })).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    send(res, 200, { documents: list });
    return true;
  }
  if (pathname === '/api/documents' && method === 'POST') {
    const b = await readBody(req);
    if (!b.clientId || !b.kategori) { send(res, 400, { error: 'Klien dan kategori dokumen wajib diisi.' }); return true; }
    if (!canSeeClient(b.clientId)) { send(res, 403, { error: 'Anda tidak berwenang menambah dokumen untuk klien ini.' }); return true; }
    const docId = store.id();
    let file = null;
    if (b.base64 && b.filename) {
      try { const r = C.saveFile(cid, docId, b.filename, b.base64); file = { name: b.filename, mime: b.mime || 'application/octet-stream', size: r.size, stored: r.stored }; }
      catch (e) { send(res, 400, { error: 'Gagal menyimpan file: ' + e.message }); return true; }
    }
    const doc = { id: docId, companyId: cid, clientId: b.clientId, kategori: b.kategori, nama: b.nama || (file ? file.name : b.kategori),
      periode: b.periode || '', status: file || b.link ? 'ada' : (b.status || 'belum'), catatan: b.catatan || '', link: b.link || '',
      file, uploadedBy: user.id, createdAt: new Date().toISOString() };
    d.documents.push(doc);
    C.logActivity(cid, user, 'document', `mengunggah dokumen ${doc.kategori} — ${clientNameOf(doc.clientId)}`);
    store.saveNow();
    send(res, 200, { document: doc });
    return true;
  }
  if (/^\/api\/documents\/[^/]+\/file$/.test(pathname) && method === 'GET') {
    const doc = d.documents.find(x => x.id === seg(pathname, 3) && x.companyId === cid);
    if (!doc || !doc.file) { send(res, 404, { error: 'File tidak ada.' }); return true; }
    if (!canSeeClient(doc.clientId)) { send(res, 403, { error: 'Anda tidak berwenang membuka dokumen ini.' }); return true; }
    try {
      const fs = require('fs');
      const buf = fs.readFileSync(C.filePath(cid, doc.file.stored));
      const disp = query.inline ? 'inline' : 'attachment';
      res.writeHead(200, { 'Content-Type': doc.file.mime || 'application/octet-stream',
        'Content-Disposition': `${disp}; filename="${encodeURIComponent(doc.file.name)}"`, 'Content-Length': buf.length });
      res.end(buf);
    } catch (e) { send(res, 404, { error: 'File tidak ditemukan di penyimpanan.' }); }
    return true;
  }
  if (/^\/api\/documents\/[^/]+$/.test(pathname) && method === 'DELETE') {
    const id = seg(pathname, 3);
    const doc = d.documents.find(x => x.id === id && x.companyId === cid);
    if (!doc) { send(res, 404, { error: 'Dokumen tidak ditemukan.' }); return true; }
    if (!canSeeClient(doc.clientId)) { send(res, 403, { error: 'Anda tidak berwenang menghapus dokumen ini.' }); return true; }
    if (doc.file) C.deleteFile(cid, doc.file.stored);
    d.documents = d.documents.filter(x => x.id !== id); store.saveNow();
    send(res, 200, { ok: true });
    return true;
  }

  return false;
}

module.exports = { owns, handle };
