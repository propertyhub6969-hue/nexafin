'use strict';
/*
 * Menentukan lokasi penyimpanan data yang PASTI bisa ditulis.
 * Beberapa folder (mis. folder yang sedang dikelola/dikunci sistem lain) menolak
 * penulisan (EPERM). Modul ini mencoba beberapa kandidat lokasi secara berurutan
 * dan memakai yang pertama berhasil ditulis.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

function bisaDitulis(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const t = path.join(dir, '.tulis-tes');
    fs.writeFileSync(t, 'ok');
    fs.unlinkSync(t);
    return true;
  } catch (e) {
    return false;
  }
}

function resolveDataDir() {
  const kandidat = [];
  // 1) Bisa dipaksa lewat variabel lingkungan
  if (process.env.WA_DATA_DIR) kandidat.push(process.env.WA_DATA_DIR);
  // 2) Folder "data" di samping aplikasi (ideal: data menyatu dengan aplikasi)
  kandidat.push(path.join(__dirname, '..', 'data'));
  // 3) Folder aplikasi lokal Windows (paling andal untuk ditulis)
  if (process.env.LOCALAPPDATA) kandidat.push(path.join(process.env.LOCALAPPDATA, 'WebAkunting'));
  if (process.env.APPDATA) kandidat.push(path.join(process.env.APPDATA, 'WebAkunting'));
  // 4) Folder home pengguna
  kandidat.push(path.join(os.homedir(), 'WebAkunting-Data'));
  // 5) Folder sementara sistem (upaya terakhir)
  kandidat.push(path.join(os.tmpdir(), 'WebAkunting-Data'));

  for (const c of kandidat) {
    if (bisaDitulis(c)) return c;
  }
  // Bila semua gagal, kembalikan kandidat home (akan memunculkan error yang jelas saat dipakai)
  return path.join(os.homedir(), 'WebAkunting-Data');
}

const DATA_DIR = resolveDataDir();

module.exports = { DATA_DIR };
