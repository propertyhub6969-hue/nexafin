'use strict';
/*
 * Modul Aset Tetap (per buku/klien).
 * - Master aset: tgl perolehan, harga, nilai residu, masa manfaat, metode (komersial).
 * - Penyusutan KOMERSIAL: dihitung bulanan & diposting jurnal otomatis
 *   (Dr Beban Penyusutan, Cr Akumulasi Penyusutan). Idempoten via daftar bulan terposting.
 * - Penyusutan FISKAL (Pasal 11 UU PPh): dihitung berdampingan (tidak diposting),
 *   dipakai untuk KOREKSI FISKAL = komersial − fiskal.
 * Semua logika di sini (lib/), frontend hanya menampilkan.
 */
const store = require('./db');

// Kelompok fiskal Pasal 11 UU PPh + masa manfaat (tahun). Tarif GL=1/masa, SM=2/masa.
const FISKAL = {
  'I': { label: 'Kelompok I (4 th)', masa: 4, sm: true },
  'II': { label: 'Kelompok II (8 th)', masa: 8, sm: true },
  'III': { label: 'Kelompok III (16 th)', masa: 16, sm: true },
  'IV': { label: 'Kelompok IV (20 th)', masa: 20, sm: true },
  'bangunan-permanen': { label: 'Bangunan Permanen (20 th)', masa: 20, sm: false },
  'bangunan-non-permanen': { label: 'Bangunan Tidak Permanen (10 th)', masa: 10, sm: false },
  'non-penyusutan': { label: 'Tidak Disusutkan (mis. tanah)', masa: 0, sm: false }
};
const METODE = { 'garis-lurus': 'Garis Lurus', 'saldo-menurun': 'Saldo Menurun' };

function ymOf(dateStr) { return String(dateStr || '').slice(0, 7); }
function addMonths(ymStr, n) {
  const [y, m] = ymStr.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  return Math.floor(idx / 12) + '-' + String(idx % 12 + 1).padStart(2, '0');
}
function r0(n) { return Math.round(Number(n) || 0); }

/*
 * Jadwal penyusutan bulanan (deterministik) untuk satu set parameter.
 * metode: 'garis-lurus' | 'saldo-menurun'. residu diabaikan pada fiskal (0).
 * Mengembalikan array {periode:'YYYY-MM', amount} sepanjang masa manfaat.
 */
function schedule(harga, residu, masaTahun, metode, startYM) {
  const rows = [];
  harga = Number(harga) || 0; residu = Number(residu) || 0;
  const tahun = Number(masaTahun) || 0;
  if (tahun <= 0 || harga <= 0) return rows;
  const base = harga - residu;
  if (base <= 0) return rows;
  if (metode === 'saldo-menurun') {
    const rate = 2 / tahun;
    let akum = 0;
    for (let y = 0; y < tahun; y++) {
      const openBV = harga - akum;
      let annual = (y === tahun - 1) ? (openBV - residu) : openBV * rate;
      if (annual < 0) annual = 0;
      const monthly = annual / 12;
      for (let mm = 0; mm < 12; mm++) { rows.push({ periode: addMonths(startYM, y * 12 + mm), amount: monthly }); akum += monthly; }
    }
  } else {
    const n = tahun * 12;
    const monthly = base / n;
    for (let i = 0; i < n; i++) rows.push({ periode: addMonths(startYM, i), amount: monthly });
  }
  return rows;
}

function komSchedule(a) { return schedule(a.harga, a.nilaiResidu, a.masaManfaat, a.metode || 'garis-lurus', ymOf(a.tanggalPerolehan)); }
function fiskalSchedule(a) {
  const g = FISKAL[a.kelompokFiskal]; if (!g || g.masa <= 0) return [];
  const met = g.sm ? (a.metodeFiskal || 'garis-lurus') : 'garis-lurus'; // bangunan hanya GL
  return schedule(a.harga, 0, g.masa, met, ymOf(a.tanggalPerolehan)); // fiskal: residu 0
}

// Ringkasan satu aset s/d periode 'sampaiYM' (inklusif)
function assetSummary(a, sampaiYM) {
  const kom = komSchedule(a), fis = fiskalSchedule(a);
  const sumUpto = (rows) => rows.filter(r => !sampaiYM || r.periode <= sampaiYM).reduce((s, r) => s + r.amount, 0);
  const akumKom = sumUpto(kom), akumFis = sumUpto(fis);
  return {
    akumKomersial: r0(akumKom), nilaiBukuKomersial: r0(a.harga - akumKom),
    akumFiskal: r0(akumFis), nilaiBukuFiskal: r0(a.harga - akumFis),
    totalBulanKom: kom.length
  };
}

// Koreksi fiskal per TAHUN untuk satu aset: komersial − fiskal
function koreksiTahun(a, tahun) {
  const inY = (rows) => rows.filter(r => r.periode.slice(0, 4) === String(tahun)).reduce((s, r) => s + r.amount, 0);
  const komersial = r0(inY(komSchedule(a)));
  const fiskal = r0(inY(fiskalSchedule(a)));
  return { komersial, fiskal, koreksi: komersial - fiskal };
}

const assetsOf = (bookId) => (store.db().assets || []).filter(x => x.companyId === bookId);

/*
 * Bulan penyusutan komersial yang JATUH TEMPO & belum diposting, s/d sampaiYM.
 * Mengembalikan array {periode, amount(rounded)}.
 */
function dueMonths(a, sampaiYM) {
  const posted = new Set(a.penyusutanPosted || []);
  const kom = komSchedule(a);
  // pembulatan: bulan terakhir menyerap sisa agar akumulasi tepat
  const out = [];
  let akumR = 0; const total = kom.reduce((s, r) => s + r.amount, 0);
  for (let i = 0; i < kom.length; i++) {
    const row = kom[i];
    let amt = r0(row.amount);
    if (i === kom.length - 1) amt = r0(total) - akumR; // koreksi pembulatan di bulan terakhir
    akumR += amt;
    if (row.periode <= sampaiYM && !posted.has(row.periode) && amt > 0) out.push({ periode: row.periode, amount: amt });
  }
  return out;
}

module.exports = {
  FISKAL, METODE, assetsOf, komSchedule, fiskalSchedule, assetSummary, koreksiTahun, dueMonths, ymOf, addMonths
};
