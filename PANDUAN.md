# 📘 Panduan Web Akunting

Aplikasi web **Laporan Keuangan (SAK/PSAK Indonesia)** dengan fitur multi-pengguna,
login, dan panel admin. Dibuat tanpa dependensi eksternal — **cukup pasang Node.js,
lalu jalankan.** Tidak perlu `npm install`.

---

## 🧩 Apa saja fiturnya?

- **Login & multi-pengguna** — setiap pengguna punya pembukuan sendiri.
- **Panel Admin** — Anda (pemilik) bisa melihat data seluruh pengguna (mode baca-saja).
- **Bagan Akun (COA)** standar Indonesia, bisa ditambah/diubah.
- **Jurnal Umum** — input debit/kredit dengan validasi otomatis harus seimbang.
- **Buku Besar & Neraca Saldo** — otomatis dari jurnal.
- **Laporan Keuangan**: Laba Rugi, Neraca (Posisi Keuangan), Arus Kas — format SAK, Rupiah, bisa dicetak.
- **Anggaran & Analisis Varians** — bandingkan aktual vs anggaran / periode sebelumnya.
- **Rekonsiliasi Bank** — cocokkan saldo buku besar dengan rekening koran.

---

## 🖥️ Langkah 1 — Pasang Node.js (sekali saja)

1. Buka **https://nodejs.org**
2. Unduh versi **LTS** (tombol besar sebelah kiri).
3. Jalankan file yang terunduh, klik **Next → Next → Install** seperti memasang aplikasi biasa.
4. Selesai. (Node.js adalah "mesin" yang menjalankan aplikasi ini.)

> Cara memastikan sudah terpasang: buka **Command Prompt** (lihat Langkah 2),
> ketik `node --version` lalu Enter. Jika muncul angka seperti `v20.x.x`, berarti berhasil.

---

## ▶️ Langkah 2 — Menjalankan Aplikasi

1. Buka folder **web akunting** ini di File Explorer.
2. Klik pada kolom alamat di atas (yang menampilkan lokasi folder), ketik `cmd`, lalu tekan **Enter**.
   Akan terbuka jendela hitam **Command Prompt** yang sudah berada di folder ini.
3. Ketik perintah berikut lalu tekan **Enter**:

   ```
   node server.js
   ```

4. Jika muncul tulisan:

   ```
   Web Akunting berjalan di:  http://localhost:3000
   ```

   berarti aplikasi sudah menyala. **Biarkan jendela hitam ini tetap terbuka** selama aplikasi dipakai.

5. Buka browser (Chrome/Edge), ketik alamat berikut lalu Enter:

   ```
   http://localhost:3000
   ```

6. Untuk **menghentikan** aplikasi: kembali ke jendela hitam, tekan **Ctrl + C**.

> **Tips:** Anda bisa membuat file `mulai.bat` berisi satu baris `node server.js`
> agar cukup dobel-klik untuk menjalankan. (Opsional.)

---

## 👤 Langkah 3 — Pemakaian Pertama

1. Di halaman awal, klik tab **Daftar Baru**.
2. Isi nama, nama perusahaan, email, dan kata sandi.
3. **Akun pertama yang mendaftar otomatis menjadi Admin/Pemilik** — inilah akun Anda.
4. Setelah masuk, Bagan Akun standar Indonesia sudah otomatis tersedia. Anda bisa langsung membuat **Jurnal Baru**.
5. Pengguna lain yang mendaftar berikutnya menjadi **Pengguna biasa** dengan pembukuan sendiri.
6. Sebagai Admin, buka menu **Kelola Pengguna → Lihat Data** untuk memeriksa pembukuan pengguna lain.

---

## 💾 Tentang Data & Cadangan

- Semua data tersimpan di dalam folder **`data/`** (file `db.json`) yang otomatis dibuat saat pertama dijalankan.
- **Untuk backup:** cukup salin folder `data/` ke tempat aman secara berkala.
- **Untuk memindahkan** ke komputer lain: salin seluruh folder aplikasi (termasuk `data/`).
- Jangan hapus file `data/.secret` — dipakai untuk mengamankan sesi login.

---

## 🌐 Langkah Lanjutan — Agar Bisa Diakses Orang Lain / Dijual

Saat ini aplikasi berjalan di komputer Anda sendiri (`localhost`). Agar bisa diakses
pengguna lain dari internet (dan dijual sebagai layanan), aplikasi perlu **di-hosting**
di sebuah server. Garis besarnya:

1. Sewa **VPS** (mis. Niagahoster, IDCloudHost, DigitalOcean, dll).
2. Pasang Node.js di server tersebut, unggah folder aplikasi ini.
3. Jalankan dengan pengelola proses seperti **PM2** agar tetap menyala 24 jam.
4. Arahkan **nama domain** (mis. `akuntingku.com`) ke server, pasang **HTTPS**.

Untuk skala jual serius, disarankan pengembangan lanjutan (lihat README).
Beri tahu saya jika ingin dibantu menyiapkan tahap hosting ini.

---

## ⚠️ Catatan Penting (sebelum dijual ke publik)

Versi ini sudah **lengkap dan berfungsi penuh** untuk pemakaian & demo. Sebelum dijual
ke banyak pelanggan berbayar, ada baiknya menambahkan: HTTPS, kebijakan kata sandi lebih
kuat, fitur lupa kata sandi, ekspor Excel/PDF, penutupan buku akhir tahun, dan pencadangan
otomatis. Semua ini bisa dikembangkan bertahap.

---

Selamat menggunakan! 🎉
