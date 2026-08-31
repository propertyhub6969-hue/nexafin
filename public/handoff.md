# Nexafin — Handoff Teknis

Dokumen serah-terima untuk siapa pun yang melanjutkan pengembangan **Nexafin** (dulu "Web Akunting"/"Abhista Fin"): aplikasi web **akuntansi (SAK/PSAK) + manajemen praktik konsultan pajak** dengan otomasi AI, kolaborasi jurnal klien↔konsultan, buku per-klien, aset tetap, dan laporan keuangan lengkap termasuk CALK.

Terakhir diperbarui: Agustus 2026 · Status: **berfungsi penuh** (akuntansi lengkap + konsultan + kolaborasi).
Baca juga `memory.md` (catatan keputusan, konvensi, gotcha, checklist status yang selalu paling mutakhir).

---

## 1. Ringkasan

Node.js **murni tanpa dependensi eksternal** (tanpa `npm install`), penyimpanan **berkas JSON** (muat ke memori, tulis atomik). Pola **monolit modular, multitenant pool** (`companyId`).

Tiga lapis produk dalam satu aplikasi:
1. **Akuntansi** — double-entry, laporan keuangan SAK lengkap (Laba Rugi, Neraca, **Perubahan Ekuitas**, Arus Kas, **CALK**), impor rekening koran + AI, **aset tetap + penyusutan**.
2. **Konsultan Pajak** — klien, arsip dokumen, pekerjaan/SPT, invoice, dashboard, pengingat tenggat SPT.
3. **Kolaborasi** — buku akuntansi **per klien** (multi-book); staf perusahaan klien input jurnal (draf) dari sisi mereka, konsultan menyetujui; kunci periode; lampiran & komentar per jurnal; log audit.

---

## 2. Menjalankan

Prasyarat: **Node.js** (≥18; ada `node.exe` portabel di folder).
```
dobel-klik mulai.bat        (atau: node server.js)   → http://localhost:3000
```
- Pengguna **pertama** yang mendaftar = **admin/pemilik firma**.
- Ubah port: `PORT=8080 node server.js`. Data: `WA_DATA_DIR=...` (default `%LOCALAPPDATA%\WebAkunting\`, berisi `db.json`, `.secret`, `files/<companyId>/`). Backup = salin folder ini.
- Setelah ubah `lib/` → **restart** server. Setelah ubah `public/` → cukup **Ctrl+Shift+R**.

---

## 3. Struktur Proyek

```
web akunting/
  server.js            HTTP server + router + static + API INTI (auth/accounts/journals/reports/
                       budgets/bankRecs/admin). Memuat lib/routes-ai (try/catch). ROOT = TERKUNCI tulis (lihat §8).
  lib/
    paths.js           Resolver folder data writable (%LOCALAPPDATA%; honor WA_DATA_DIR)
    db.js              Store JSON + koleksi (EMPTY) + id() + nextNumber()
    coa.js             Bagan Akun default SAK (aset tetap, akum. penyusutan, beban penyusutan 6-1800, dll)
    auth.js            scrypt + token sesi HMAC (cookie httpOnly)
    accounting.js      Mesin laporan: trialBalance, ledger, incomeStatement, balanceSheet,
                       cashFlow, equityStatement, variance. HANYA jurnal status!=='draf' masuk laporan (isPosted).
    importer.js        Parser CSV + pembaca XLSX (ZIP+zlib+XML) tanpa dependensi
    classifier.js      Naive-Bayes (belajar) + aturan kata kunci + aturan tetap + anomali + jenisDari
    ai.js              Klien Anthropic via https bawaan (OCR + insight)
    routes-ai.js       Endpoint impor/AI/rules/edit-jurnal lama. Delegasi ke routes-consult & routes-books.
                       bookScope(user,query,body) → scope buku efektif utk impor per-klien.
    consult.js         Helper konsultan + konstanta (JENIS_SPT, KATEGORI_DOKUMEN, JENIS_USAHA),
                       saveFile/deleteFile, dashboard, tenggat SPT, hari libur, pengingat, activities
    routes-consult.js  clients/tasks/invoices/documents/staff/consult. RBAC (admin/pengawas/staff/klien-staff).
    books.js           MULTI-BOOK: resolve(user,bookId)+otorisasi, listBooks, seedCOA, migrateFirmaToClient,
                       visibleClientIds (peran/tim), kunci periode (isLocked/lockPeriode/unlockPeriode),
                       log penghapusan jurnal (logJournalDeletion/deletionsFor)
    routes-books.js    /api/books/... : accounts, journals (+approve/reject/comment), reports (termasuk equity),
                       budgets, bank-recs, locks, deletions, ASSETS, CALK, seed, migrate, inbox
    assets.js          Aset tetap: jadwal penyusutan komersial & fiskal (Pasal 11), koreksi fiskal, dueMonths
    calk.js            CALK: template default per jenisUsaha, buildAuto (rincian pos + aset + koreksi), simpan
  public/
    index.html         Shell SPA + favicon (logo Nexus Hub)
    app.js             SELURUH frontend (vanilla JS): views, modal, donut, accordion sidebar
    styles.css         Tema Nexafin (navy #0f2a47 + emerald #0fb37f)
  memory.md, handoff.md, README.md, PANDUAN.md   (dok; di device disalin ke public/ karena root terkunci)
```

### Pola penting: JANGAN sentuh `server.js`
`server.js` → `routes-ai.handle()` → mendelegasikan ke `routes-consult` lalu `routes-books`. **Fitur baru cukup di `lib/`+`public/`.** Alur:
```
server.js  → API inti (accounts/journals/reports/... buku FIRMA saja via targetCompany)? tangani.
           → else routes-ai.handle():
                → routesConsult.owns(/api/(clients|tasks|invoices|documents|staff|consult))? → tangani
                → routesBooks.owns(/api/books...)? → tangani  ← SEMUA akuntansi per-klien di sini
                → else guard /api/(ai|import|classify|settings|rules|journals)
           → else 404
```
Catatan: endpoint akuntansi lama di `server.js` masih ada (buku firma), tapi **frontend memakai `/api/books/:bookId/...`** untuk semua akuntansi. `:bookId` = `companyId` firma (buku firma) atau `clientId` (buku klien).

---

## 4. Konsep MULTI-BOOK (kunci arsitektur akuntansi)

Sebuah **"buku"** = scope akuntansi yang diidentifikasi satu id:
- **Buku firma**: `companyId` firma (buku internal firma; hanya admin).
- **Buku klien**: `clientId`. Baris akuntansi (accounts/journals/budgets/bankRecs/assets) disimpan dengan **`companyId = clientId`** → mesin `accounting.js` langsung bekerja dengan id apa pun tanpa perubahan.

`books.resolve(user, bookId)` mengembalikan `{ok, scopeId, isFirma, book}` + otorisasi (peran/tim via `visibleClientIds`). Buku klien di-**seed COA default** otomatis saat pertama diakses. `migrateFirmaToClient` memindahkan data lama buku firma → salah satu klien (sekali jalan).

Frontend: `State.bookId`, helper `curBook()`, `burl(sub,params)` → `/api/books/<bookId><sub>?query`; pemilih buku 📒 di topbar (muncul bila >1 buku).

---

## 5. Peran & Hak Akses (RBAC)

| Peran | Lingkup |
|---|---|
| `admin`/`user` | Konsultan/pemilik. Semua buku (firma + semua klien), semua modul. |
| `pengawas` | Hanya **tim**-nya (staf dgn `supervisorId`=dia) + klien tim. Bisa kunci/buka periode. Tanpa dashboard finansial firma. |
| `staff` | Hanya tugas & klien yang **ditugaskan** padanya. |
| `klien-staff` | Staf perusahaan **klien**, terikat 1 `clientId`. Hanya buku klien itu; menu pembukuan saja; jurnalnya **draf** sampai disetujui firma. Tanpa modul konsultan. |

Helper: `visibleClientIds(user)` (himpunan klien terlihat; klien-staff = {clientId}-nya), `canSeeClient`, `isFirmSide` (bukan klien-staff). RBAC dijaga di `routes-consult.js` (klien & dokumen difilter) dan `books.js/routes-books.js` (buku & jurnal).

---

## 6. Alur Kolaborasi Jurnal (draf → disetujui)

- **Status jurnal**: `draf` | `disetujui`. `undefined` dianggap disetujui (kompat data lama). **Hanya `!=='draf'` masuk laporan** (`accounting.isPosted`).
- Jurnal dibuat **klien-staff** (atau impornya) → `draf`; sisi firma → `disetujui`.
- `POST /api/books/:b/journals/:id/approve` (firma), `/reject` (firma; tetap draf + komentar `kind:'tolak'`), `/comment` (dua arah).
- **Kotak Masuk** `GET /api/books/inbox`: draf menunggu, dikelompokkan per klien (menu "Kotak Masuk Jurnal").
- **Lampiran** `journal.attachments=[docId]` → koleksi `documents` (`sumber:'jurnal'|'arsip'`, hanya buku klien). Hapus jurnal: file `sumber:'jurnal'` tanpa rujukan lain → hapus fisik (nama dicatat di log); `sumber:'arsip'` → lepas rujukan saja. Kompresi gambar di klien (`fileToAttachment`), maks 8MB, pratinjau `?inline=1`.
- **Log penghapusan** koleksi `journalDeletions` (cap 5000/firma; Pasal 28 UU KUP): siapa/kapan/isi jurnal + nama file. `GET /api/books/:b/deletions`.
- **Kunci periode** koleksi `periodLocks` (bookId+periode). Admin/pengawas kunci (butuh scope buku), buka wajib catatan. Tulis/ubah/hapus jurnal bertanggal di periode terkunci → **HTTP 423**; tombol hapus jadi "Buat Koreksi".

---

## 7. Model Data (`db.json`)

Ber-tenant lewat `companyId` (kecuali `users`, `companies`, `settings`). Untuk koleksi akuntansi, `companyId` = **scope buku** (firma id atau clientId).

`users`(+`supervisorId`,`clientId`,`perms{invoice,kelolaTugas}`), `companies`, `accounts`, `journals`(+`status`,`comments[]`,`attachments[]`,`createdBy`,`approvedBy`,`editCount`,`dariImpor`,`dariPenyusutan`), `budgets`, `bankRecs`, `counters`, `settings`, `imports`, `classifiers`, `rules`, `clients`(+`jenisUsaha` terstruktur, `assignedTo`), `tasks`, `invoices`, `documents`(+`sumber`), `activities`, `journalDeletions`, `periodLocks`, `assets`, `calk`.

**assets**: `{companyId(bookId), nama, tanggalPerolehan, harga, nilaiResidu, metode(garis-lurus|saldo-menurun), masaManfaat, kelompokFiskal(I..IV|bangunan-*|non-penyusutan), metodeFiskal, akunAset/akunAkumulasi/akunBeban, aktif, penyusutanPosted[]}`.
**calk**: `{companyId(bookId), infoUmum, penyusunan, kebijakan[], pihakBerelasi, perpajakan, peristiwaSetelah}` (template narasi; angka dihasilkan otomatis saat render).

---

## 8. Kendala & Gotcha (JANGAN terjebak)

- **Windows Controlled Folder Access/ACL** memblokir tulis berkas **root** proyek (server.js, mulai.bat, README, package.json). Subfolder `lib/` & `public/` **bisa**. → data ke `%LOCALAPPDATA%`; semua kode di `lib/`+`public/`; dok `memory.md`/`handoff.md` di device disalin ke `public/`; ubah berkas root = manual via File Explorer.
- **Status jurnal**: jangan filter laporan `=== 'disetujui'` (buang data lama) — pakai `!== 'draf'` (`acc.isPosted`).
- **HTTP 423** = periode terkunci (frontend tampilkan "Buat Koreksi").
- **Lampiran hanya buku klien** (butuh clientId); buku firma tidak menyimpan lampiran.
- **Aset**: jurnal *perolehan* TIDAK diposting otomatis (asumsi lewat impor/jurnal biasa) — master aset = subledger untuk penyusutan. Penyusutan **komersial** diposting (idempoten via `penyusutanPosted`, skip periode terkunci); **fiskal** hanya untuk koreksi. Pelepasan/disposal aset belum ada.
- **CALK**: angka otomatis (`buildAuto`) real-time dari buku; narasi = template tersimpan; `?bawaan=1` kembalikan default per jenisUsaha.
- **XLSX reader**: parse ZIP+sharedStrings+sheet manual; sudah menangani urutan atribut sel (`t="s"`); teruji mutasi BRI 2.300+ baris.
- **AI (Anthropic)** via https bawaan; butuh kunci (Setelan AI) + internet; tanpa kunci fitur AI mati dengan pesan, sisanya jalan.
- **Tenggat SPT**: penyesuaian akhir pekan/libur hanya SPT **Masa** (Tahunan dikecualikan). Libur tanggal-tetap otomatis; sisanya dikelola pengguna.

---

## 9. Cara Menambah Fitur (resep)

1. Koleksi di `db.js` (`EMPTY`). 2. Logika di modul `lib/` baru (mis. `assets.js`, `calk.js`). 3. Endpoint di `routes-books.js` (akuntansi per-buku) atau `routes-consult.js` (konsultan) — jangan sentuh `server.js`; bila prefix baru, daftarkan di `owns()`/delegasi `routes-ai`. 4. UI di `public/app.js`: tambah ke `MENU` (+`BOOK_VIEWS` bila terikat buku), map router, tulis `viewX`. 5. Uji: `WA_DATA_DIR=/tmp/x PORT=39xx node server.js` + skrip http. 6. Kirim `lib/`+`public/` (writable).

---

## 10. Backlog (urutan disarankan)

> **Peta jalan migrasi ke cloud tersedia di `migrasi.md`** — memetakan backlog infrastruktur di bawah (hosting, backup, keamanan, SQLite/Postgres) ke fase eksekusi di VPS nexafin.id.

- **Persediaan** (klien dagang/manufaktur) — kartu stok, HPP.
- **Pelepasan/penjualan aset tetap** (laba/rugi pelepasan, hentikan penyusutan).
- Migrasi penyimpanan JSON → **SQLite** → **PostgreSQL** saat tenant banyak.
- **HTTPS + hosting** (VPS + PM2); pengingat **email/WhatsApp**; cetak invoice/SPT PDF.
- Impor kalender libur nasional per tahun; keamanan produksi (rate limit, lupa sandi, audit, backup otomatis).

---

## 11. Identitas Visual

- Nama **Nexafin** (wordmark "Nexa" gelap + "fin" emerald). Warna: navy `#0f2a47`, emerald `#0fb37f`/`#0a8a61`/`#34d99f`. Logo **Nexus Hub**. Sidebar **accordion** (grup buka/tutup; grup berisi menu aktif otomatis terbuka).
