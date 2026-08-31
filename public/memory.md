# Nexafin — Memory / Catatan Proyek

Catatan berjalan: keputusan, konvensi, gotcha, dan status. Baca ini sebelum melanjutkan pekerjaan agar tidak mengulang kesalahan yang sudah dipetakan.

Terakhir diperbarui: Agustus 2026 (CALK selesai + sidebar accordion + handoff.md diperbarui menyeluruh). Laporan keuangan lengkap: Neraca, L/R, Perubahan Ekuitas, Arus Kas, CALK.

---

## Identitas & Keputusan Produk

- **Nama:** Nexafin (sebelumnya "Web Akunting" → "Abhista Fin" → **Nexafin**). Wordmark: "Nexa" gelap + "fin" emerald.
- **Tema:** navy `#0f2a47` + emerald `#0fb37f` (aksen), `#0a8a61` (emerald-dark), `#34d99f` (emerald pada latar gelap). Logo **Nexus Hub** (konsep 04).
- **Dua produk dalam satu app:** Akuntansi (SAK) + Manajemen Praktik Konsultan Pajak.
- **Sasaran:** dijual (SaaS/lisensi) untuk konsultan/staf pajak Indonesia.

### Keputusan arsitektur (dan alasannya)
- **Tanpa dependensi eksternal** (Node bawaan) — karena `npm install` diblokir di lingkungan build & harus mudah dijalankan pengguna non-teknis. Konsekuensi: parser XLSX, klien HTTP AI, hash, dsb. ditulis manual.
- **Penyimpanan JSON file** (bukan DBMS) — cepat & tanpa setup; jalur migrasi ke SQLite/Postgres sudah disiapkan.
- **Monolit modular, multitenant pool** (`companyId`) — tepat untuk tahap MVP; microservice belum perlu.
- **Staff = akun login** (peran `staff`) di bawah company firma; konsultan (`admin`) memantau. (Dipilih pengguna, bukan sekadar daftar nama.)
- **AI hybrid** — inti offline gratis; OCR & insight aktif bila kunci Anthropic diisi.
- **Provider AI:** Anthropic (Claude).

---

## Konvensi

- **COA (Indonesia/SAK):** 1=Aset, 2=Liabilitas, 3=Ekuitas, 4=Pendapatan, 5=HPP, 6=Beban Operasional, 8=Beban Lain, 9=Beban Pajak. Akun kunci: 1-1100 Kas, 1-1200 Bank, **1-1250 Kas Dompet Digital (e-wallet)**, 1-1300 Piutang Usaha, 1-1600 PPN Masukan, 2-1100 Utang Usaha, 2-1210 PPN Keluaran, 3-1100 Modal, 3-1200 Prive.
- **Jenis transaksi impor** diturunkan dari akun lawan (`classifier.jenisDari`): kas→Pemindahan Kas, 1-1300→Pelunasan Piutang, Liabilitas→Pelunasan Utang, 3-1200→Prive, 3-1100→Setor Modal, Pendapatan/Beban→sesuai.
- **Jenis SPT:** SPT Tahunan PPh Badan, SPT Masa PPN, SPT Masa PPh 21, PPh 23/26, PPh Final 4(2), Pekerjaan Lain.
- **Status tugas:** belum → proses → review → selesai. **Status invoice:** lunas / belum / tertunda.
- **Tenggat SPT (default, `consult.computeDeadline`):**
  - PPN → akhir bulan berikutnya.
  - PPh Masa → tanggal 20 bulan berikutnya.
  - Tahunan Badan → 30 April tahun berikutnya. Tahunan OP → 31 Maret.
- **Penyesuaian libur (`consult.deadlineNote`):** bila tenggat **Masa** jatuh Sabtu/Minggu/libur → mundur ke hari kerja berikutnya + beri keterangan. **Tahunan DIKECUALIKAN** (keputusan pengguna). Sisa-hari pengingat memakai tanggal efektif.
- **Peran akses:** `admin`/`user` = kelola penuh dalam company-nya; `staff` = tanpa invoice/pendapatan/manajemen staff, tugas terfilter ke `assignedTo` dirinya.

---

## Gotcha (JANGAN terjebak lagi)

- **Windows memblokir tulis berkas ROOT** folder proyek (Controlled Folder Access/ACL). Bukti: EPERM saat `mkdir data`; commit `server.js`/`mulai.bat`/`README`/`package.json` ditolak. **Subfolder `lib/` & `public/` OK.** → Data ke `%LOCALAPPDATA%\WebAkunting`; semua fitur di `lib/`+`public/`; jangan mengandalkan mengubah berkas root otomatis (harus manual via File Explorer).
- **Jangan tambah endpoint dengan mengedit `server.js`** — pakai `routes-ai.js`/`routes-consult.js` (didelegasikan). Root write diblokir.
- **Perubahan `lib/` butuh restart server**; perubahan `public/` cukup hard-refresh (Ctrl+Shift+R).
- **Jurnal impor tidak "hilang"** — dulu tampak hilang karena layar Jurnal memfilter bulan berjalan padahal data bertanggal lampau. Kini default "Semua bulan" + tab Manual/Dari Impor. Ingat: jurnal impor baru ada **setelah klik Posting**.
- **XLSX bank** (mis. BRI) sempat gagal: reader awal tidak menerjemahkan shared strings karena atribut `t="s"` tak tertangkap saat ada atribut `s=".."` di depan. Sudah diperbaiki (parse `r`/`t` per sel terpisah).
- **Deskripsi bank sering kriptik** (BI-Fast, kode QRIS) → banyak jatuh ke default; solusi: aturan tetap + terapkan-massal + belajar dari koreksi.
- **`deadlineNote(jenis, deadline)`** menerima **tanggal deadline** (bukan periode). Jangan salah pakai.
- **Status jurnal**: `undefined` = disetujui (kompat data lama & sisi firma). Jangan filter laporan dengan `status==='disetujui'` (akan buang data lama); pakai `status !== 'draf'` (`acc.isPosted`).
- **HTTP 423** dari endpoint jurnal buku = periode terkunci (tolak tambah/ubah/hapus). Frontend menampilkan "Buat Koreksi", bukan error mentah.
- **Lampiran hanya untuk buku klien** (punya clientId); buku firma (scope=companyId) tidak menyimpan lampiran (dokumen butuh clientId).
- **AI belum bisa diuji end-to-end** di lingkungan build (tanpa kunci + egress terbatas); kode mengikuti spec Anthropic Messages API (image/document block, `anthropic-version: 2023-06-01`).

---

## Status Fitur (checklist)

- [x] Akuntansi inti: COA, jurnal (create/edit+penanda diedit/delete), buku besar, neraca saldo
- [x] Laporan: Laba Rugi, Neraca, Arus Kas (langsung), anggaran, varians, rekonsiliasi, cetak
- [x] Impor CSV/XLSX + klasifikasi belajar + aturan tetap + terapkan-massal
- [x] Jenis transaksi (transfer/e-wallet/pelunasan/prive/modal), pecah + PPN, anomali, anti-dobel, posting otomatis
- [x] OCR nota/PDF + insight (Anthropic) — perlu kunci
- [x] Konsultan: klien, arsip dokumen (file+tautan), pekerjaan/SPT, invoice, dashboard+donut, staff login
- [x] Pengingat tenggat SPT + generator otomatis + penyesuaian hari libur + kelola libur
- [x] Rebrand Nexafin (navy+emerald, logo Nexus Hub)
- [x] Izin akses invoice per-staff (konsultan beri/cabut di Tim/Staff) + penugasan invoice ke staf (`invoices.assignedTo`); staf berizin bisa lihat/ubah, hapus tetap admin. (`users.perms.invoice`, `/api/staff/:id/perms`, meta.canInvoice)
- [x] Tandai SPT "Selesai" WAJIB lampiran Bukti Penerimaan Elektronik (BPE Coretax): file/tautan. Tanpa lampiran ditolak (`butuhBukti`). `tasks.bukti/buktiLink/buktiNomor/buktiTanggal/selesaiAt`; endpoint `POST /api/tasks/:id/selesai`, `GET /api/tasks/:id/bukti/file`; kolom Bukti di Pekerjaan; modal lampiran di Pengingat & Pekerjaan. **Pratinjau bukti di dalam aplikasi** (modalBukti: gambar via <img>, PDF via <iframe>) memakai `?inline=1` (Content-Disposition inline) — tidak pindah tab; tombol Unduh tetap ada.
- [x] Filter Tahun & Bulan di menu Pekerjaan/SPT (berdasarkan `periode`; Tahun→Masa+Tahunan tahun itu, Bulan→hanya Masa bulan tsb). Frontend `State.pekTahun/pekBulan`.
- [x] Model peran bertingkat: **admin/konsultan** (semua), **pengawas** (peran baru: hanya lihat/tugaskan/pantau TIM-nya = staf dgn `supervisorId`=dia; tanpa dashboard finansial), **staff** (hanya tugasnya sendiri). Tugas dilingkupi: `canSeeTask/canEditTask/myScope/teamIds`. Reassign & buat tugas dibatasi peran. Impersonate `?asStaff=` (admin: semua; pengawas: tim) → "Lihat sebagai" di Pekerjaan. Izin `perms.kelolaTugas` (boleh ubah tugas anggota lain). `staff PUT /api/staff/:id` (role/supervisor). Hapus tugas: admin/pengawas-tim/kelolaTugas. Dashboard `C.dashboard(cid, assigneeIds, showPerStaff)`.
- [x] Feed "Aktivitas Tim Terbaru" di Dashboard Konsultan. Koleksi `activities` (cap 400/company); `C.logActivity/activities`; dicatat saat: buat/ubah-status/selesai tugas, buat/ubah-status invoice, tambah klien, unggah dokumen. Dashboard mengembalikan `aktivitas` (staf tanpa izin invoice tak lihat kind invoice).
- [x] **Pembatasan visibilitas Klien & Dokumen per peran/tim** (sama seperti Tugas). Helper `visibleClientIds()` = himpunan klien yang boleh dilihat = klien yang `assignedTo` ∈ `myScope()` ATAU punya tugas yang `assignedTo` ∈ scope; `canSeeClient(id)`. **Klien:** GET difilter; POST staff→403, pengawas `assignedTo` di-clamp ke tim/dirinya; PUT (ubah) hanya admin atau pengawas-yg-bisa-lihat; DELETE tetap admin saja. **Dokumen:** GET difilter `visibleClientIds`; POST & DELETE & unduh file dijaga `canSeeClient(doc.clientId)` (403 bila di luar scope); unduh dokumen dukung `?inline=1`. **Frontend:** `viewKlien` sembunyikan "+ Tambah Klien" & "Ubah" utk staff; "Hapus" hanya admin. Arsip otomatis terlingkup krn dropdown klien & daftar dokumen sudah difilter server. Diuji: staff lihat hanya klien+dokumen tugasnya; pengawas hanya tim-nya; admin semua.
- [x] **Buku akuntansi per-klien (multi-book).** Setiap klien punya buku sendiri (COA, jurnal, laporan, anggaran, rekonsiliasi, impor) yang terpisah. Sebuah "buku" = scopeId: `companyId` firma = buku firma; `clientId` = buku klien (baris disimpan dgn `companyId=clientId` → mesin `accounting.js` langsung jalan tanpa perubahan). **Pemilih buku** (dropdown 📒 di topbar) muncul di semua view akuntansi (`BOOK_VIEWS`); `State.bookId`, helper `curBook()/burl()`; semua fetch akuntansi lewat `/api/books/:bookId/...`. Backend: `lib/books.js` (resolve+otorisasi+seed COA+migrasi, memakai `visibleClientIds` yg sama dgn tugas/dokumen → staff hanya buku klien tugasnya, pengawas timnya, admin semua + buku firma) & `lib/routes-books.js` (accounts/journals/reports/budgets/bank-recs/seed/migrate/list) didelegasikan dari routes-ai. Buku klien **auto-seed COA default** saat pertama diakses. **Impor bank per-buku**: endpoint impor/aturan/klasifikasi/insight kini menerima `bookId` (body/query) via `bookScope()`; batch impor menyimpan `companyId=scope` & operasi lanjutannya (row/bulk/post) memakai `batch.companyId`. **Migrasi data lama**: kartu di Bagan Akun (admin, saat buku firma berisi data) → `POST /api/books/migrate {targetClientId}` memindahkan seluruh akun/jurnal/anggaran/rekonsiliasi/impor/aturan/counter/classifier firma ke satu klien (tujuan harus kosong). Diuji end-to-end (isolasi antar-buku, akses peran, migrasi, impor per-buku). Catatan: endpoint akuntansi lama di `server.js` (`/api/accounts|journals|reports|...`) tetap ada (buku firma via `targetCompany`), tapi frontend tak lagi memakainya.
- [x] **Kolaborasi jurnal (staf perusahaan klien input langsung, dipantau konsultan).** Peran baru **`klien-staff`** (`user.clientId`, terikat 1 klien; `visibleClientIds`=Set([clientId]); menu hanya pembukuan buku kliennya, tanpa modul konsultan/firma; guard di routes-consult hanya izinkan meta + buka file lampiran). Dibuat via `/api/staff` (role=klien-staff + clientId). **Status jurnal `draf`→`disetujui`** (undefined=disetujui, backward-compat): `accounting.js` `postedJournalsOf/isPosted` → hanya disetujui masuk `accumulate`/`ledger` (semua laporan). Jurnal klien-staff & impornya = draf; sisi firma auto-disetujui. **Approve/Reject/Komentar** per jurnal (`/api/books/:b/journals/:id/approve|reject|comment`); reject=tetap draf + komentar `kind:'tolak'` (staf perbaiki→tetap draf, ajukan ulang). **Kotak Masuk** `/api/books/inbox` (draf per klien, sisi firma; menu "Kotak Masuk Jurnal"). **Log `journalDeletions`** (cap 5000/firma; siapa/kapan/isi jurnal+nama file terhapus; Pasal 28 UU KUP; `/api/books/:b/deletions`). **Periode terkunci** koleksi `periodLocks` per buku+periode (`isLocked/lockPeriode/unlockPeriode`); admin/pengawas kunci (butuh scope buku via resolve), buka wajib catatan; tulis/ubah/hapus jurnal bertanggal di periode terkunci ditolak **HTTP 423**; tombol hapus→"Buat Koreksi". **Lampiran jurnal** `journal.attachments=[docId]`→`documents` (`sumber:'jurnal'|'arsip'`, hanya buku klien); aturan hapus: hitung rujukan jurnal lain, 0 & `sumber:'jurnal'`→hapus fisik (nama dicatat di log), `sumber:'arsip'`→lepas rujukan saja; batas 8MB/file + kompresi gambar canvas di klien (`fileToAttachment`); penanda 📎 + filter "tanpa lampiran"; pratinjau `?inline=1`. **Drill-down** (UI): Neraca Saldo baris akun→`modalDrill`→ledger jurnal disetujui→📎 lampiran. Semua logika di `lib/` (`books.js`, `routes-books.js`, `accounting.js`), `public/app.js` hanya tampilan. Diuji end-to-end (collab.js: 25 cek lulus).
- [ ] Migrasi SQLite/Postgres
- [ ] HTTPS + hosting + PM2
- [ ] Pengingat email/WhatsApp (saat app tertutup)
- [ ] Cetak invoice/SPT PDF, rekap per klien
- [ ] Impor kalender libur nasional per tahun
- **Menuju CALK — keputusan pengguna:** tempuh **rantai prasyarat berurutan**; format ekspor = **Cetak/PDF via browser** (pola `cetak()` yang sudah ada, tanpa dependensi baru).
  - [x] (1) **`jenisUsaha` terstruktur**: konstanta `C.JENIS_USAHA` (11 kategori) di consult.js, diekspos di `/api/consult/meta` (`meta.jenisUsaha`). Form Klien (`modalKlien`) kini `<select>` via `jenisUsahaOpts(sel)` — nilai teks lama dipertahankan sbagai opsi "(lama)". Dipakai nanti untuk memicu template CALK per jenis usaha.
  - [x] (2) **Laporan Perubahan Ekuitas**: `acc.equityStatement(companyId,from,to)` → `{ekuitasAwal, labaBersih, setoran, prive, ekuitasAkhir, akun[], labaDitahan{awal,tambah,akhir}, seimbang}`. Saldo laba (laba ditahan) = akumulasi `incomeStatement(null, prevDay(from)).labaBersih` + laba periode; akun ekuitas dari mutasi `contrib` (setoran=perubahan positif, prive=negatif). Konsisten dgn `balanceSheet.totalEkuitas` (diuji). Endpoint `/api/books/:b/reports/equity`; menu **Perubahan Ekuitas** (view `viewPerubahanEkuitas`, ada Cetak). Ditambah ke BOOK_VIEWS & menu klien-staff.
  - [x] (3) **Aset tetap** (`lib/assets.js`, koleksi `assets` per buku): master {nama, tanggalPerolehan, harga, nilaiResidu, metode(komersial: garis-lurus/saldo-menurun), masaManfaat(th), kelompokFiskal, metodeFiskal, akunAset/akunAkumulasi/akunBeban, penyusutanPosted[]}. **Penyusutan komersial** dihitung bulanan (jadwal deterministik; bulan terakhir menyerap pembulatan) & **diposting jurnal otomatis** (Dr akunBeban, Cr akunAkumulasi) via `POST /assets/depreciate {sampai:'YYYY-MM'}` — idempoten (`penyusutanPosted`), skip periode terkunci, status disetujui, tag `dariPenyusutan`. **Penyusutan fiskal** Pasal 11 (`FISKAL`: I=4th,II=8th,III=16th,IV=20th tarif GL=1/masa & SM=2/masa; bangunan permanen 20th / non-permanen 10th hanya GL; non-penyusutan/tanah=0; residu fiskal=0) dihitung berdampingan, **tidak diposting**. **Koreksi fiskal** = komersial − fiskal (`/assets/koreksi-fiskal?tahun=`, per aset + total, bisa dicetak). Endpoint: `/assets/meta` (akun & kelompok), `/assets` GET/POST, `/assets/:id` PUT/DELETE, `/assets/:id/schedule` (tahunan kom vs fis), `/assets/depreciate`, `/assets/koreksi-fiskal`. Frontend: menu **Aset Tetap** (`viewAsetTetap`, `modalAset`, `modalJadwalAset`, `modalKoreksiFiskal`, `jalankanPenyusutan`); tambah/ubah aset khusus sisi firma. Diuji end-to-end (assets.js: 13 cek — math GL/SM, idempoten, tercermin di L/R & neraca, koreksi fiskal, skip terkunci). Aset tanah/non-penyusutan: pilih kelompok "Tidak Disusutkan". Catatan: jurnal perolehan aset TIDAK diposting otomatis (asumsi sudah lewat impor/jurnal biasa); master aset = subledger untuk penyusutan & rincian CALK. Pelepasan/disposal aset belum ada (menyusul bila perlu).
  - [x] (4) **CALK** (`lib/calk.js`, koleksi `calk` per buku): narasi (infoUmum, penyusunan, kebijakan[], pihakBerelasi, perpajakan, peristiwaSetelah) = template dpt disunting, dipakai ulang tiap tahun; variabel `{nama}`, `{tahun}`, `{koreksiFiskal}`. Template awal beda per **jenisUsaha** (`defaultCALK`: Dagang/Manufaktur→Persediaan, Jasa→pengakuan pendapatan jasa, Konstruksi→persentase penyelesaian). **Angka otomatis** (`buildAuto`) per tahun: rincian pos neraca (`balanceSheet.groups`), tabel aset tetap (harga/akum/nilai buku dari modul aset), koreksi fiskal penyusutan, ringkasan. Endpoint `GET /calk?tahun=&bawaan=` (bawaan=1 → template default abaikan simpanan) & `POST /calk` (sunting; sisi firma saja). Frontend menu **CALK (Catatan)** di grup Laporan Keuangan: editor narasi + kebijakan (tambah/hapus) + pratinjau angka otomatis + **Cetak CALK** (`cetakCALK` → window.print, isi variabel terisi, 8 bagian bernomor). Diuji (calk.js: 12 cek). Format ekspor = Cetak/PDF via browser (keputusan pengguna).
- **Drill-down Neraca Saldo**: klik baris akun → `modalDrill` menampilkan jurnal disetujui pembentuk saldo + 📎 lampiran. Neraca Saldo kumulatif → drill dipanggil `from=''` (sejak awal) s/d `to` agar cocok dgn total.
- **Menu**: Aset Tetap ada di grup **Utama** (buku pembantu), bukan Analisis. Sidebar = **accordion**: menu disusun jadi seksi per grup (`grp-btn` + `.nav-body`), tiap grup buka/tutup (State.navOpen); grup berisi menu aktif otomatis terbuka; di layar sempit (≤~640px) grup disembunyikan & item selalu tampil (ikon).

---

## Lingkungan

- OS pengguna: Windows (drive D:), folder proyek: `D:\Claude Akunting\web akunting`.
- Node portabel ada di folder (`node.exe`), plus Node sistem terpasang.
- Data & file terunggah: `%LOCALAPPDATA%\WebAkunting\` (db.json, .secret, files/).
- Akun admin = pengguna pertama yang mendaftar.
