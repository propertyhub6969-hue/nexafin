'use strict';
/*
 * PPh 21 — Tarif Efektif Rata-rata (TER) bulanan PP 58/2023 + generator XML
 * impor Coretax (skema MmPayrollBulk).
 *
 * Tabel TER A/B/C diambil PERSIS dari formula Excel Coretax milik pengguna
 * (sheet DATA, kolom P/Q/R) — jadi 1:1 dengan yang dipakai di lapangan.
 * Tiap tabel = daftar [batas_atas_bruto, tarif_persen]; cari entri pertama
 * yang bruto <= batas_atas. Di atas batas terakhir = 34%.
 */

const TER_A = [
  [5400000,0],[5650000,0.25],[5950000,0.5],[6300000,0.75],[6750000,1],
  [7500000,1.25],[8550000,1.5],[9650000,1.75],[10050000,2],[10350000,2.25],
  [10700000,2.5],[11050000,3],[11600000,3.5],[12500000,4],[13750000,5],
  [15100000,6],[16950000,7],[19750000,8],[24150000,9],[26450000,10],
  [28000000,11],[30050000,12],[32400000,13],[35400000,14],[39100000,15],
  [43850000,16],[47800000,17],[51400000,18],[56300000,19],[62200000,20],
  [68600000,21],[77500000,22],[89000000,23],[103000000,24],[125000000,25],
  [157000000,26],[206000000,27],[337000000,28],[454000000,29],[550000000,30],
  [695000000,31],[910000000,32],[1400000000,33]
];
const TER_B = [
  [6200000,0],[6500000,0.25],[6850000,0.5],[7300000,0.75],[9200000,1],
  [10750000,1.5],[11250000,2],[11600000,2.5],[12600000,3],[13600000,4],
  [14950000,5],[16400000,6],[18450000,7],[21850000,8],[26000000,9],
  [27700000,10],[29350000,11],[31450000,12],[33950000,13],[37100000,14],
  [41100000,15],[45800000,16],[49500000,17],[53800000,18],[58500000,19],
  [64000000,20],[71000000,21],[80000000,22],[93000000,23],[109000000,24],
  [129000000,25],[163000000,26],[211000000,27],[374000000,28],[459000000,29],
  [555000000,30],[704000000,31],[957000000,32],[1405000000,33]
];
const TER_C = [
  [6600000,0],[6950000,0.25],[7350000,0.5],[7800000,0.75],[8850000,1],
  [9800000,1.25],[10950000,1.5],[11200000,1.75],[12050000,2],[12950000,3],
  [14150000,4],[15550000,5],[17050000,6],[19500000,7],[22700000,8],
  [26600000,9],[28100000,10],[30100000,11],[32600000,12],[35400000,13],
  [38900000,14],[43000000,15],[47400000,16],[51200000,17],[55800000,18],
  [60400000,19],[66700000,20],[74500000,21],[83200000,22],[95600000,23],
  [110000000,24],[134000000,25],[169000000,26],[221000000,27],[390000000,28],
  [463000000,29],[561000000,30],[709000000,31],[965000000,32],[1419000000,33]
];

const CAT_A = ['TK/0','TK/1','K/0','HB/0','HB/1'];
const CAT_B = ['TK/2','TK/3','K/1','K/2','HB/2','HB/3'];

function terCategory(ptkp) {
  const s = String(ptkp || '').toUpperCase().trim();
  if (CAT_A.includes(s)) return 'A';
  if (CAT_B.includes(s)) return 'B';
  return 'C'; // K/3 (dan default)
}

/** Tarif TER (%) dari status PTKP + penghasilan bruto bulanan. */
function terRate(ptkp, bruto) {
  const b = Number(bruto) || 0;
  const tbl = terCategory(ptkp) === 'A' ? TER_A : terCategory(ptkp) === 'B' ? TER_B : TER_C;
  for (const [batas, tarif] of tbl) if (b <= batas) return tarif;
  return 34;
}

function escXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
/** Angka tarif: integer tanpa desimal, pecahan pakai titik (mis. 1.25). */
function fmtRate(r) { const n = Number(r) || 0; return (Math.round(n * 100) / 100).toString(); }

/**
 * Bangun XML impor Coretax (MmPayrollBulk).
 * header: { tin, idTku, month, year, withholdingDate }  (withholdingDate = 'YYYY-MM-DD')
 * rows:   [{ nik, passport?, opt?, ptkp, position, cert?, objectCode?, gross, rate? }]
 *   rate opsional → kalau kosong dihitung otomatis dari TER.
 */
function generateCoretaxXml(header, rows) {
  const h = header || {};
  const tin = escXml(h.tin || '');
  const idTku = escXml(h.idTku || (h.tin ? h.tin + '000000' : ''));
  const month = String(Number(h.month) || '');
  const year = String(Number(h.year) || '');
  const wdate = escXml(h.withholdingDate || '');
  const items = (rows || []).map(r => {
    const opt = escXml(r.opt || 'Resident');
    const pass = r.passport ? `<CounterpartPassport>${escXml(r.passport)}</CounterpartPassport>`
                            : `<CounterpartPassport xsi:nil="true"/>`;
    const ptkp = escXml(r.ptkp || '');
    const rate = (r.rate === undefined || r.rate === null || r.rate === '')
      ? terRate(r.ptkp, r.gross) : Number(r.rate);
    return `\t\t<MmPayroll>
\t\t\t<TaxPeriodMonth>${month}</TaxPeriodMonth>
\t\t\t<TaxPeriodYear>${year}</TaxPeriodYear>
\t\t\t<CounterpartOpt>${opt}</CounterpartOpt>
\t\t\t${pass}
\t\t\t<CounterpartTin>${escXml(r.nik || '')}</CounterpartTin>
\t\t\t<StatusTaxExemption>${ptkp}</StatusTaxExemption>
\t\t\t<Position>${escXml(r.position || '')}</Position>
\t\t\t<TaxCertificate>${escXml(r.cert || 'N/A')}</TaxCertificate>
\t\t\t<TaxObjectCode>${escXml(r.objectCode || '21-100-01')}</TaxObjectCode>
\t\t\t<Gross>${Math.round(Number(r.gross) || 0)}</Gross>
\t\t\t<Rate>${fmtRate(rate)}</Rate>
\t\t\t<IDPlaceOfBusinessActivity>${idTku}</IDPlaceOfBusinessActivity>
\t\t\t<WithholdingDate>${wdate}</WithholdingDate>
\t\t</MmPayroll>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<MmPayrollBulk xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
\t<TIN>${tin}</TIN>
\t<ListOfMmPayroll>
${items}
\t</ListOfMmPayroll>
</MmPayrollBulk>`;
}

module.exports = { TER_A, TER_B, TER_C, terCategory, terRate, generateCoretaxXml, fmtRate };
