'use strict';
/*
 * Integrasi AI (Anthropic Claude) via modul https bawaan — tanpa dependensi.
 * Dipakai untuk:
 *  - OCR/ekstraksi nota, struk, invoice (gambar & PDF) menjadi data transaksi terstruktur.
 *  - Menghasilkan insight naratif dari ringkasan laporan keuangan.
 * Kunci API & model diambil dari setelan (dikelola admin). Bila kunci kosong,
 * fungsi melempar error yang jelas sehingga fitur AI cukup "mati" tanpa merusak app.
 */
const https = require('https');

function requestClaude({ key, model, system, messages, max_tokens }) {
  return new Promise((resolve, reject) => {
    if (!key) return reject(new Error('Kunci API AI belum diisi. Buka menu Setelan AI (khusus admin) untuk mengisinya.'));
    const payload = JSON.stringify({
      model: model || 'claude-3-5-sonnet-latest',
      max_tokens: max_tokens || 1500,
      system: system || undefined,
      messages
    });
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (res.statusCode >= 400) {
            const msg = (j.error && j.error.message) || `HTTP ${res.statusCode}`;
            return reject(new Error('AI: ' + msg));
          }
          const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
          resolve({ text, raw: j });
        } catch (e) { reject(new Error('AI: respons tidak dapat dibaca (' + e.message + ')')); }
      });
    });
    req.on('error', (e) => reject(new Error('AI: gagal menghubungi layanan (' + e.message + '). Pastikan komputer terhubung internet.')));
    req.write(payload);
    req.end();
  });
}

function extractJSON(text) {
  if (!text) return null;
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a > -1 && b > a) s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch (e) { return null; }
}

/* OCR / ekstraksi dokumen (gambar atau PDF) → data transaksi */
async function extractDocument({ key, model, base64, mediaType }) {
  const isPdf = /pdf/i.test(mediaType);
  const block = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: base64 } };
  const instruksi =
`Anda asisten akuntansi Indonesia. Baca dokumen (nota/struk/invoice/faktur) berikut dan keluarkan HANYA JSON valid (tanpa penjelasan) dengan struktur:
{
 "jenis": "invoice|struk|nota|kwitansi|lainnya",
 "vendor": "nama penjual/toko",
 "tanggal": "YYYY-MM-DD",
 "mata_uang": "IDR",
 "subtotal": angka,
 "pajak": angka,
 "total": angka,
 "arah": "keluar",
 "keterangan": "ringkasan singkat transaksi",
 "kategori_saran": "salah satu: Pembelian/HPP, Beban Operasional, Beban Pemasaran, Beban Transportasi, Beban Perlengkapan, Beban Listrik/Air/Telepon, Beban Sewa, Beban Gaji, Aset Tetap, Lainnya",
 "items": [ { "nama": "...", "qty": angka, "harga": angka, "jumlah": angka } ]
}
Aturan: gunakan angka tanpa pemisah ribuan (contoh 150000, bukan 150.000). Jika suatu nilai tidak ada, isi 0 atau "". Nota pembelian/pengeluaran arah "keluar".`;
  const { text, raw } = await requestClaude({
    key, model, max_tokens: 1500,
    messages: [{ role: 'user', content: [block, { type: 'text', text: instruksi }] }]
  });
  const data = extractJSON(text);
  if (!data) throw new Error('AI tidak mengembalikan data terstruktur. Coba foto yang lebih jelas.');
  return data;
}

/* Insight naratif dari ringkasan laporan */
async function generateInsight({ key, model, ringkasan }) {
  const instruksi =
`Anda analis keuangan untuk UMKM Indonesia. Berdasarkan DATA ringkasan keuangan (JSON) berikut, tulis analisis singkat dalam Bahasa Indonesia yang mudah dipahami pemilik usaha. Fokus pada INSIGHT dan SARAN, bukan sekadar mengulang angka.

Format keluaran (gunakan judul tebal Markdown):
**Ringkasan Kinerja** — 2-3 kalimat kondisi umum.
**Sorotan Penting** — 3-5 poin (perubahan/rasio penting, margin, beban terbesar, tren).
**Potensi Masalah / Anomali** — hal yang perlu diperhatikan (arus kas, beban naik, dll).
**Rekomendasi** — 2-4 langkah konkret yang bisa dilakukan.

DATA:
${JSON.stringify(ringkasan)}`;
  const { text } = await requestClaude({
    key, model, max_tokens: 1600,
    system: 'Anda analis keuangan berpengalaman, ringkas, jujur, dan praktis. Jangan mengarang angka di luar data.',
    messages: [{ role: 'user', content: [{ type: 'text', text: instruksi }] }]
  });
  return text;
}

module.exports = { requestClaude, extractDocument, generateInsight, extractJSON };
