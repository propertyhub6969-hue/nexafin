'use strict';
/*
 * Catatan atas Laporan Keuangan (CALK).
 * - Narasi (info umum, dasar penyusunan, kebijakan akuntansi, pihak berelasi,
 *   perpajakan, peristiwa setelah periode) disimpan per buku (template, dipakai
 *   ulang tiap tahun) dengan variabel {nama},{tahun},{koreksiFiskal}.
 * - Rincian pos material + tabel aset tetap + koreksi fiskal DIHASILKAN OTOMATIS
 *   dari buku besar & modul aset saat render (per tahun).
 * Semua logika di lib/, frontend hanya menampilkan/mencetak.
 */
const store = require('./db');
const acc = require('./accounting');
const assets = require('./assets');

// Template awal per jenis usaha (kebijakan akuntansi yang relevan).
function defaultCALK(jenisUsaha) {
  const j = String(jenisUsaha || '').toLowerCase();
  const kebijakan = [
    { judul: 'Kas dan Setara Kas', isi: 'Kas dan setara kas mencakup kas, bank, dan investasi jangka pendek yang sangat likuid dan segera dapat dijadikan kas.' },
    { judul: 'Piutang Usaha', isi: 'Piutang usaha disajikan sebesar jumlah bruto tagihan dikurangi penyisihan kerugian penurunan nilai (jika ada).' },
    { judul: 'Aset Tetap dan Penyusutan', isi: 'Aset tetap dicatat sebesar biaya perolehan dikurangi akumulasi penyusutan. Penyusutan komersial dihitung dengan metode garis lurus/saldo menurun sesuai taksiran masa manfaat. Untuk tujuan fiskal, penyusutan mengikuti Pasal 11 UU PPh; selisihnya menjadi koreksi fiskal.' },
    { judul: 'Pengakuan Pendapatan', isi: 'Pendapatan diakui pada saat penyerahan barang/jasa kepada pelanggan dan besar kemungkinan manfaat ekonomi akan diterima.' },
    { judul: 'Pengakuan Beban', isi: 'Beban diakui pada saat terjadinya (basis akrual).' }
  ];
  if (j.includes('dagang') || j.includes('perdagangan')) {
    kebijakan.splice(2, 0, { judul: 'Persediaan', isi: 'Persediaan barang dagang dinilai berdasarkan nilai terendah antara biaya perolehan dan nilai realisasi neto. Biaya perolehan ditentukan dengan metode rata-rata/FIFO.' });
  } else if (j.includes('manufaktur') || j.includes('industri')) {
    kebijakan.splice(2, 0, { judul: 'Persediaan', isi: 'Persediaan (bahan baku, barang dalam proses, dan barang jadi) dinilai berdasarkan nilai terendah antara biaya perolehan dan nilai realisasi neto.' });
  } else if (j.includes('jasa')) {
    kebijakan.find(k => k.judul === 'Pengakuan Pendapatan').isi = 'Pendapatan jasa diakui pada saat jasa telah diserahkan/diselesaikan sesuai tingkat penyelesaian pekerjaan.';
  } else if (j.includes('konstruksi')) {
    kebijakan.splice(3, 0, { judul: 'Pendapatan Kontrak Konstruksi', isi: 'Pendapatan dan beban kontrak konstruksi diakui berdasarkan metode persentase penyelesaian.' });
  }
  return {
    infoUmum: '{nama} ("Perusahaan") bergerak dalam bidang ' + (jenisUsaha || '[isi bidang usaha]') + '. Laporan keuangan disusun untuk tahun yang berakhir pada tanggal 31 Desember {tahun}. [Lengkapi: pendirian, akta, domisili, dan kegiatan usaha utama.]',
    penyusunan: 'Laporan keuangan disusun sesuai dengan Standar Akuntansi Keuangan di Indonesia, atas dasar akrual dan konsep biaya historis, serta disajikan dalam mata uang Rupiah.',
    kebijakan,
    pihakBerelasi: 'Tidak terdapat transaksi dengan pihak berelasi yang material selama periode pelaporan. [Sesuaikan bila ada.]',
    perpajakan: 'Perusahaan memenuhi kewajiban perpajakannya sesuai ketentuan yang berlaku. Koreksi fiskal atas penyusutan aset tetap tahun berjalan sebesar Rp {koreksiFiskal}. [Lengkapi rekonsiliasi fiskal lainnya bila ada.]',
    peristiwaSetelah: 'Tidak terdapat peristiwa signifikan setelah tanggal pelaporan yang memerlukan penyesuaian atau pengungkapan. [Sesuaikan bila ada.]'
  };
}

function getStored(bookId) {
  return (store.db().calk || []).find(x => x.companyId === bookId) || null;
}
function save(bookId, data) {
  const d = store.db();
  d.calk = d.calk || [];
  let rec = d.calk.find(x => x.companyId === bookId);
  if (!rec) { rec = { id: store.id(), companyId: bookId }; d.calk.push(rec); }
  ['infoUmum', 'penyusunan', 'kebijakan', 'pihakBerelasi', 'perpajakan', 'peristiwaSetelah'].forEach(k => { if (data[k] !== undefined) rec[k] = data[k]; });
  rec.updatedAt = new Date().toISOString();
  store.saveNow();
  return rec;
}

// Angka otomatis untuk tahun tertentu (rincian pos material, aset tetap, koreksi fiskal, ringkasan).
function buildAuto(bookId, tahun) {
  const y = parseInt(tahun, 10) || new Date().getFullYear();
  const from = `${y}-01-01`, to = `${y}-12-31`;
  const bs = acc.balanceSheet(bookId, to);
  const is = acc.incomeStatement(bookId, from, to);
  const eq = acc.equityStatement(bookId, from, to);
  // rincian pos = kelompok neraca (subkategori → akun & saldo)
  const rincian = bs.groups;
  // aset tetap
  const asetRows = assets.assetsOf(bookId).map(a => {
    const s = assets.assetSummary(a, `${y}-12`);
    return { nama: a.nama, tanggalPerolehan: a.tanggalPerolehan, harga: a.harga, akum: s.akumKomersial, nilaiBuku: s.nilaiBukuKomersial };
  });
  const asetTotal = asetRows.reduce((s, r) => ({ harga: s.harga + r.harga, akum: s.akum + r.akum, nilaiBuku: s.nilaiBuku + r.nilaiBuku }), { harga: 0, akum: 0, nilaiBuku: 0 });
  // koreksi fiskal penyusutan tahun berjalan
  const kf = assets.assetsOf(bookId).reduce((s, a) => { const k = assets.koreksiTahun(a, y); return { komersial: s.komersial + k.komersial, fiskal: s.fiskal + k.fiskal, koreksi: s.koreksi + k.koreksi }; }, { komersial: 0, fiskal: 0, koreksi: 0 });
  return {
    tahun: y, from, to,
    ringkasan: {
      totalAset: bs.totalAset, totalLiabilitas: bs.totalLiabilitas, totalEkuitas: bs.totalEkuitas,
      pendapatan: is.pendapatanUsaha, labaBersih: is.labaBersih, ekuitasAkhir: eq.ekuitasAkhir
    },
    rincian, aset: { rows: asetRows, total: asetTotal }, koreksiFiskal: kf
  };
}

module.exports = { defaultCALK, getStored, save, buildAuto };
