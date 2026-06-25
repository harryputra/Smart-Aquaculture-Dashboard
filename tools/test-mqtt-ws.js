#!/usr/bin/env node
/* ======================================================================
 *  Uji komunikasi MQTT over WebSocket (WSS) — end-to-end
 *  Mensimulasikan persis jalur yang dipakai ESP32: konek wss via Cloudflare,
 *  publish status, lalu terima kembali (subscribe) → bukti pipeline sehat.
 *
 *  Cara pakai (dari laptop/Windows yang ada Node.js):
 *     cd tools
 *     npm install                      # sekali (mengunduh paket mqtt)
 *     node test-mqtt-ws.js <password>  # password = MQTT_PASSWORD asli di server
 *
 *  Contoh:  node test-mqtt-ws.js aquaculture123
 *  (Jika password server masih default aquaculture123, cukup: node test-mqtt-ws.js)
 *
 *  Lintas-OS — TIDAK perlu syntax "VAR=nilai node ..." (itu cuma utk bash/Linux).
 *  Di PowerShell pakai argumen di atas, atau set dulu:
 *     $env:MQTT_PASSWORD="aquaculture123"; node test-mqtt-ws.js
 *
 *  Argumen / env (env menang bila keduanya diisi):
 *     argv[2] = password   argv[3] = MQTT_URL   argv[4] = DEVICE_ID
 *     MQTT_URL (default wss://mqtt.trin-polman.id:443/), MQTT_USER (aquaculture),
 *     MQTT_PASSWORD (aquaculture123), DEVICE_ID (test_ws_01)
 * ====================================================================== */
const mqtt = require('mqtt');

const URL      = process.env.MQTT_URL      || process.argv[3] || 'wss://mqtt.trin-polman.id:443/';
const USER     = process.env.MQTT_USER     || 'aquaculture';
const PASSWORD = process.env.MQTT_PASSWORD || process.argv[2] || 'aquaculture123';
const DEVICE   = process.env.DEVICE_ID     || process.argv[4] || 'test_ws_01';
const TOPIC    = 'lele/device/status';

console.log('──────────────────────────────────────────────');
console.log(' Uji MQTT over WebSocket (WSS)');
console.log('──────────────────────────────────────────────');
console.log(' URL  :', URL);
console.log(' User :', USER);
console.log(' Pass :', PASSWORD ? '(terisi)' : '(KOSONG!)');
console.log(' Topik:', TOPIC, '\n');

const client = mqtt.connect(URL, {
  username: USER,
  password: PASSWORD,
  clientId: 'tester_' + Math.random().toString(16).slice(2, 8),
  connectTimeout: 10000,
  reconnectPeriod: 0,           // jangan loop reconnect saat uji
  protocolVersion: 4,
});

let received = false;

const timer = setTimeout(() => {
  if (!received) {
    fail('Timeout 12 dtk: terhubung? tidak ada pesan balik. '
       + 'Cek subscribe/izin topik atau koneksi terputus.');
  }
}, 12000);

client.on('connect', () => {
  console.log('✅ [1/3] TERHUBUNG ke broker via WSS.');
  client.subscribe(TOPIC, (err) => {
    if (err) return fail('Gagal subscribe: ' + err.message);
    console.log('✅ [2/3] Subscribe', TOPIC);
    const payload = JSON.stringify({
      device_id: DEVICE, wifi_connected: true, mqtt_connected: true,
      rtc_ok: true, fish_count: 1000, avg_fish_g: 120, feeding_per_day: 2,
    });
    client.publish(TOPIC, payload, (e) => {
      if (e) return fail('Gagal publish: ' + e.message);
      console.log('📤 Publish status uji (device_id=' + DEVICE + ')');
    });
  });
});

client.on('message', (topic, msg) => {
  received = true;
  clearTimeout(timer);
  console.log('✅ [3/3] Pesan diterima [' + topic + ']:');
  console.log('        ' + msg.toString().slice(0, 160));
  console.log('\n🎉 SUKSES — komunikasi WSS publish & subscribe BERJALAN.');
  console.log('   Broker + Cloudflare Tunnel sehat. ESP32 dgn config sama akan konek.');
  console.log('   Cek dashboard: menu perangkat lele, atau /api/lele/devices');
  client.end(true, () => process.exit(0));
});

client.on('error', (e) => fail(e.message));
client.on('close', () => { if (!received) { /* biarkan timeout/​error yang lapor */ } });

function fail(m) {
  clearTimeout(timer);
  console.error('\n❌ GAGAL: ' + m);
  console.error('   Petunjuk:');
  console.error('   - "Connection refused/timeout" → port 9001 belum dipublish / Cloudflare Public Hostname salah');
  console.error('   - "Not authorized / bad username or password" → MQTT_PASSWORD salah (cek grep MQTT_PASSWORD .env di server)');
  console.error('   - "Unexpected server response: 4xx/5xx" → handshake WS ditolak (path harus "/", Service Cloudflare HTTP→localhost:9001)');
  try { client.end(true); } catch (_) {}
  process.exit(1);
}
