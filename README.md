# Web Akunting

Aplikasi web akuntansi & laporan keuangan berbasis **SAK/PSAK Indonesia** (Rupiah),
multi-pengguna, dengan panel admin. **Tanpa dependensi eksternal** — hanya Node.js bawaan.

👉 **Panduan pemakaian lengkap ada di [PANDUAN.md](PANDUAN.md).** Jalankan dengan `node server.js`.

## Menjalankan

```bash
node server.js
# buka http://localhost:3000
```

Ubah port bila perlu: `PORT=8080 node server.js`.

## Arsitektur

- **Backend:** Node.js (`http` bawaan), tanpa framework. Autentikasi memakai `crypto`
  (scrypt untuk hash kata sandi, HMAC untuk token sesi di cookie httpOnly).
- **Penyimpanan:** berkas JSON di `data/db.json` (ditulis atomik). Mudah dimigrasi ke SQL.
- **Frontend:** HTML/CSS/JavaScript murni (tanpa framework), SPA di `public/`.

```
server.js            Server HTTP + routing + API
lib/db.js            Penyimpanan JSON
lib/coa.js           Bagan Akun default (SAK)
lib/auth.js          Hash kata sandi & token sesi
lib/accounting.js    Mesin laporan (neraca saldo, laba rugi, neraca, arus kas, varians)
public/              Tampilan (index.html, app.js, styles.css)
data/                Data pengguna (dibuat otomatis) — backup folder ini
```

## Konsep Akuntansi

- **Double-entry**: setiap jurnal wajib seimbang (total debit = total kredit), divalidasi server.
- **Laba Rugi**: dihitung per periode dari akun nominal (Pendapatan & Beban).
- **Neraca**: saldo kumulatif per tanggal; laba berjalan masuk ke ekuitas sehingga selalu seimbang.
- **Arus Kas**: metode langsung, ditelusuri dari mutasi akun kas/bank; selalu cocok dengan perubahan saldo kas.
- **Varians**: aktual vs anggaran atau vs periode sebelumnya, dengan penanda materialitas.

## Peran Pengguna

- Pengguna **pertama** yang mendaftar → **admin/pemilik**.
- Admin dapat melihat data seluruh pengguna (baca-saja), mengubah peran, dan menghapus pengguna.
- Pengguna biasa hanya mengakses pembukuan miliknya sendiri.

## Lisensi

Hak milik pribadi (private/UNLICENSED). Silakan dikembangkan sesuai kebutuhan.
