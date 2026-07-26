/**
 * Tuya CCTV — uji kelayakan sebelum membangun fitur.
 * Membuktikan: (1) kredensial project valid → dapat token, (2) device kamera
 * bisa di-"allocate" → mengembalikan URL HLS/RTSP yang bisa diputar.
 *
 * TIDAK butuh dependensi (pakai modul bawaan Node: https + crypto).
 * Jalankan LOKAL (mesin yang ada Node), JANGAN taruh secret di kode/git.
 *
 * PowerShell:
 *   $env:TUYA_ACCESS_ID="xxxx"
 *   $env:TUYA_ACCESS_SECRET="xxxx"
 *   $env:TUYA_BASE="https://openapi.tuyaus.com"   # sesuaikan Data Center project
 *   $env:TUYA_DEVICE_ID="xxxxxxxx"                 # device_id kamera (dari Tuya IoT)
 *   node backend/scripts/tuya-cctv-test.js
 *
 * Untuk menemukan device_id: set TUYA_UID (uid akun tertaut), kosongkan
 * TUYA_DEVICE_ID → skrip akan MENDAFTAR device milik akun itu.
 *
 * Data Center (TUYA_BASE):
 *   China            https://openapi.tuyacn.com
 *   Western America  https://openapi.tuyaus.com
 *   Eastern America  https://openapi-ueaz.tuyaus.com
 *   Central Europe   https://openapi.tuyaeu.com
 *   Western Europe   https://openapi-weaz.tuyaeu.com
 *   India            https://openapi.tuyain.com
 */
'use strict';
const crypto = require('crypto');
const https = require('https');

const ACCESS_ID     = process.env.TUYA_ACCESS_ID || '';
const ACCESS_SECRET = process.env.TUYA_ACCESS_SECRET || '';
const BASE          = (process.env.TUYA_BASE || 'https://openapi.tuyaus.com').replace(/\/$/, '');
const DEVICE_ID     = process.env.TUYA_DEVICE_ID || '';
const UID           = process.env.TUYA_UID || '';
const TYPE          = (process.env.TUYA_TYPE || 'hls').toLowerCase(); // hls | rtsp

if (!ACCESS_ID || !ACCESS_SECRET) {
  console.error('✖ Set TUYA_ACCESS_ID dan TUYA_ACCESS_SECRET dulu. Lihat komentar di atas file ini.');
  process.exit(1);
}

const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const hmac   = (s) => crypto.createHmac('sha256', ACCESS_SECRET).update(s, 'utf8').digest('hex').toUpperCase();

// Tanda tangan Tuya v2: str = client_id [+access_token] + t + nonce + stringToSign
// stringToSign = METHOD \n SHA256(body) \n (signature-headers kosong) \n path
function signedRequest(method, path, { token = '', body = '' } = {}) {
  return new Promise((resolve, reject) => {
    const t = Date.now().toString();
    const nonce = crypto.randomBytes(16).toString('hex');
    const stringToSign = `${method}\n${sha256(body || '')}\n\n${path}`;
    const str = ACCESS_ID + (token || '') + t + nonce + stringToSign;
    const headers = {
      'client_id': ACCESS_ID,
      'sign': hmac(str),
      't': t,
      'nonce': nonce,
      'sign_method': 'HMAC-SHA256',
      'Content-Type': 'application/json',
    };
    if (token) headers['access_token'] = token;

    const u = new URL(BASE + path);
    const req = https.request(
      { method, hostname: u.hostname, path: u.pathname + u.search, headers, timeout: 20000 },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch (_) { reject(new Error('Respons non-JSON: ' + d.slice(0, 300))); } });
      }
    );
    req.on('timeout', () => req.destroy(new Error('Timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  try {
    console.log(`→ Data Center: ${BASE}`);
    // 1) TOKEN
    const tok = await signedRequest('GET', '/v1.0/token?grant_type=1');
    if (!tok.success) {
      console.error('✖ Gagal ambil token:', JSON.stringify(tok));
      console.error('  Cek: Access ID/Secret benar? Data Center (TUYA_BASE) sesuai project?');
      process.exit(1);
    }
    const token = tok.result.access_token;
    console.log('✓ Token OK');

    // 2) (opsional) DAFTAR DEVICE bila device_id belum diketahui
    if (!DEVICE_ID) {
      if (!UID) {
        console.log('\nℹ TUYA_DEVICE_ID kosong. Set TUYA_DEVICE_ID (dari Tuya IoT → Cloud → Devices),');
        console.log('  atau set TUYA_UID untuk mendaftar device akun tertaut.');
        process.exit(0);
      }
      const list = await signedRequest('GET', `/v1.0/users/${UID}/devices`, { token });
      if (!list.success) { console.error('✖ Gagal daftar device:', JSON.stringify(list)); process.exit(1); }
      console.log(`\n✓ Device milik uid ${UID}:`);
      for (const d of list.result || []) {
        console.log(`  - ${d.id}  | ${d.name}  | category=${d.category}  | online=${d.online}`);
      }
      console.log('\nSalin device_id kamera (category biasanya "sp" / "dghsxj" utk IPC) ke TUYA_DEVICE_ID lalu jalankan lagi.');
      process.exit(0);
    }

    // 3) ALLOCATE STREAM → URL HLS/RTSP
    const body = JSON.stringify({ type: TYPE });
    const alloc = await signedRequest('POST', `/v1.0/devices/${DEVICE_ID}/stream/actions/allocate`, { token, body });
    if (!alloc.success) {
      console.error('✖ Gagal allocate stream:', JSON.stringify(alloc));
      console.error('  Cek: device_id benar & online? API product "IoT Video Live Stream" sudah di-subscribe di project?');
      process.exit(1);
    }
    console.log(`\n✓ BERHASIL — URL ${TYPE.toUpperCase()} (sementara/expired):`);
    console.log('  ' + alloc.result.url);
    console.log('\nUji putar: buka URL .m3u8 di VLC (Media → Open Network Stream),');
    console.log('atau nanti kita embed via hls.js di dashboard. Kalau ini jalan → fitur CCTV siap dibangun.');
  } catch (e) {
    console.error('✖ Error:', e.message);
    process.exit(1);
  }
})();
