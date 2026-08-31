'use strict';
/*
 * Klasifikasi akun berbasis pola (belajar) + aturan kata kunci Indonesia +
 * ATURAN TETAP per perusahaan (persisten), serta deteksi transaksi anomali.
 * Tanpa dependensi eksternal.
 *
 * Jenis transaksi diturunkan dari sifat akun lawan (counter):
 *   akun kas/bank lain  -> Pemindahan Kas (transfer/e-wallet)
 *   Piutang Usaha       -> Pelunasan Piutang
 *   akun Liabilitas     -> Pelunasan Utang
 *   Prive / Modal       -> Prive / Setor Modal
 *   Pendapatan / Beban  -> Pendapatan / Beban
 */
const { db } = require('./db');

/* Aturan kata kunci bawaan → kode akun lawan default. Dicek berurutan
   (yang lebih spesifik diletakkan lebih dulu). */
const SEED = [
  // ---- Pemindahan kas / dompet digital (transfer) ----
  { re: /\b(dana|ovo|gopay|go-?pay|shopee\s?pay|spay\b|linkaja|link\s?aja|isaku|flip|sakuku)\b|top\s?up|topup|e-?wallet|dompet\s*digital/i, code: '1-1250' },
  { re: /tarik\s*tunai|setor\s*tunai|penarikan\s*tunai|cash\s*withdrawal|ambil\s*tunai/i, code: '1-1100' },
  // ---- Prive (pengambilan pemilik) ----
  { re: /prive|pengambilan\s*prib|tarik\s*pemilik|owner\s*draw|untuk\s*pribadi/i, code: '3-1200' },
  // ---- Setor modal ----
  { re: /setor\s*modal|modal\s*disetor|penyertaan\s*modal|inject(ion)?\s*modal|investasi\s*pemilik/i, masuk: '3-1100' },
  // ---- Pelunasan piutang (uang masuk dari pelanggan) ----
  { re: /pelunasan\s*piutang|pembayaran\s*pelanggan|pelunasan\s*invoice|bayar\s*tagihan\s*(dari|pelanggan)|pelunasan\s*(dr|dari)\s*pelanggan/i, masuk: '1-1300' },
  // ---- Pelunasan utang / cicilan pinjaman (uang keluar) ----
  { re: /angsuran|cicilan|pelunasan\s*(pinjaman|kredit)|bayar\s*pinjaman/i, keluar: '2-2100' },
  { re: /bayar\s*utang|pelunasan\s*utang|pembayaran\s*(ke\s*)?supplier|bayar\s*supplier|pelunasan\s*ke\s*supplier/i, keluar: '2-1100' },
  // ---- Pajak ----
  { re: /pph|ppn\s*keluaran|setor\s*pajak|djp|e-?billing|pajak\b/i, keluar: '2-1200' },
  // ---- Beban operasional ----
  { re: /gaji|payroll|salary|upah|thr|bonus\s*karyawan|honor/i, keluar: '6-1100' },
  { re: /pln|listrik|token\s*listrik|pdam|tagihan\s*air/i, keluar: '6-1300' },
  { re: /internet|indihome|telkom|wifi|pulsa|telepon|telkomsel|by\.?u|\bxl\b|indosat|paket\s*data|biznet|first\s*media/i, keluar: '6-1300' },
  { re: /sewa|rent|kontrak\s*(ruko|kantor|gudang|tempat)/i, keluar: '6-1200' },
  { re: /iklan|\bads?\b|adsense|marketing|promosi|meta\s*ads|fb\s*ads|google\s*ads|tiktok\s*ads|endorse|iklan/i, keluar: '6-1500' },
  { re: /grab|gojek|gosend|grabexpress|ongkir|kurir|\bjne\b|j&t|sicepat|anteraja|bensin|pertamina|shell|bbm|\btol\b|parkir|transport/i, keluar: '6-1600' },
  { re: /atk|alat\s*tulis|perlengkapan|supplies|kertas|tinta|galon|konsumsi|snack|air\s*minum/i, keluar: '6-1400' },
  { re: /biaya\s*adm|adm\b|admin\s*bank|biaya\s*transfer|biaya\s*trx|biaya\s*bulanan|adm\s*kartu|biaya\s*transaksi/i, keluar: '8-1200' },
  { re: /bunga\s*(pinjaman|kredit|bank)|beban\s*bunga|denda\s*keterlambatan/i, keluar: '8-1100' },
  // ---- Pembelian / HPP ----
  { re: /\bbeli\b|pembelian|supplier|stok|kulakan|belanja\s*barang|\bpo\b|purchase|resto|makan|restoran|grosir/i, keluar: '5-1100' },
  // ---- Pemasukan ----
  { re: /penjualan|\bsale\b|order|qris|\bedc\b|settlement|shopee|tokopedia|tiktok\s*shop|lazada|bukalapak|marketplace|pembayaran\s*masuk/i, masuk: '4-1100' },
  { re: /jasa|service|\bfee\b|komisi|konsultasi|proyek/i, masuk: '4-1200' },
  { re: /bunga\s*(bank|tabungan|giro)|jasa\s*giro/i, masuk: '4-9100' }
];

const STOP = new Set(['yang','dan','ke','dari','di','untuk','pada','trf','transfer','tf','an','a/n','atas','nama','biaya','pembayaran','pmb','pemb','via','no','ref','the','of','pt','cv','toko','bpk','ibu','sdr','tgl','jam','wib','brimo','mbanking']);

function tokenize(desc) {
  return String(desc || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !/^\d+$/.test(t) && !STOP.has(t));
}

function model(companyId) {
  const d = db();
  if (!d.classifiers[companyId]) d.classifiers[companyId] = { tokens: {}, total: 0 };
  return d.classifiers[companyId];
}
function train(companyId, desc, kode) {
  if (!kode) return;
  const m = model(companyId);
  for (const t of tokenize(desc)) {
    if (!m.tokens[t]) m.tokens[t] = {};
    m.tokens[t][kode] = (m.tokens[t][kode] || 0) + 1;
  }
  m.total += 1;
}

function seedMatch(desc, arah) {
  for (const r of SEED) {
    if (!r.re.test(desc)) continue;
    if (r.code) return r.code;                        // berlaku dua arah
    const code = arah === 'masuk' ? r.masuk : r.keluar;
    if (code) return code;
  }
  return null;
}

// Aturan tetap (persisten) buatan pengguna — prioritas tertinggi.
function rulesFor(companyId) {
  return (db().rules || []).filter(r => r.companyId === companyId);
}
function ruleMatch(desc, arah, rules) {
  const low = String(desc || '').toLowerCase();
  for (const r of rules) {
    if (!r.contains) continue;
    if (!low.includes(String(r.contains).toLowerCase())) continue;
    if (r.arah && r.arah !== arah) continue;
    return r.counterCode;
  }
  return null;
}

function ensureCode(accounts, code, arah) {
  if (accounts.some(a => a.code === code)) return code;
  const fb = arah === 'masuk' ? '4-9200' : '8-9200';
  return accounts.some(a => a.code === fb) ? fb :
    (accounts.find(a => arah === 'masuk' ? a.category === 'PENDAPATAN' : a.category === 'BEBAN') || {}).code || code;
}

function classify(companyId, desc, arah, accounts, rules) {
  rules = rules || rulesFor(companyId);
  // 1) aturan tetap
  const byRule = ruleMatch(desc, arah, rules);
  if (byRule) return { code: ensureCode(accounts, byRule, arah), confidence: 0.99, source: 'aturan-tetap', alternatives: [] };

  // 2) model belajar
  const m = model(companyId);
  const skor = {};
  for (const t of tokenize(desc)) {
    const row = m.tokens[t]; if (!row) continue;
    for (const kode in row) skor[kode] = (skor[kode] || 0) + row[kode];
  }
  const learned = Object.entries(skor).sort((a, b) => b[1] - a[1]);
  const totalSkor = learned.reduce((s, e) => s + e[1], 0);
  if (learned.length && learned[0][1] > 0) {
    const conf = Math.min(0.97, 0.55 + 0.45 * (learned[0][1] / (totalSkor || 1)));
    return { code: ensureCode(accounts, learned[0][0], arah), confidence: Math.round(conf * 100) / 100, source: 'belajar', alternatives: learned.slice(0, 3).map(([c, s]) => ({ code: c, score: s })) };
  }

  // 3) aturan kata kunci bawaan
  const s = seedMatch(desc, arah);
  if (s) return { code: ensureCode(accounts, s, arah), confidence: 0.7, source: 'aturan', alternatives: [] };

  // 4) default
  const def = arah === 'masuk' ? '4-9200' : '8-9200';
  return { code: ensureCode(accounts, def, arah), confidence: 0.3, source: 'default', alternatives: [] };
}

/* Label jenis transaksi diturunkan dari sifat akun lawan. */
function jenisDari(account) {
  if (!account) return 'Lainnya';
  if (account.isCash) return 'Pemindahan Kas';
  if (account.code === '1-1300') return 'Pelunasan Piutang';
  if (account.category === 'LIABILITAS') return 'Pelunasan Utang';
  if (account.code === '3-1200') return 'Prive';
  if (account.code === '3-1100') return 'Setor Modal';
  if (account.category === 'EKUITAS') return 'Ekuitas';
  if (account.category === 'PENDAPATAN') return 'Pendapatan';
  if (account.category === 'BEBAN') return 'Beban';
  if (account.category === 'ASET') return 'Aset / Uang Muka';
  return 'Lainnya';
}

/* ---------- Deteksi anomali ---------- */
function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function detectAnomalies(transaksi) {
  const flags = transaksi.map(() => []);
  const seen = {};
  transaksi.forEach((t, i) => {
    const key = `${t.tanggal}|${Math.round(t.nominal)}|${(t.keterangan || '').toLowerCase().slice(0, 40)}`;
    if (seen[key] !== undefined) { flags[i].push('duplikat'); if (!flags[seen[key]].includes('duplikat')) flags[seen[key]].push('duplikat'); }
    else seen[key] = i;
  });
  const vals = transaksi.map(t => t.nominal);
  const med = median(vals);
  const mad = median(vals.map(v => Math.abs(v - med))) || 1;
  transaksi.forEach((t, i) => {
    const score = Math.abs(t.nominal - med) / (1.4826 * mad);
    if (score > 5 && t.nominal > med * 3) flags[i].push('nominal tidak biasa');
  });
  return flags;
}

module.exports = { tokenize, train, classify, detectAnomalies, jenisDari, rulesFor, seedMatch, SEED };
