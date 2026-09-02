'use strict';
/*
 * Modul Konsultan Pajak: helper data (klien, pekerjaan/SPT, invoice, arsip dokumen),
 * penyimpanan file di disk (di DATA_DIR, di luar folder proyek yang terkunci),
 * dan agregasi angka untuk Dashboard Konsultan.
 */
const fs = require('fs');
const path = require('path');
const { db, id } = require('./db');
const { DATA_DIR } = require('./paths');

/* ---------- Log aktivitas tim (feed dashboard) ---------- */
function logActivity(companyId, user, kind, text) {
  const d = db();
  d.activities = d.activities || [];
  d.activities.push({ id: id(), companyId, userId: user.id, userName: user.name, kind, text, at: new Date().toISOString() });
  // batasi 400 terakhir per perusahaan
  const mine = d.activities.filter(a => a.companyId === companyId);
  if (mine.length > 400) {
    const buang = new Set(mine.slice(0, mine.length - 400).map(a => a.id));
    d.activities = d.activities.filter(a => !buang.has(a.id));
  }
}
function activities(companyId, opts) {
  opts = opts || {};
  let list = (db().activities || []).filter(a => a.companyId === companyId);
  if (opts.excludeInvoice) list = list.filter(a => a.kind !== 'invoice');
  return list.sort((a, b) => b.at.localeCompare(a.at)).slice(0, opts.limit || 15);
}

const KATEGORI_DOKUMEN = [
  'SPT Tahunan PPh Badan', 'Laporan Keuangan', 'Faktur Pajak Keluaran',
  'Faktur Pajak Masukan', 'SPT Masa PPh', 'SPT Masa PPN',
  'SK Pengesahan', 'Dokumen Legal Lainnya'
];
const JENIS_SPT = [
  'SPT Tahunan PPh Badan', 'SPT Masa PPN', 'SPT Masa PPh 21',
  'SPT Masa PPh 23/26', 'SPT Masa PPh Final 4(2)', 'Pekerjaan Lain'
];
const STATUS_TUGAS = ['belum', 'proses', 'review', 'selesai'];
const STATUS_INVOICE = ['lunas', 'belum', 'tertunda'];
// Kategori jenis usaha terstruktur (memicu template CALK & rincian pos yang relevan)
const JENIS_USAHA = [
  'Perdagangan (Dagang)', 'Jasa', 'Manufaktur / Industri', 'Konstruksi',
  'Pertanian / Perkebunan', 'Properti / Real Estat', 'Teknologi / Digital',
  'Transportasi & Logistik', 'Perhotelan & Restoran', 'Nirlaba / Yayasan', 'Lainnya'
];

const FILES_DIR = path.join(DATA_DIR, 'files');
function ensureFilesDir(companyId) {
  const dir = path.join(FILES_DIR, String(companyId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function safeName(name) {
  return String(name || 'file').replace(/[^\w.\- ]+/g, '_').slice(0, 80);
}
function saveFile(companyId, docId, filename, base64) {
  const dir = ensureFilesDir(companyId);
  const stored = docId + '__' + safeName(filename);
  const full = path.join(dir, stored);
  fs.writeFileSync(full, Buffer.from(base64 || '', 'base64'));
  return { stored, size: fs.statSync(full).size };
}
function filePath(companyId, stored) {
  return path.join(FILES_DIR, String(companyId), stored);
}
function deleteFile(companyId, stored) {
  try { fs.unlinkSync(filePath(companyId, stored)); } catch (e) {}
}

const byCompany = (coll, cid) => db()[coll].filter(x => x.companyId === cid);

// Nama staff (dari users) untuk pemetaan id -> nama
function staffName(userId) {
  const u = db().users.find(x => x.id === userId);
  return u ? u.name : '—';
}

/* Agregasi Dashboard. Jika staffId diberikan (peran staff), sebagian difilter. */
// assigneeIds: array id staf yang boleh dilihat (null = semua). showPerStaff: tampilkan rincian per staf.
function dashboard(companyId, assigneeIds, showPerStaff) {
  const clients = byCompany('clients', companyId);
  const tasksAll = byCompany('tasks', companyId);
  const invoices = byCompany('invoices', companyId);
  const inScope = assigneeIds ? new Set(assigneeIds) : null;
  const tasks = inScope ? tasksAll.filter(t => inScope.has(t.assignedTo)) : tasksAll;

  const klienAktif = clients.filter(c => c.status !== 'nonaktif').length;

  const inv = { lunas: { n: 0, rp: 0 }, belum: { n: 0, rp: 0 }, tertunda: { n: 0, rp: 0 } };
  for (const i of invoices) {
    const s = STATUS_INVOICE.includes(i.status) ? i.status : 'belum';
    inv[s].n++; inv[s].rp += Number(i.jumlah) || 0;
  }
  const totalPendapatan = inv.lunas.rp;                       // yang sudah dibayar
  const totalTagihan = inv.lunas.rp + inv.belum.rp + inv.tertunda.rp;
  const piutangUsaha = inv.belum.rp + inv.tertunda.rp;

  // progres tugas
  const perStatus = { belum: 0, proses: 0, review: 0, selesai: 0 };
  const perJenis = {};
  const today = new Date().toISOString().slice(0, 10);
  let terlambat = 0;
  for (const t of tasks) {
    perStatus[t.status] = (perStatus[t.status] || 0) + 1;
    if (!perJenis[t.jenis]) perJenis[t.jenis] = { total: 0, selesai: 0 };
    perJenis[t.jenis].total++; if (t.status === 'selesai') perJenis[t.jenis].selesai++;
    if (t.deadline && t.deadline < today && t.status !== 'selesai') terlambat++;
  }
  const totalTugas = tasks.length;
  const tugasSelesai = perStatus.selesai || 0;

  // progres per staff (admin: semua; pengawas: timnya)
  const perStaff = {};
  if (showPerStaff) {
    for (const t of tasks) {
      const k = t.assignedTo || '-';
      if (!perStaff[k]) perStaff[k] = { nama: staffName(t.assignedTo), total: 0, selesai: 0 };
      perStaff[k].total++; if (t.status === 'selesai') perStaff[k].selesai++;
    }
  }

  return {
    klien: { total: clients.length, aktif: klienAktif },
    invoice: inv,
    totalPendapatan, totalTagihan, piutangUsaha,
    tugas: { total: totalTugas, selesai: tugasSelesai, perStatus, perJenis, terlambat, perStaff: Object.values(perStaff) }
  };
}

/* ---------- Tenggat SPT resmi (default; bisa berubah sesuai peraturan) ---------- */
function pad(n) { return String(n).padStart(2, '0'); }
function computeDeadline(jenis, periode) {
  const j = String(jenis || '').toLowerCase();
  if (j.includes('tahunan')) {
    const y = parseInt(periode, 10) || new Date().getFullYear();
    return j.includes('badan') ? `${y + 1}-04-30` : `${y + 1}-03-31`; // Badan 30 Apr, OP 31 Mar
  }
  if (!/^\d{4}-\d{2}$/.test(periode || '')) return '';
  const [y, m] = periode.split('-').map(Number);
  const nextY = m === 12 ? y + 1 : y, nextM = m === 12 ? 1 : m + 1;
  if (j.includes('ppn')) { const last = new Date(nextY, nextM, 0).getDate(); return `${nextY}-${pad(nextM)}-${pad(last)}`; } // PPN: akhir bln berikutnya
  return `${nextY}-${pad(nextM)}-20`; // PPh Masa: tgl 20 bln berikutnya
}
function deadlineInfo(jenis) {
  const j = String(jenis || '').toLowerCase();
  if (j.includes('tahunan') && j.includes('badan')) return '30 April tahun berikutnya';
  if (j.includes('tahunan')) return '31 Maret tahun berikutnya';
  if (j.includes('ppn')) return 'Akhir bulan berikutnya';
  return 'Tanggal 20 bulan berikutnya';
}

/* ---------- Hari libur (untuk penyesuaian tenggat SPT Masa) ---------- */
// Kalender libur bawaan per tahun (untuk impor 1-klik oleh owner). Sumber: SKB 3 Menteri
// via Sekretariat Negara (setneg.go.id), diambil 2026-09-02. WAJIB diverifikasi ulang ke
// SKB resmi karena cuti bersama dapat direvisi pemerintah. Menambah tahun baru: tambah entri.
const LIBUR_BAWAAN = {
  '2026': [
    { date: '2026-01-01', nama: 'Tahun Baru Masehi' },
    { date: '2026-01-16', nama: 'Isra Mikraj Nabi Muhammad SAW' },
    { date: '2026-02-16', nama: 'Cuti Bersama Tahun Baru Imlek' },
    { date: '2026-02-17', nama: 'Tahun Baru Imlek 2577 Kongzili' },
    { date: '2026-03-18', nama: 'Cuti Bersama Hari Suci Nyepi' },
    { date: '2026-03-19', nama: 'Hari Suci Nyepi (Tahun Baru Saka 1948)' },
    { date: '2026-03-20', nama: 'Cuti Bersama Idulfitri 1447 H' },
    { date: '2026-03-21', nama: 'Idulfitri 1447 H' },
    { date: '2026-03-22', nama: 'Idulfitri 1447 H' },
    { date: '2026-03-23', nama: 'Cuti Bersama Idulfitri 1447 H' },
    { date: '2026-03-24', nama: 'Cuti Bersama Idulfitri 1447 H' },
    { date: '2026-04-03', nama: 'Wafat Yesus Kristus (Jumat Agung)' },
    { date: '2026-04-05', nama: 'Kebangkitan Yesus Kristus (Paskah)' },
    { date: '2026-05-01', nama: 'Hari Buruh Internasional' },
    { date: '2026-05-14', nama: 'Kenaikan Yesus Kristus' },
    { date: '2026-05-15', nama: 'Cuti Bersama Kenaikan Yesus Kristus' },
    { date: '2026-05-27', nama: 'Iduladha 1447 H' },
    { date: '2026-05-28', nama: 'Cuti Bersama Iduladha 1447 H' },
    { date: '2026-05-31', nama: 'Hari Raya Waisak 2570 BE' },
    { date: '2026-06-01', nama: 'Hari Lahir Pancasila' },
    { date: '2026-06-16', nama: 'Tahun Baru Islam 1448 H (1 Muharam)' },
    { date: '2026-08-17', nama: 'Proklamasi Kemerdekaan RI' },
    { date: '2026-08-25', nama: 'Maulid Nabi Muhammad SAW' },
    { date: '2026-12-24', nama: 'Cuti Bersama Hari Raya Natal' },
    { date: '2026-12-25', nama: 'Hari Raya Natal' }
  ]
};
function fixedHolidays(year) {
  return [
    [`${year}-01-01`, 'Tahun Baru Masehi'],
    [`${year}-05-01`, 'Hari Buruh Internasional'],
    [`${year}-06-01`, 'Hari Lahir Pancasila'],
    [`${year}-08-17`, 'HUT Kemerdekaan RI'],
    [`${year}-12-25`, 'Hari Raya Natal']
  ];
}
function holidayMap() {
  const d = db();
  const extra = (d.settings && d.settings.holidays) || [];
  const m = {};
  const nowY = new Date().getFullYear();
  [nowY - 1, nowY, nowY + 1, nowY + 2].forEach(y => fixedHolidays(y).forEach(([dt, nm]) => { m[dt] = nm; }));
  extra.forEach(h => { if (h.date) m[h.date] = h.nama || 'Libur Nasional'; });
  return m;
}
function dow(dateStr) { return new Date(dateStr + 'T00:00:00Z').getUTCDay(); } // 0=Minggu,6=Sabtu
function liburInfo(dateStr) {
  const m = holidayMap();
  if (m[dateStr]) return { libur: true, nama: m[dateStr] };
  const w = dow(dateStr);
  if (w === 6) return { libur: true, nama: 'hari Sabtu' };
  if (w === 0) return { libur: true, nama: 'hari Minggu' };
  return { libur: false };
}
function nextWorkingDay(dateStr) {
  const m = holidayMap();
  let t = Date.parse(dateStr + 'T00:00:00Z');
  for (let i = 0; i < 40; i++) {
    t += 864e5;
    const s = new Date(t).toISOString().slice(0, 10);
    const w = new Date(t).getUTCDay();
    if (w !== 0 && w !== 6 && !m[s]) return s;
  }
  return dateStr;
}
// Keterangan bila tenggat SPT Masa jatuh di akhir pekan/libur (kecuali Tahunan)
function deadlineNote(jenis, deadline) {
  if (!deadline || /tahunan/i.test(String(jenis))) return null;
  const info = liburInfo(deadline);
  if (!info.libur) return null;
  const efektif = nextWorkingDay(deadline);
  return { alasan: info.nama, efektif, catatan: `Tenggat ${deadline} jatuh pada ${info.nama} — batas lapor mundur ke hari kerja berikutnya: ${efektif}.` };
}

/* ---------- Daftar pengingat: terlambat & mendekati tenggat ---------- */
function reminders(companyId, staffId, days) {
  days = days || 30;
  const today = new Date().toISOString().slice(0, 10);
  const t0 = Date.parse(today);
  let list = byCompany('tasks', companyId).filter(t => t.status !== 'selesai' && t.deadline);
  if (staffId) list = list.filter(t => t.assignedTo === staffId);
  const rows = list.map(t => {
    const note = deadlineNote(t.jenis, t.deadline);
    const efektif = note ? note.efektif : t.deadline;                 // pakai tanggal efektif utk hitung sisa hari
    const daysLeft = Math.round((Date.parse(efektif) - t0) / 864e5);
    return {
      id: t.id, clientId: t.clientId, jenis: t.jenis, periode: t.periode, status: t.status,
      deadline: t.deadline, deadlineEfektif: efektif, catatanTenggat: note ? note.catatan : '', daysLeft,
      clientName: (db().clients.find(c => c.id === t.clientId) || {}).nama || '—',
      assigneeName: staffName(t.assignedTo)
    };
  }).sort((a, b) => a.daysLeft - b.daysLeft);
  const overdue = rows.filter(r => r.daysLeft < 0);
  const soon = rows.filter(r => r.daysLeft >= 0 && r.daysLeft <= 7);
  const upcoming = rows.filter(r => r.daysLeft > 7 && r.daysLeft <= days);
  return { overdue, soon, upcoming, counts: { overdue: overdue.length, soon: soon.length, upcoming: upcoming.length } };
}

module.exports = {
  KATEGORI_DOKUMEN, JENIS_SPT, STATUS_TUGAS, STATUS_INVOICE, JENIS_USAHA,
  byCompany, staffName, dashboard, computeDeadline, deadlineInfo, reminders,
  deadlineNote, liburInfo, nextWorkingDay, holidayMap, fixedHolidays, LIBUR_BAWAAN,
  logActivity, activities,
  ensureFilesDir, saveFile, filePath, deleteFile, FILES_DIR
};
