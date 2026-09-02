'use strict';
/*
 * Penyimpanan data sederhana berbasis berkas JSON (tanpa dependensi eksternal).
 * Seluruh data dimuat ke memori saat start, dan ditulis ke disk secara atomik
 * (tulis ke berkas sementara lalu ganti nama) setiap kali ada perubahan.
 * Cocok untuk skala kecil-menengah. Bisa dimigrasi ke database SQL di kemudian hari.
 */
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./paths');

const DB_FILE = path.join(DATA_DIR, 'db.json');

const EMPTY = {
  meta: { version: 1, createdAt: null },
  users: [],
  companies: [],
  accounts: [],
  journals: [],
  budgets: [],
  bankRecs: [],
  counters: {},
  settings: {},        // setelan global (mis. kunci API AI) - dikelola admin
  imports: [],         // batch impor untuk direview sebelum diposting ke jurnal
  classifiers: {},     // model klasifikasi belajar-pola per perusahaan
  rules: [],           // aturan tetap: keterangan mengandung X -> akun Y (per perusahaan)
  // ---- Modul Konsultan Pajak ----
  clients: [],         // klien konsultan (per firma/perusahaan)
  tasks: [],           // pekerjaan/progres SPT per klien, ditugaskan ke staff
  invoices: [],        // invoice ke klien (lunas/belum/tertunda)
  documents: [],       // arsip dokumen klien (file asli + tautan)
  activities: [],      // log aktivitas tim (untuk feed dashboard)
  journalDeletions: [],// log penghapusan jurnal (audit; cap per firma)
  periodLocks: [],     // penguncian periode per buku (bookId+periode)
  assets: [],          // aset tetap per buku (master + jadwal penyusutan komersial & fiskal)
  calk: []             // Catatan atas Laporan Keuangan (narasi/template per buku)
};

let state = null;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  ensureDir();
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      state = Object.assign({}, EMPTY, JSON.parse(raw));
      // pastikan seluruh koleksi ada
      for (const k of Object.keys(EMPTY)) if (state[k] === undefined) state[k] = EMPTY[k];
    } catch (e) {
      console.error('Gagal membaca db.json, membuat cadangan dan memulai baru:', e.message);
      try { fs.renameSync(DB_FILE, DB_FILE + '.corrupt-' + Date.now()); } catch (_) {}
      state = JSON.parse(JSON.stringify(EMPTY));
      state.meta.createdAt = new Date().toISOString();
      save();
    }
  } else {
    state = JSON.parse(JSON.stringify(EMPTY));
    state.meta.createdAt = new Date().toISOString();
    save();
  }
  migrate();
  return state;
}

// Migrasi skema idempoten (dijalankan tiap start).
function migrate() {
  let changed = false;
  // Fase 4 (2026-09-02): peran 'pengawas' dilebur jadi 'staff' (Anggota). Akses kini murni
  // per-klien (PJ/pelaksana), bukan berbasis tim. supervisorId dibiarkan (tak dipakai lagi).
  for (const u of (state.users || [])) if (u.role === 'pengawas') { u.role = 'staff'; changed = true; }
  if (changed) save();
}

let saveTimer = null;
let dirty = false;

function save() {
  ensureDir();
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
  dirty = false;
}

// Simpan segera (dipakai untuk operasi penting agar tidak hilang).
function saveNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  save();
}

function db() {
  if (!state) load();
  return state;
}

// ID unik sederhana
function id() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Nomor urut per perusahaan (mis. nomor jurnal)
function nextNumber(companyId, key) {
  const d = db();
  d.counters[companyId] = d.counters[companyId] || {};
  const cur = d.counters[companyId][key] || 0;
  const nx = cur + 1;
  d.counters[companyId][key] = nx;
  return nx;
}

module.exports = { db, load, save, saveNow, id, nextNumber, DB_FILE, DATA_DIR };
