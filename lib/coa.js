'use strict';
/*
 * Bagan Akun (Chart of Accounts) default mengikuti praktik umum SAK/PSAK Indonesia.
 * Kolom:
 *  code         : kode akun
 *  name         : nama akun
 *  category     : ASET | LIABILITAS | EKUITAS | PENDAPATAN | BEBAN
 *  subcategory  : pengelompokan untuk penyajian laporan
 *  normal       : 'D' (debit) atau 'K' (kredit) = saldo normal
 *  cashFlow     : operasi | investasi | pendanaan (klasifikasi arus kas untuk akun lawan)
 *  isCash       : true jika akun kas/bank (dasar laporan arus kas)
 *  isDepr       : true jika beban penyusutan/amortisasi (informasi tambahan)
 */

const DEFAULT_COA = [
  // ========================= ASET =========================
  // Aset Lancar
  { code: '1-1100', name: 'Kas',                         category: 'ASET', subcategory: 'Aset Lancar', normal: 'D', cashFlow: 'operasi',   isCash: true },
  { code: '1-1200', name: 'Bank',                        category: 'ASET', subcategory: 'Aset Lancar', normal: 'D', cashFlow: 'operasi',   isCash: true },
  { code: '1-1250', name: 'Kas — Dompet Digital (e-Wallet)', category: 'ASET', subcategory: 'Aset Lancar', normal: 'D', cashFlow: 'operasi', isCash: true },
  { code: '1-1300', name: 'Piutang Usaha',               category: 'ASET', subcategory: 'Aset Lancar', normal: 'D', cashFlow: 'operasi' },
  { code: '1-1310', name: 'Cadangan Kerugian Piutang',   category: 'ASET', subcategory: 'Aset Lancar', normal: 'K', cashFlow: 'operasi' },
  { code: '1-1400', name: 'Persediaan Barang Dagang',    category: 'ASET', subcategory: 'Aset Lancar', normal: 'D', cashFlow: 'operasi' },
  { code: '1-1500', name: 'Uang Muka / Biaya Dibayar Dimuka', category: 'ASET', subcategory: 'Aset Lancar', normal: 'D', cashFlow: 'operasi' },
  { code: '1-1600', name: 'PPN Masukan',                 category: 'ASET', subcategory: 'Aset Lancar', normal: 'D', cashFlow: 'operasi' },
  // Aset Tetap
  { code: '1-2100', name: 'Tanah',                       category: 'ASET', subcategory: 'Aset Tetap',  normal: 'D', cashFlow: 'investasi' },
  { code: '1-2200', name: 'Bangunan',                    category: 'ASET', subcategory: 'Aset Tetap',  normal: 'D', cashFlow: 'investasi' },
  { code: '1-2210', name: 'Akumulasi Penyusutan Bangunan', category: 'ASET', subcategory: 'Aset Tetap', normal: 'K', cashFlow: 'investasi' },
  { code: '1-2300', name: 'Kendaraan',                   category: 'ASET', subcategory: 'Aset Tetap',  normal: 'D', cashFlow: 'investasi' },
  { code: '1-2310', name: 'Akumulasi Penyusutan Kendaraan', category: 'ASET', subcategory: 'Aset Tetap', normal: 'K', cashFlow: 'investasi' },
  { code: '1-2400', name: 'Peralatan & Inventaris',      category: 'ASET', subcategory: 'Aset Tetap',  normal: 'D', cashFlow: 'investasi' },
  { code: '1-2410', name: 'Akumulasi Penyusutan Peralatan', category: 'ASET', subcategory: 'Aset Tetap', normal: 'K', cashFlow: 'investasi' },

  // ====================== LIABILITAS ======================
  // Jangka Pendek
  { code: '2-1100', name: 'Utang Usaha',                 category: 'LIABILITAS', subcategory: 'Liabilitas Jangka Pendek', normal: 'K', cashFlow: 'operasi' },
  { code: '2-1200', name: 'Utang Pajak',                 category: 'LIABILITAS', subcategory: 'Liabilitas Jangka Pendek', normal: 'K', cashFlow: 'operasi' },
  { code: '2-1210', name: 'PPN Keluaran',               category: 'LIABILITAS', subcategory: 'Liabilitas Jangka Pendek', normal: 'K', cashFlow: 'operasi' },
  { code: '2-1300', name: 'Beban yang Masih Harus Dibayar', category: 'LIABILITAS', subcategory: 'Liabilitas Jangka Pendek', normal: 'K', cashFlow: 'operasi' },
  { code: '2-1400', name: 'Pendapatan Diterima Dimuka',  category: 'LIABILITAS', subcategory: 'Liabilitas Jangka Pendek', normal: 'K', cashFlow: 'operasi' },
  // Jangka Panjang
  { code: '2-2100', name: 'Utang Bank Jangka Panjang',   category: 'LIABILITAS', subcategory: 'Liabilitas Jangka Panjang', normal: 'K', cashFlow: 'pendanaan' },

  // ======================== EKUITAS =======================
  { code: '3-1100', name: 'Modal Pemilik',               category: 'EKUITAS', subcategory: 'Ekuitas', normal: 'K', cashFlow: 'pendanaan' },
  { code: '3-1200', name: 'Prive / Pengambilan Pemilik', category: 'EKUITAS', subcategory: 'Ekuitas', normal: 'D', cashFlow: 'pendanaan' },
  { code: '3-1300', name: 'Laba Ditahan',                category: 'EKUITAS', subcategory: 'Ekuitas', normal: 'K', cashFlow: 'pendanaan' },

  // ====================== PENDAPATAN ======================
  { code: '4-1100', name: 'Pendapatan Penjualan',        category: 'PENDAPATAN', subcategory: 'Pendapatan Usaha', normal: 'K', cashFlow: 'operasi' },
  { code: '4-1200', name: 'Pendapatan Jasa',             category: 'PENDAPATAN', subcategory: 'Pendapatan Usaha', normal: 'K', cashFlow: 'operasi' },
  { code: '4-1300', name: 'Retur & Potongan Penjualan',  category: 'PENDAPATAN', subcategory: 'Pendapatan Usaha', normal: 'D', cashFlow: 'operasi' },
  { code: '4-9100', name: 'Pendapatan Bunga',            category: 'PENDAPATAN', subcategory: 'Pendapatan Lain-lain', normal: 'K', cashFlow: 'operasi' },
  { code: '4-9200', name: 'Pendapatan Lain-lain',        category: 'PENDAPATAN', subcategory: 'Pendapatan Lain-lain', normal: 'K', cashFlow: 'operasi' },

  // ========================= BEBAN ========================
  // Beban Pokok Penjualan
  { code: '5-1100', name: 'Harga Pokok Penjualan',       category: 'BEBAN', subcategory: 'Beban Pokok Penjualan', normal: 'D', cashFlow: 'operasi' },
  // Beban Operasional
  { code: '6-1100', name: 'Beban Gaji & Upah',           category: 'BEBAN', subcategory: 'Beban Operasional', normal: 'D', cashFlow: 'operasi' },
  { code: '6-1200', name: 'Beban Sewa',                  category: 'BEBAN', subcategory: 'Beban Operasional', normal: 'D', cashFlow: 'operasi' },
  { code: '6-1300', name: 'Beban Listrik, Air & Telepon', category: 'BEBAN', subcategory: 'Beban Operasional', normal: 'D', cashFlow: 'operasi' },
  { code: '6-1400', name: 'Beban Perlengkapan',          category: 'BEBAN', subcategory: 'Beban Operasional', normal: 'D', cashFlow: 'operasi' },
  { code: '6-1500', name: 'Beban Pemasaran & Iklan',     category: 'BEBAN', subcategory: 'Beban Operasional', normal: 'D', cashFlow: 'operasi' },
  { code: '6-1600', name: 'Beban Transportasi',          category: 'BEBAN', subcategory: 'Beban Operasional', normal: 'D', cashFlow: 'operasi' },
  { code: '6-1700', name: 'Beban Administrasi & Umum',   category: 'BEBAN', subcategory: 'Beban Operasional', normal: 'D', cashFlow: 'operasi' },
  { code: '6-1800', name: 'Beban Penyusutan',            category: 'BEBAN', subcategory: 'Beban Operasional', normal: 'D', cashFlow: 'operasi', isDepr: true },
  // Beban Lain-lain
  { code: '8-1100', name: 'Beban Bunga',                 category: 'BEBAN', subcategory: 'Beban Lain-lain', normal: 'D', cashFlow: 'operasi' },
  { code: '8-1200', name: 'Beban Administrasi Bank',     category: 'BEBAN', subcategory: 'Beban Lain-lain', normal: 'D', cashFlow: 'operasi' },
  { code: '8-9200', name: 'Beban Lain-lain',             category: 'BEBAN', subcategory: 'Beban Lain-lain', normal: 'D', cashFlow: 'operasi' },
  // Beban Pajak
  { code: '9-1100', name: 'Beban Pajak Penghasilan',     category: 'BEBAN', subcategory: 'Beban Pajak', normal: 'D', cashFlow: 'operasi' }
];

// Urutan penyajian subkategori pada laporan
const SUBCAT_ORDER = {
  'Aset Lancar': 1, 'Aset Tetap': 2, 'Aset Tidak Lancar Lainnya': 3,
  'Liabilitas Jangka Pendek': 1, 'Liabilitas Jangka Panjang': 2,
  'Ekuitas': 1,
  'Pendapatan Usaha': 1, 'Pendapatan Lain-lain': 2,
  'Beban Pokok Penjualan': 1, 'Beban Operasional': 2, 'Beban Lain-lain': 3, 'Beban Pajak': 4
};

module.exports = { DEFAULT_COA, SUBCAT_ORDER };
