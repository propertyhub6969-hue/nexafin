'use strict';
/*
 * Mesin akuntansi: menghitung buku besar, neraca saldo, dan laporan keuangan
 * (Laba Rugi, Neraca/Posisi Keuangan, Arus Kas) sesuai penyajian umum SAK/PSAK.
 * Semua dihitung langsung dari jurnal (single source of truth).
 */
const { db } = require('./db');
const { SUBCAT_ORDER } = require('./coa');

function accountsOf(companyId) {
  return db().accounts.filter(a => a.companyId === companyId);
}
function accountMap(companyId) {
  const m = {};
  for (const a of accountsOf(companyId)) m[a.code] = a;
  return m;
}
function journalsOf(companyId) {
  return db().journals.filter(j => j.companyId === companyId);
}
// Jurnal yang MASUK laporan resmi: hanya yang disetujui.
// status undefined dianggap disetujui (kompatibilitas data lama & sisi firma).
function isPosted(j) { return j.status !== 'draf'; }
function postedJournalsOf(companyId) {
  return db().journals.filter(j => j.companyId === companyId && isPosted(j));
}

// Akumulasi debit & kredit per akun untuk jurnal yang memenuhi predikat tanggal.
// Hanya jurnal disetujui (draf tidak memengaruhi laporan).
function accumulate(companyId, dateOk) {
  const acc = {}; // code -> {debit, credit}
  for (const j of postedJournalsOf(companyId)) {
    if (!dateOk(j.date)) continue;
    for (const l of (j.lines || [])) {
      const code = l.accountCode;
      if (!acc[code]) acc[code] = { debit: 0, credit: 0 };
      acc[code].debit += Number(l.debit) || 0;
      acc[code].credit += Number(l.credit) || 0;
    }
  }
  return acc;
}

const inRange = (from, to) => (d) => (!from || d >= from) && (!to || d <= to);
const upTo = (to) => (d) => (!to || d <= to);
const before = (from) => (d) => (from && d < from);

// Neraca saldo untuk rentang tanggal
function trialBalance(companyId, from, to) {
  const map = accountMap(companyId);
  const acc = accumulate(companyId, inRange(from, to));
  const rows = [];
  let totalD = 0, totalK = 0;
  for (const a of accountsOf(companyId).sort((x, y) => x.code.localeCompare(y.code))) {
    const v = acc[a.code] || { debit: 0, credit: 0 };
    const net = v.debit - v.credit;
    // saldo ditampilkan pada kolom sesuai saldo normal
    const debitBal = net > 0 ? net : 0;
    const kreditBal = net < 0 ? -net : 0;
    if (v.debit === 0 && v.credit === 0) continue;
    rows.push({ code: a.code, name: a.name, category: a.category, debit: debitBal, kredit: kreditBal, mutasiD: v.debit, mutasiK: v.credit });
    totalD += debitBal; totalK += kreditBal;
  }
  return { rows, totalDebit: totalD, totalKredit: totalK, seimbang: Math.abs(totalD - totalK) < 0.005 };
}

// Buku besar satu akun
function ledger(companyId, code, from, to) {
  const map = accountMap(companyId);
  const a = map[code];
  const entries = [];
  // saldo awal (sebelum 'from')
  let saldo = 0;
  const normalD = a && a.normal === 'D';
  const openAcc = accumulate(companyId, before(from));
  const ov = openAcc[code] || { debit: 0, credit: 0 };
  saldo = normalD ? (ov.debit - ov.credit) : (ov.credit - ov.debit);
  const saldoAwal = saldo;
  const js = postedJournalsOf(companyId)
    .filter(j => inRange(from, to)(j.date))
    .sort((x, y) => (x.date + x.number).localeCompare(y.date + y.number));
  for (const j of js) {
    for (const l of (j.lines || [])) {
      if (l.accountCode !== code) continue;
      const d = Number(l.debit) || 0, k = Number(l.credit) || 0;
      saldo += normalD ? (d - k) : (k - d);
      entries.push({ date: j.date, number: j.number, description: l.memo || j.description, debit: d, kredit: k, saldo });
    }
  }
  return { account: a, saldoAwal, saldoAkhir: saldo, entries };
}

// Nilai bersih akun (positif sesuai saldo normal) dalam rentang
function signed(acc, a) {
  const v = acc[a.code] || { debit: 0, credit: 0 };
  return a.normal === 'D' ? (v.debit - v.credit) : (v.credit - v.debit);
}

// Kontribusi ke ASET/LIAB/EKUITAS memakai (debit-credit) untuk ASET, (credit-debit) untuk lainnya
function contrib(acc, a) {
  const v = acc[a.code] || { debit: 0, credit: 0 };
  if (a.category === 'ASET') return v.debit - v.credit;
  return v.credit - v.debit;
}

// ---------- LAPORAN LABA RUGI ----------
function incomeStatement(companyId, from, to) {
  const accs = accountsOf(companyId);
  const acc = accumulate(companyId, inRange(from, to));
  const bySub = {}; // subcategory -> [{code,name,amount}]
  const flat = {};  // code -> amount (signed)
  for (const a of accs) {
    if (a.category !== 'PENDAPATAN' && a.category !== 'BEBAN') continue;
    const amt = signed(acc, a);
    flat[a.code] = amt;
    if (!bySub[a.subcategory]) bySub[a.subcategory] = [];
    if (amt !== 0) bySub[a.subcategory].push({ code: a.code, name: a.name, amount: amt });
  }
  const sub = (name) => (bySub[name] || []).reduce((s, r) => s + r.amount, 0);
  const pendapatanUsaha = sub('Pendapatan Usaha');
  const bpp = sub('Beban Pokok Penjualan');
  const labaBruto = pendapatanUsaha - bpp;
  const bebanOperasional = sub('Beban Operasional');
  const labaUsaha = labaBruto - bebanOperasional;
  const pendapatanLain = sub('Pendapatan Lain-lain');
  const bebanLain = sub('Beban Lain-lain');
  const labaSebelumPajak = labaUsaha + pendapatanLain - bebanLain;
  const bebanPajak = sub('Beban Pajak');
  const labaBersih = labaSebelumPajak - bebanPajak;
  return {
    groups: bySub,
    pendapatanUsaha, bpp, labaBruto, bebanOperasional, labaUsaha,
    pendapatanLain, bebanLain, labaSebelumPajak, bebanPajak, labaBersih,
    flat
  };
}

// ---------- NERACA / LAPORAN POSISI KEUANGAN (per tanggal) ----------
function balanceSheet(companyId, asOf) {
  const accs = accountsOf(companyId);
  const acc = accumulate(companyId, upTo(asOf));
  const groups = { ASET: {}, LIABILITAS: {}, EKUITAS: {} };
  for (const a of accs) {
    if (!groups[a.category]) continue;
    const val = contrib(acc, a);
    if (val === 0) continue;
    const sc = a.subcategory;
    if (!groups[a.category][sc]) groups[a.category][sc] = [];
    groups[a.category][sc].push({ code: a.code, name: a.name, amount: val });
  }
  const sumCat = (cat) => Object.values(groups[cat]).flat().reduce((s, r) => s + r.amount, 0);
  const totalAset = sumCat('ASET');
  const totalLiabilitas = sumCat('LIABILITAS');
  // laba berjalan (akumulasi sejak awal s/d tanggal) sebagai bagian ekuitas
  const is = incomeStatement(companyId, null, asOf);
  const labaBerjalan = is.labaBersih;
  const totalEkuitasAkun = sumCat('EKUITAS');
  const totalEkuitas = totalEkuitasAkun + labaBerjalan;
  return {
    groups, totalAset, totalLiabilitas, totalEkuitasAkun, labaBerjalan, totalEkuitas,
    totalPasiva: totalLiabilitas + totalEkuitas,
    seimbang: Math.abs(totalAset - (totalLiabilitas + totalEkuitas)) < 0.01
  };
}

// ---------- LAPORAN ARUS KAS (metode langsung dari mutasi kas) ----------
function cashFlow(companyId, from, to) {
  const map = accountMap(companyId);
  const cashCodes = new Set(accountsOf(companyId).filter(a => a.isCash).map(a => a.code));
  const kasBefore = accumulate(companyId, before(from));
  const kasThru = accumulate(companyId, upTo(to));
  const cashBal = (accObj) => [...cashCodes].reduce((s, c) => {
    const v = accObj[c] || { debit: 0, credit: 0 };
    return s + (v.debit - v.credit);
  }, 0);
  const kasAwal = cashBal(kasBefore);
  const kasAkhir = cashBal(kasThru);

  const buckets = { operasi: {}, investasi: {}, pendanaan: {} };
  for (const j of journalsOf(companyId)) {
    if (!inRange(from, to)(j.date)) continue;
    const hasCash = (j.lines || []).some(l => cashCodes.has(l.accountCode));
    if (!hasCash) continue;
    for (const l of (j.lines || [])) {
      if (cashCodes.has(l.accountCode)) continue; // lawan dari kas
      const a = map[l.accountCode];
      if (!a) continue;
      const flow = (Number(l.credit) || 0) - (Number(l.debit) || 0); // sumber kas positif
      const cat = a.cashFlow || 'operasi';
      const b = buckets[cat] || (buckets[cat] = {});
      if (!b[l.accountCode]) b[l.accountCode] = { code: a.code, name: a.name, amount: 0 };
      b[l.accountCode].amount += flow;
    }
  }
  const toRows = (obj) => Object.values(obj).filter(r => Math.abs(r.amount) > 0.005);
  const sum = (obj) => Object.values(obj).reduce((s, r) => s + r.amount, 0);
  const operasi = toRows(buckets.operasi), investasi = toRows(buckets.investasi), pendanaan = toRows(buckets.pendanaan);
  const totOperasi = sum(buckets.operasi), totInvestasi = sum(buckets.investasi), totPendanaan = sum(buckets.pendanaan);
  const kenaikanBersih = totOperasi + totInvestasi + totPendanaan;
  return {
    operasi, investasi, pendanaan,
    totOperasi, totInvestasi, totPendanaan,
    kenaikanBersih, kasAwal, kasAkhir,
    cocok: Math.abs((kasAwal + kenaikanBersih) - kasAkhir) < 0.01
  };
}

// ---------- LAPORAN PERUBAHAN EKUITAS ----------
function prevDay(dateStr) {
  if (!dateStr) return null;
  const t = Date.parse(dateStr + 'T00:00:00Z');
  if (isNaN(t)) return null;
  return new Date(t - 864e5).toISOString().slice(0, 10);
}
function equityStatement(companyId, from, to) {
  const accs = accountsOf(companyId).filter(a => a.category === 'EKUITAS');
  const accBefore = accumulate(companyId, before(from));      // saldo akun ekuitas sebelum 'from'
  const accPeriod = accumulate(companyId, inRange(from, to)); // mutasi selama periode
  const accThru = accumulate(companyId, upTo(to));            // saldo akhir
  const akun = [];
  let awalAkun = 0, akhirAkun = 0, setoran = 0, prive = 0;
  for (const a of accs.sort((x, y) => x.code.localeCompare(y.code))) {
    const awal = contrib(accBefore, a);
    const akhir = contrib(accThru, a);
    const perubahan = contrib(accPeriod, a);
    if (awal === 0 && akhir === 0 && perubahan === 0) continue;
    akun.push({ code: a.code, name: a.name, awal, perubahan, akhir });
    awalAkun += awal; akhirAkun += akhir;
    if (perubahan >= 0) setoran += perubahan; else prive += -perubahan;
  }
  // Saldo laba (laba ditahan) implisit: akumulasi laba bersih sebelum 'from' + laba periode berjalan
  const labaDitahanAwal = incomeStatement(companyId, null, from ? prevDay(from) : null).labaBersih;
  const labaBersih = incomeStatement(companyId, from, to).labaBersih;
  const labaDitahanAkhir = labaDitahanAwal + labaBersih;
  const ekuitasAwal = awalAkun + labaDitahanAwal;
  const ekuitasAkhir = akhirAkun + labaDitahanAkhir;
  return {
    from, to, akun,
    labaDitahan: { awal: labaDitahanAwal, tambah: labaBersih, akhir: labaDitahanAkhir },
    ekuitasAwal, labaBersih, setoran, prive, ekuitasAkhir,
    seimbang: Math.abs(ekuitasAwal + labaBersih + (setoran - prive) - ekuitasAkhir) < 0.01
  };
}

// ---------- ANGGARAN ----------
function budgetForRange(companyId, from, to) {
  // budget disimpan per (companyId, year, accountCode) dengan 12 nilai bulanan
  const res = {}; // code -> amount
  const fromM = from ? from.slice(0, 7) : '0000-00';
  const toM = to ? to.slice(0, 7) : '9999-99';
  for (const b of db().budgets.filter(x => x.companyId === companyId)) {
    const amounts = b.amounts || [];
    for (let m = 0; m < 12; m++) {
      const ym = `${b.year}-${String(m + 1).padStart(2, '0')}`;
      if (ym >= fromM && ym <= toM) {
        res[b.accountCode] = (res[b.accountCode] || 0) + (Number(amounts[m]) || 0);
      }
    }
  }
  return res;
}

// ---------- ANALISIS VARIANS ----------
function variance(companyId, from, to, mode, cmpFrom, cmpTo) {
  const cur = incomeStatement(companyId, from, to);
  const map = accountMap(companyId);
  let base = {}; let baseLabel = '';
  if (mode === 'anggaran') {
    base = budgetForRange(companyId, from, to);
    baseLabel = 'Anggaran';
  } else {
    const cmp = incomeStatement(companyId, cmpFrom, cmpTo);
    base = cmp.flat;
    baseLabel = 'Periode Pembanding';
  }
  const codes = new Set([...Object.keys(cur.flat), ...Object.keys(base)]);
  const rows = [];
  for (const code of codes) {
    const a = map[code];
    if (!a) continue;
    if (a.category !== 'PENDAPATAN' && a.category !== 'BEBAN') continue;
    const aktual = cur.flat[code] || 0;
    const pembanding = base[code] || 0;
    if (aktual === 0 && pembanding === 0) continue;
    const selisih = aktual - pembanding;
    const persen = pembanding !== 0 ? (selisih / Math.abs(pembanding)) * 100 : (aktual !== 0 ? 100 : 0);
    // favorable/unfavorable: pendapatan naik = baik; beban naik = buruk
    const good = a.category === 'PENDAPATAN' ? selisih >= 0 : selisih <= 0;
    rows.push({
      code, name: a.name, category: a.category, subcategory: a.subcategory,
      aktual, pembanding, selisih, persen,
      arah: good ? 'Menguntungkan' : 'Merugikan'
    });
  }
  rows.sort((x, y) => Math.abs(y.selisih) - Math.abs(x.selisih));
  return { baseLabel, rows, ringkasan: { labaAktual: cur.labaBersih } };
}

module.exports = {
  accountsOf, accountMap, journalsOf, postedJournalsOf, isPosted, trialBalance, ledger,
  incomeStatement, balanceSheet, cashFlow, equityStatement, budgetForRange, variance
};
