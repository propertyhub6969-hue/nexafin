# Nexafin — Peta Jalan Migrasi ke Cloud

Dari aplikasi lokal Windows (JSON, zero-dependency) → produksi di VPS **nexafin.id** → selaras blueprint arsitektur target (PostgreSQL, modular → microservice). Disusun 2026-08-31.

**Konteks:** VPS 72.62.71.1 sudah melayani https://nexafin.id (landing, repo `nexafin-landing`) di belakang **satu Caddy bersama** (network Docker `edge`, Caddyfile `/opt/edge/Caddyfile`, TLS otomatis). Aplikasi ini (repo `nexafin`) akan naik ke **`app.nexafin.id`** dengan pola yang sama. Blueprint target: `nexafin-landing/docs/blueprint.html`.

**Prinsip:** jangan menulis ulang yang sudah berfungsi. Migrasi = memindahkan *tempat berjalan* dan *tempat menyimpan*, bertahap, dengan verifikasi paritas di tiap langkah. Aplikasi sudah siap dipindah karena dua keputusan lama yang tepat: `PORT` dan `WA_DATA_DIR` dikendalikan lewat env, dan seluruh logika ada di `lib/` + `public/`.

---

## Fase 0 — Persiapan (½ hari)

1. **Backup data Windows:** salin seluruh `%LOCALAPPDATA%\WebAkunting\` (berisi `db.json`, `.secret`, `files/`) ke tempat aman. Ini snapshot pra-migrasi.
2. **Kebersihan repo:** `node_modules/`, `corepack*`, `npm*`, `npx*`, `nodevars.bat` adalah artefak Node portabel Windows — bukan kode sumber. Tambahkan ke `.gitignore` dan keluarkan dari repo (simpan tooling portabel dalam zip di luar git bila masih perlu). Di VPS/kontainer tidak dibutuhkan sama sekali.
3. **Dockerfile** (di root repo; ditulis dari sisi VPS karena root Windows terkunci):

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY server.js ./
COPY lib ./lib
COPY public ./public
ENV PORT=3000 WA_DATA_DIR=/data TZ=Asia/Jakarta
VOLUME /data
EXPOSE 3000
CMD ["node", "server.js"]
```

Catatan: **`TZ=Asia/Jakarta` wajib** — tenggat SPT & tanggal jurnal dihitung dengan waktu lokal; server Linux default UTC dan itu menggeser tanggal.

---

## Fase 1 — Lift & Shift ke `app.nexafin.id` (1–2 hari)

Aplikasi jalan apa adanya (JSON store, zero-dep) — hanya pindah rumah.

1. **Container:** build image dari Dockerfile di atas; jalankan sebagai `nexafin_app` di network `edge`, dengan **named volume** `nexafin_app_data → /data`.
2. **Caddy:** tambah blok berikut ke `/opt/edge/Caddyfile` (backup dulu), lalu `caddy validate` + `caddy reload` (graceful — jangan restart container caddy):
   ```
   app.nexafin.id {
       reverse_proxy nexafin_app:3000
   }
   ```
3. **DNS:** A record `app` → 72.62.71.1. TLS terbit otomatis (Let's Encrypt).
4. **Impor data** — pilih salah satu:
   - **Mulai segar:** daftar user pertama di app.nexafin.id (jadi admin), input ulang. Cocok bila data Windows masih uji coba.
   - **Bawa data:** upload `db.json` + `.secret` + `files/` (WinSCP/scp ke VPS) → masukkan ke volume `/data`. `.secret` **harus ikut** (HMAC token sesi); `files/` berisi lampiran dokumen/jurnal.
5. **Uji end-to-end:** login admin → laporan (Neraca/L-R/CALK) → impor XLSX → alur klien-staff draf→approve → lampiran (pratinjau `?inline=1`) → kunci periode (423).
6. **Backup otomatis:** cron harian `tar` volume `/data` (retensi ±14 hari) — langsung menutup item backlog "backup otomatis".

**Aturan setelah go-live:** **produksi = VPS** (satu sumber kebenaran). Windows jadi lingkungan dev/uji dengan data salinan — jangan dua-duanya dipakai input riil, JSON store tidak bisa di-merge.

**Hasil fase ini** (nilai terbesar per usaha): HTTPS ✓, akses multi-perangkat ✓, dan fitur kolaborasi **klien-staff baru benar-benar hidup** — staf perusahaan klien bisa login dari kantor mereka sendiri. Item backlog "HTTPS + hosting" selesai (PM2 tidak perlu; `docker --restart unless-stopped` menggantikannya).

---

## Fase 2 — Hardening produksi (1–2 minggu setelah live)

- **Keamanan:** rate limit login, alur lupa-sandi, audit log login. (Header keamanan & TLS sudah ditangani Caddy.)
- **Operasional:** healthcheck container; uptime monitor; log ke stdout (`docker logs`).
- **CI/CD:** GitHub Actions — push ke `main` → SSH ke VPS → build image → recreate container. (Pola sama dengan app tetangga di server ini.)
- **Pengingat email/WhatsApp** (backlog): kini mungkin karena server hidup 24/7 — cron server memanggil endpoint pengingat; gateway WhatsApp sudah ada polanya di VPS ini (`pilates_whatsapp`).

---

## Fase 3 — Penyimpanan: JSON → SQLite → PostgreSQL

**Pemicu pindah** (jangan lebih awal dari perlunya): tenant aktif > ~10 firma, `db.json` > ~20–50 MB, atau mulai ada tulis-bersamaan yang terasa (JSON store menulis seluruh file secara atomik).

**Langkah A — SQLite, tetap zero-dependency.** Node 22 punya **`node:sqlite` bawaan** — filosofi tanpa-dependensi tetap terjaga. Karena semua akses data lewat `lib/db.js` (satu lapisan store), cukup tulis adaptor di file itu: tiap koleksi → tabel `(id TEXT PK, companyId TEXT [indexed], data JSON)`. Logika bisnis **nol perubahan**.

**Langkah B — PostgreSQL 16** (saat SaaS multi-firma serius): service compose di samping app (pola `nexisthub_db`/`pos_db` di VPS ini) + driver `pg` — dependensi eksternal pertama yang memang layak. Mulai dari kolom JSONB (drop-in dari adaptor SQLite), lalu normalisasi bertahap **tabel panas saja**: `journals` → `journal_entries` + `journal_lines`, `accounts`. Setelah itu barulah dua janji blueprint ditegakkan di level DB:
- **RLS per tenant** — mudah, karena disiplin `companyId` sudah konsisten di seluruh koleksi (`companyId` = `tenant_id` blueprint; scope buku klien ikut skema yang sama).
- **Invariant Σdebit = Σkredit** sebagai constraint/trigger, dan status `disetujui` menjadi immutable (koreksi = jurnal pembalik) — menggantikan konvensi `isPosted` yang kini dijaga di aplikasi.

**Verifikasi paritas (wajib di A dan B):** skrip banding sebelum/sesudah per buku — trial balance, L/R, neraca, equity — harus identik rupiah-per-rupiah sebelum store lama dipensiunkan.

---

## Fase 4 — Selaras blueprint (kuartal berikutnya)

- **Subdomain produk:** `nexafin.id` = landing (repo `nexafin-landing`), `app.nexafin.id` = aplikasi, `api.nexafin.id` = Open API publik kelak.
- **Pecah service hanya saat ada tekanan nyata** (sesuai rekomendasi blueprint): kandidat pertama `integration-svc` (bank feed via API — menggantikan unggah XLSX manual) dan `ai-svc` (mengurung panggilan Claude + guardrail + audit; sekarang `lib/ai.js` sudah jadi satu pintu — tinggal dipromosikan).
- **Frontend:** vanilla SPA `public/app.js` **dipertahankan** — jangan rewrite yang berfungsi. React/Next dipertimbangkan hanya bila tim frontend membesar atau butuh portal terpisah (portal klien).
- **Open API + webhook:** `routes-books.js` / `routes-consult.js` sudah modular — jadikan dasar kontrak `/v1` + API key per firma.

---

## Pemetaan backlog lama → fase

| Backlog (memory.md/handoff.md) | Fase |
|---|---|
| HTTPS + hosting (+PM2) | **1** (PM2 → Docker restart policy) |
| Backup otomatis | **1** |
| Keamanan produksi (rate limit, lupa sandi, audit) | **2** |
| Pengingat email/WhatsApp saat app tertutup | **2** |
| Migrasi SQLite/Postgres | **3** |
| Persediaan, disposal aset, cetak PDF, kalender libur | Independen — bisa jalan paralel di fase mana pun (fitur, bukan infrastruktur) |

## Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Data input di dua tempat (Windows & VPS) → tak bisa digabung | Setelah go-live: produksi = VPS saja; Windows = dev |
| `.secret` tertinggal → semua sesi invalid | Ikutkan `.secret` saat memindah `/data` |
| Timezone UTC menggeser tanggal jurnal/tenggat SPT | `TZ=Asia/Jakarta` di container (sudah di Dockerfile) |
| Lampiran rusak/path beda OS | `paths.js` sudah abstraksi; uji unduh+pratinjau lampiran pasca-impor |
| Ganti store diam-diam mengubah angka laporan | Skrip paritas laporan per buku — gerbang wajib Fase 3 |
| Kunci AI (Anthropic) tersimpan di data | Ikut berpindah bersama `db.json`; jangan commit data ke git |

---

**Langkah pertama yang disarankan:** kerjakan **Fase 0–1** — hasilnya nyata dalam 1–2 hari (aplikasi online di `app.nexafin.id`, HTTPS, kolaborasi hidup), tanpa menyentuh satu pun logika bisnis.
