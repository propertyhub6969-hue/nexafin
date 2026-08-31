'use strict';
/*
 * Modul impor: membaca file rekening koran / daftar transaksi (CSV atau Excel .xlsx)
 * dan menormalkannya menjadi daftar transaksi terstruktur:
 *   { tanggal:'YYYY-MM-DD', keterangan, nominal:Number(>0), arah:'masuk'|'keluar', saldo? }
 * Tanpa dependensi eksternal (CSV manual, XLSX via zlib bawaan).
 */
const zlib = require('zlib');

/* ---------- util angka & tanggal ---------- */
function parseAmount(raw) {
  if (raw == null) return { value: 0, sign: 1 };
  let s = String(raw).trim();
  if (!s) return { value: 0, sign: 1 };
  let sign = 1;
  // penanda arah di dalam sel
  if (/(^|\s)(db|dr|debet|debit|keluar)(\s|$)/i.test(s)) sign = -1;
  if (/(^|\s)(cr|kredit|credit|masuk)(\s|$)/i.test(s)) sign = 1;
  if (/^\(.*\)$/.test(s)) sign = -1;           // (123) = negatif
  if (/-\s*$/.test(s) || /^-/.test(s)) sign = -1;
  s = s.replace(/rp/ig, '').replace(/[^\d,.\-]/g, ''); // buang huruf/simbol
  s = s.replace(/^-/, '').replace(/-$/, '');
  if (!s) return { value: 0, sign };
  const hasDot = s.indexOf('.') > -1, hasComma = s.indexOf(',') > -1;
  if (hasDot && hasComma) {
    // format Indonesia: 1.234.567,89  → titik ribuan, koma desimal
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, ''); // format 1,234,567.89
  } else if (hasComma) {
    const after = s.split(',')[1] || '';
    if (after.length === 2) s = s.replace(',', '.'); // desimal
    else s = s.replace(/,/g, '');                     // ribuan
  } else {
    // hanya titik: bisa ribuan (1.000.000) atau desimal (1000.50)
    const parts = s.split('.');
    if (parts.length > 2 || (parts[1] && parts[1].length === 3)) s = s.replace(/\./g, '');
  }
  const v = parseFloat(s);
  return { value: isNaN(v) ? 0 : Math.abs(v), sign };
}

const BULAN = { jan:1, feb:2, mar:3, apr:4, mei:5, may:5, jun:6, jul:7, agu:8, aug:8, agt:8, sep:9, okt:10, oct:10, nov:11, des:12, dec:12 };
function parseDate(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  // sudah ISO
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  // DD/MM/YYYY atau DD-MM-YYYY
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (m) {
    let [_, d, mo, y] = m; if (y.length === 2) y = '20' + y;
    return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  // DD MMM YYYY (mis. 05 Agu 2026 / 5 Aug 26)
  m = s.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,})[\s-]+(\d{2,4})/);
  if (m) {
    let [_, d, mon, y] = m; if (y.length === 2) y = '20' + y;
    const mo = BULAN[mon.slice(0,3).toLowerCase()];
    if (mo) return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  // fallback: Date.parse
  const t = Date.parse(s);
  if (!isNaN(t)) { const dt = new Date(t); return dt.toISOString().slice(0,10); }
  return null;
}

/* ---------- CSV ---------- */
function detectDelim(text) {
  const line = (text.split(/\r?\n/).find(l => l.trim()) || '');
  const counts = { ';': (line.match(/;/g)||[]).length, ',': (line.match(/,/g)||[]).length, '\t': (line.match(/\t/g)||[]).length };
  let best = ',', n = -1;
  for (const d of [';', ',', '\t']) if (counts[d] > n) { n = counts[d]; best = d; }
  return best;
}
function parseCSVLine(line, delim) {
  const out = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') { if (line[i+1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === delim) { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out.map(x => x.trim());
}
function parseCSV(text) {
  const delim = detectDelim(text);
  return text.split(/\r?\n/).filter(l => l.trim() !== '').map(l => parseCSVLine(l, delim));
}

/* ---------- XLSX minimal (baca sheet pertama) ---------- */
function readZipEntries(buf) {
  // cari End Of Central Directory
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('File Excel tidak valid.');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = {};
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    // header lokal
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.slice(dataStart, dataStart + compSize);
    let content;
    try { content = method === 8 ? zlib.inflateRawSync(raw) : raw; }
    catch (e) { content = Buffer.alloc(0); }
    entries[name] = content.toString('utf8');
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}
function colToIndex(ref) { // 'B' -> 1
  const m = ref.match(/^([A-Z]+)/); if (!m) return 0;
  let n = 0; for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
function readXlsx(buf) {
  const entries = readZipEntries(buf);
  // shared strings
  const shared = [];
  const ss = entries['xl/sharedStrings.xml'];
  if (ss) {
    const siRe = /<si>([\s\S]*?)<\/si>/g; let m;
    while ((m = siRe.exec(ss))) {
      const texts = []; const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g; let t;
      while ((t = tRe.exec(m[1]))) texts.push(t[1]);
      shared.push(unescapeXml(texts.join('')));
    }
  }
  // sheet pertama
  let sheetXml = entries['xl/worksheets/sheet1.xml'];
  if (!sheetXml) { const k = Object.keys(entries).find(x => /^xl\/worksheets\/.*\.xml$/.test(x)); sheetXml = k ? entries[k] : ''; }
  if (!sheetXml) throw new Error('Sheet tidak ditemukan di file Excel.');
  const rows = [];
  const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g; let r;
  while ((r = rowRe.exec(sheetXml))) {
    const cells = []; const cRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let c;
    while ((c = cRe.exec(r[1]))) {
      const attrs = c[1] || ''; const inner = c[2] || '';
      const refM = attrs.match(/\br="([A-Z]+)\d+"/); if (!refM) continue;
      const idx = colToIndex(refM[1]);
      const typeM = attrs.match(/\bt="([^"]+)"/); const type = typeM ? typeM[1] : '';
      let val = '';
      const vm = inner.match(/<v>([\s\S]*?)<\/v>/);
      const ism = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
      if (type === 's' && vm) val = shared[parseInt(vm[1], 10)] || '';   // shared string
      else if (ism) val = unescapeXml(ism[1]);                            // inlineStr / str
      else if (vm) val = vm[1];                                          // numeric
      cells[idx] = val;
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = '';
    rows.push(cells);
  }
  return rows;
}
function unescapeXml(s) {
  return String(s).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
}

/* ---------- normalisasi baris → transaksi ---------- */
function findHeader(rows) {
  const kw = ['tanggal','tgl','date','keterangan','uraian','deskripsi','description','debit','debet','kredit','credit','mutasi','jumlah','nominal','amount','saldo','balance'];
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const low = rows[i].map(c => String(c).toLowerCase());
    const hit = low.filter(c => kw.some(k => c.includes(k))).length;
    if (hit >= 2) return i;
  }
  return -1;
}
function mapColumns(header) {
  const find = (keys) => {
    for (let i = 0; i < header.length; i++) {
      const h = String(header[i]).toLowerCase();
      if (keys.some(k => h.includes(k))) return i;
    }
    return -1;
  };
  return {
    date: find(['tanggal','tgl','date','waktu']),
    desc: find(['keterangan','uraian','deskripsi','description','berita','narasi','catatan','remark','transaksi']),
    debit: find(['debit','debet','keluar','withdrawal','pengeluaran']),
    kredit: find(['kredit','credit','masuk','deposit','penerimaan','pemasukan']),
    amount: find(['mutasi','jumlah','nominal','amount','nilai']),
    tipe: find(['dk','d/k','tipe','jenis']),
    saldo: find(['saldo','balance'])
  };
}
function normalize(rows) {
  const hi = findHeader(rows);
  const transaksi = [];
  const warnings = [];
  if (hi < 0) {
    warnings.push('Baris judul kolom tidak terdeteksi otomatis. Pastikan file berisi kolom Tanggal, Keterangan, dan nominal (Debit/Kredit atau Jumlah).');
    return { transaksi, warnings };
  }
  const cols = mapColumns(rows[hi]);
  for (let i = hi + 1; i < rows.length; i++) {
    const row = rows[i];
    const tgl = cols.date >= 0 ? parseDate(row[cols.date]) : null;
    const ket = cols.desc >= 0 ? String(row[cols.desc] || '').trim() : '';
    let nominal = 0, arah = null;
    if (cols.debit >= 0 || cols.kredit >= 0) {
      const d = cols.debit >= 0 ? parseAmount(row[cols.debit]).value : 0;
      const k = cols.kredit >= 0 ? parseAmount(row[cols.kredit]).value : 0;
      if (k > 0) { nominal = k; arah = 'masuk'; }
      else if (d > 0) { nominal = d; arah = 'keluar'; }
    } else if (cols.amount >= 0) {
      const p = parseAmount(row[cols.amount]);
      nominal = p.value;
      let sign = p.sign;
      if (cols.tipe >= 0) {
        const t = String(row[cols.tipe] || '').toLowerCase();
        if (/d|debet|debit|k(eluar)?/.test(t) && !/cr|kredit/.test(t)) sign = -1;
        if (/c|cr|kredit|credit|m(asuk)?/.test(t)) sign = 1;
      }
      arah = sign < 0 ? 'keluar' : 'masuk';
    }
    if (!tgl || !nominal) continue; // lewati baris tak valid / saldo awal
    transaksi.push({ tanggal: tgl, keterangan: ket || '(tanpa keterangan)', nominal, arah,
      saldo: cols.saldo >= 0 ? parseAmount(row[cols.saldo]).value : null });
  }
  if (!transaksi.length) warnings.push('Tidak ada transaksi terbaca. Cek apakah kolom nominal (Debit/Kredit/Jumlah) terisi.');
  return { transaksi, warnings };
}

/* ---------- API modul ---------- */
function importFromCSV(text) { return normalize(parseCSV(text)); }
function importFromXlsx(buffer) { return normalize(readXlsx(buffer)); }

module.exports = { importFromCSV, importFromXlsx, parseCSV, readXlsx, parseAmount, parseDate, normalize };
