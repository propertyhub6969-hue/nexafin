'use strict';
/*
 * Autentikasi tanpa dependensi eksternal.
 * - Password di-hash dengan scrypt (modul crypto bawaan Node.js).
 * - Sesi memakai token bertanda tangan (HMAC-SHA256), disimpan di cookie httpOnly.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./paths');

const SECRET_FILE = path.join(DATA_DIR, '.secret');

// Rahasia untuk menandatangani token; dibuat sekali & disimpan.
function getSecret() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(SECRET_FILE)) return fs.readFileSync(SECRET_FILE, 'utf8').trim();
    const s = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(SECRET_FILE, s, 'utf8');
    return s;
  } catch (e) {
    // fallback (tidak persisten) bila gagal menulis
    return process.env.APP_SECRET || 'ubah-rahasia-ini-di-produksi';
  }
}
const SECRET = getSecret();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash: derived };
}

// Rate limit brute-force per akun (kunci = salt, unik per user).
// Maks 8 kegagalan / 15 menit → tolak 15 menit. In-memory (reset saat restart) — cukup
// menahan tebak-password online; log ke stdout = jejak audit login (docker logs).
const _fail = new Map(); // key -> { n, until }
const FAIL_MAX = 8, FAIL_WINDOW_MS = 15 * 60 * 1000;
function _failKey(salt) { return String(salt).slice(0, 12); }

function verifyPassword(password, salt, hash) {
  const key = _failKey(salt);
  const now = Date.now();
  const rec = _fail.get(key);
  if (rec && rec.until > now && rec.n >= FAIL_MAX) {
    console.log(`[auth] DITOLAK (terkunci ${Math.ceil((rec.until - now) / 60000)} mnt lagi) key=${key} ${new Date().toISOString()}`);
    return false;
  }
  let ok = false;
  try {
    const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
    const a = Buffer.from(derived, 'hex');
    const b = Buffer.from(hash, 'hex');
    ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) {
    ok = false;
  }
  if (ok) {
    _fail.delete(key);
    console.log(`[auth] login OK key=${key} ${new Date().toISOString()}`);
  } else {
    const r = rec && rec.until > now ? rec : { n: 0, until: 0 };
    r.n += 1; r.until = now + FAIL_WINDOW_MS;
    _fail.set(key, r);
    console.log(`[auth] login GAGAL (${r.n}/${FAIL_MAX}) key=${key} ${new Date().toISOString()}`);
    if (r.n === FAIL_MAX) console.log(`[auth] AKUN DIKUNCI 15 menit key=${key}`);
  }
  return ok;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf8');
}

// Token sederhana: payload.signature
function signToken(payload, maxAgeSec = 60 * 60 * 24 * 7) {
  const body = Object.assign({}, payload, { exp: Math.floor(Date.now() / 1000) + maxAgeSec });
  const data = b64url(JSON.stringify(body));
  const sig = b64url(crypto.createHmac('sha256', SECRET).update(data).digest());
  return data + '.' + sig;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') < 0) return null;
  const [data, sig] = token.split('.');
  const expected = b64url(crypto.createHmac('sha256', SECRET).update(data).digest());
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(data));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx > -1) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      if (k) out[k] = decodeURIComponent(v);
    }
  });
  return out;
}

const COOKIE_NAME = 'wa_sesi';

module.exports = {
  hashPassword, verifyPassword, signToken, verifyToken, parseCookies, COOKIE_NAME
};
