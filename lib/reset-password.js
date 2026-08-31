'use strict';
/*
 * Reset kata sandi dari CLI (untuk operator server; fitur "lupa sandi" via email belum ada).
 * Pakai:   node lib/reset-password.js <email> <sandi-baru>
 * Docker:  docker exec nexafin_app node lib/reset-password.js user@x.com SandiBaru123
 * PENTING: aplikasi memegang db di memori — setelah reset, RESTART container
 * (docker restart nexafin_app) agar perubahan terbaca & tidak tertimpa save berikutnya.
 * Paling aman: jalankan saat tidak ada yang sedang input data.
 */
const store = require('./db');
const auth = require('./auth');

const [, , email, newPass] = process.argv;
if (!email || !newPass || String(newPass).length < 6) {
  console.log('Pakai: node lib/reset-password.js <email> <sandi-baru minimal 6 karakter>');
  process.exit(1);
}
const d = store.db();
const u = (d.users || []).find(x => x.email === String(email).trim().toLowerCase());
if (!u) {
  console.log('Tidak ditemukan user dengan email:', email);
  console.log('User terdaftar:', (d.users || []).map(x => x.email).join(', ') || '(kosong)');
  process.exit(1);
}
const { salt, hash } = auth.hashPassword(newPass);
u.salt = salt;
u.passwordHash = hash;
store.saveNow();
console.log(`Sandi untuk ${u.email} (${u.name || '-'}) berhasil di-reset.`);
