# 🌐 Panduan Lengkap: MQTT over WebSocket (WSS) untuk ESP32

Panduan ramah-pemula untuk menghubungkan **ESP32 pakan lele** di kolam yang
**jauh dari server** menggunakan **MQTT over WebSocket Secure (WSS)** lewat
**Cloudflare Tunnel** yang sudah Anda punya.

---

## 1. Kenapa WebSocket? (baca dulu, penting)

Device di kolam cuma punya WiFi internet biasa. Masalahnya:
- MQTT biasa pakai port **1883/8883** — banyak WiFi publik/kantor **memblokir** port ini.
- Server trin tidak punya IP publik; satu-satunya pintu dari internet adalah **Cloudflare Tunnel** (hanya HTTP/WebSocket).

**MQTT over WebSocket Secure** mengatasi keduanya:
- ✅ Jalan di **port 443** (port HTTPS) — hampir **selalu** dibuka WiFi mana pun.
- ✅ Lewat **Cloudflare Tunnel** yang sudah ada → **tidak perlu VPS**.
- ✅ TLS/enkripsi diurus **Cloudflare** → **tidak perlu kelola sertifikat** sendiri.
- ✅ Broker tetap **milik & di server Anda** (mosquitto di trin).

```
  ESP32 (kolam)                Cloudflare              Server trin
  ┌──────────┐   wss://...:443   ┌────────┐   http://localhost:9001  ┌───────────┐
  │ WiFi     │ ───────────────►  │ Tunnel │ ──────────────────────►  │ mosquitto │
  │ internet │   (TLS, port 443) │ (HTTPS)│   (WebSocket, lokal)     │  :9001 WS │
  └──────────┘                   └────────┘                          └─────┬─────┘
                                                                            │ 1883 (TCP, internal)
                                                                       ┌────▼─────┐
                                                                       │ backend  │ → Dashboard
                                                                       └──────────┘
```

> Backend tetap baca broker lokal lewat TCP 1883 (tidak berubah). ESP32 masuk
> lewat pintu WebSocket 9001 yang dipublish Cloudflare sebagai `wss://...:443`.

---

## 2. Sisi Server (sebagian besar SUDAH otomatis)

Yang sudah saya sesuaikan di repo:
- mosquitto sudah punya listener WebSocket (port **9001**).
- `./run.sh deploy` kini mem-publish `127.0.0.1:9001` agar Cloudflare bisa menjangkaunya.

Yang perlu **Anda** lakukan di server (sekali saja):

### 2a. Redeploy agar port WS aktif
```bash
cd ~/docker/apps/Smart-Aquaculture-Dashboard
git pull
./run.sh deploy
```

### 2b. Tambah Public Hostname di Cloudflare untuk WebSocket
Cloudflare dashboard → **Tunnels** → **proxmox-server** → **Public Hostname** →
**Add a public hostname**:

| Kolom | Isi |
|-------|-----|
| Subdomain | `mqtt` |
| Domain | `trin-polman.id` |
| Path | *(kosongkan)* |
| Service Type | `HTTP` |
| URL | `localhost:9001` |

Simpan. Hasil: `wss://mqtt.trin-polman.id` (port 443) → mosquitto WS.
Cloudflare meng-handle WebSocket & TLS otomatis (tak perlu setting tambahan).

> Pastikan kredensial MQTT sudah benar. Jika ganti `MQTT_PASSWORD` di `.env`,
> jalankan `./run.sh mqtt-passwd && ./run.sh prod-restart`.

### 2c. Uji dari komputer (tanpa ESP32) — pakai MQTTX
Install **MQTTX** (gratis, ada GUI) lalu buat koneksi:
- **Host**: `mqtt.trin-polman.id`
- **Protocol**: `wss`  •  **Port**: `443`
- **Path**: `/`  ⚠️ **harus `/`, BUKAN `/mqtt`** (mosquitto menyajikan WS di root)
- **Username**: `aquaculture` (sesuai `.env` server)
- **Password**: nilai **asli** dari `MQTT_PASSWORD` di `.env` server — **bukan**
  kata "PASSWORD". Cek di server: `grep MQTT_PASSWORD .env` (default `aquaculture123`).
- **SSL/TLS**: boleh OFF (skema `wss://` sudah TLS lewat Cloudflare).

Kalau "Connected" → server siap. Subscribe topik `#` untuk lihat semua pesan.

---

## 2½. Pengujian komunikasi (berlapis — paling penting)

Uji dari **lapisan paling dalam ke luar** supaya tahu persis di mana masalahnya.

### Lapis 1 — Broker hidup & kredensial benar (lokal, lepas dari internet)
Di **server**:
```bash
# Terminal 1: pantau semua pesan yang masuk ke broker
./run.sh mqtt-sub
# Terminal 2: kirim status device palsu
./run.sh mqtt-test
```
Kalau pesan muncul di Terminal 1 → broker + kredensial `.env` **OK**. (Ini lewat
TCP internal, jadi membuktikan broker sehat tanpa melibatkan Cloudflare.)

### Lapis 2 — Jalur WSS via Cloudflare (persis seperti ESP32)
Pakai **script uji** [`tools/test-mqtt-ws.js`](../tools/test-mqtt-ws.js) — konek
`wss://mqtt.trin-polman.id:443`, publish, lalu terima kembali:
```bash
# di laptop/Windows yang ada Node.js
cd tools
npm install
node test-mqtt-ws.js <password>        # <password> = MQTT_PASSWORD asli server
# contoh: node test-mqtt-ws.js aquaculture123
# (kalau password masih default aquaculture123, cukup: node test-mqtt-ws.js)
```
> PowerShell: jangan pakai `VAR=nilai node ...` (itu syntax bash). Pakai argumen
> seperti di atas, atau `$env:MQTT_PASSWORD="aquaculture123"; node test-mqtt-ws.js`.
Atau **tanpa Node (mis. di VM, pakai Docker)**:
```bash
docker run --rm -e MQTT_PASSWORD=passwordasli -v "$PWD/tools:/t" -w /t \
  node:20-alpine sh -c "npm i mqtt --silent && node test-mqtt-ws.js"
```
Output `🎉 SUKSES` = jalur WSS lewat Cloudflare **berfungsi** → ESP32 dgn config
sama pasti bisa konek. Kalau gagal, pesannya menunjuk penyebab (port/cred/path).

> Alternatif manual: MQTTX (lihat 2c). Buka **dua koneksi** (atau satu tab
> subscribe `#`, satu tab publish ke `lele/device/status`) untuk lihat pesan
> pulang-pergi.

### Lapis 3 — Sampai ke dashboard (end-to-end)
Setelah Lapis 2 sukses, buka dashboard → menu perangkat lele, device
`test_ws_01` (atau `pakan_lele_01`) harus muncul. Atau dari server:
```bash
curl -s http://localhost:8095/api/lele/devices    # ganti 8095 = WEB_PORT Anda
```

---

## 3. Sisi ESP32 — Persiapan (pemula mulai di sini)

### 3a. Install 3 library
Arduino IDE → **Tools → Manage Libraries…**, cari & install:
1. **WebSockets** by *Markus Sattler*  (nama lain: arduinoWebSockets)
2. **MQTTPubSubClient** by *hideakitai*
3. **ArduinoJson** by *Benoit Blanchon*

> `PubSubClient` (yang dipakai sketch lama) **tidak** mendukung WebSocket, jadi
> kita ganti ke **MQTTPubSubClient** yang mendukung WS/WSS.

### 3b. Uji koneksi dulu dengan sketch contoh
Buka [`esp32/contoh_mqtt_websocket/contoh_mqtt_websocket.ino`](../esp32/contoh_mqtt_websocket/contoh_mqtt_websocket.ino).
Ubah bagian konfigurasi (WiFi, `MQTT_HOST`, `MQTT_USER`, `MQTT_PASS`), pilih board
**ESP32 Dev Module**, lalu **Upload**. Buka **Serial Monitor (115200)**.

Berhasil jika muncul:
```
WiFi OK, IP: 192.168.x.x
Konek broker  wss://mqtt.trin-polman.id:443/ ...
>>> MQTT (WSS) terhubung! <<<
status terkirim → lele/device/status
```
Lalu cek dashboard / `curl https://aquaculture.trin-polman.id/api/lele/devices` —
device `pakan_lele_01` harus muncul. **Kalau ini berhasil, jalur sudah benar.**

---

## 4. Inti perubahan kode (3 hal yang WAJIB)

Apa pun sketch-nya, hanya 3 hal ini yang berubah dari versi TCP:

```cpp
// (1) Library + objek
#include <WebSocketsClient.h>     // ganti <WiFiClient.h>
#include <MQTTPubSubClient.h>
WebSocketsClient ws;              // ganti: WiFiClient wifiClient;
MQTTPubSubClient mqtt;            // ganti: PubSubClient mqttClient(wifiClient);

// (2) Cara konek (di setup), perhatikan argumen ke-5 = "mqtt"
ws.beginSSL("mqtt.trin-polman.id", 443, "/", "", "mqtt");
mqtt.begin(ws);
mqtt.setKeepAliveTimeout(60);
mqtt.connect("pakan_lele_01", "aquaculture", "PASSWORD");

// (3) Di loop()
mqtt.update();                    // ganti: mqttClient.loop();
```

> ⚠️ Argumen ke-5 `"mqtt"` itu **wajib** — itu "WebSocket subprotocol".
> Tanpa itu mosquitto akan **menolak** koneksi (default library mengirim
> `"arduino"`).

---

## 5. Porting sketch besar `esp32_pakan_lele_v3_2.ino`

Sketch pakan lele Anda memakai `PubSubClient`. Berikut pemetaan lengkapnya.

### 5a. Tabel padanan API

| Lama (`PubSubClient`) | Baru (`MQTTPubSubClient`) |
|-----------------------|---------------------------|
| `WiFiClient wifiClient;` | `WebSocketsClient ws;` |
| `PubSubClient mqttClient(wifiClient);` | `MQTTPubSubClient mqtt;` |
| `mqttClient.setServer(host, 1883);` | `ws.beginSSL(host, 443, "/", "", "mqtt"); mqtt.begin(ws);` |
| `mqttClient.setCallback(onMqttMessage);` | `mqtt.subscribe(globalCallback);` (lihat 5c) |
| `mqttClient.connect(id, user, pass);` | `mqtt.connect(id, user, pass);` |
| `mqttClient.subscribe("topik");` | `mqtt.subscribe("topik", cb);` *(atau pakai callback global)* |
| `mqttClient.publish(topik, payload, false);` | `mqtt.publish(topik, payload);` |
| `mqttClient.loop();` | `mqtt.update();` |
| `mqttClient.connected();` | `mqtt.isConnected();` |
| `mqttClient.setKeepAlive(60);` | `mqtt.setKeepAliveTimeout(60);` |
| LWT lewat argumen `connect(...)` | `mqtt.setWill(topik, pesan, retained, qos);` **sebelum** `connect()` |

### 5b. Ubah konfigurasi (sekitar baris 43–80)
```cpp
// --- include (atas file) ---
#include <WiFi.h>
#include <WebSocketsClient.h>     // ◄ tambah, di ATAS MQTTPubSubClient
#include <MQTTPubSubClient.h>     // ◄ ganti dari <PubSubClient.h>

// --- konfigurasi ---
const bool   MQTT_ENABLE = true;                  // ◄ aktifkan
const char*  MQTT_SERVER = "mqtt.trin-polman.id"; // ◄ subdomain Cloudflare
const uint16_t MQTT_PORT = 443;                   // ◄ WSS = 443
const char*  MQTT_PATH   = "/";                   // ◄ baru
const char*  MQTT_USER   = "aquaculture";
const char*  MQTT_PASSWORD = "PASSWORD_MQTT";

// --- objek (ganti baris WiFiClient/PubSubClient) ---
WebSocketsClient ws;              // ◄ ganti: WiFiClient wifiClient;
MQTTPubSubClient mqtt;            // ◄ ganti: PubSubClient mqttClient(wifiClient);
```

### 5c. Ubah fungsi koneksi MQTT
Ganti bagian `setServer/setCallback/connect` menjadi:
```cpp
void setupMqtt() {
  ws.beginSSL(MQTT_SERVER, MQTT_PORT, MQTT_PATH, "", "mqtt");
  ws.setReconnectInterval(3000);
  mqtt.begin(ws);
  mqtt.setKeepAliveTimeout(60);

  // Last Will (opsional): broker kirim ini bila device putus mendadak
  // mqtt.setWill(TOPIC_STATUS, "{\"device_id\":\"" + String(DEVICE_ID) + "\",\"is_online\":false}", false, 0);

  // Callback GLOBAL: terima SEMUA pesan, lalu dispatch per-topik
  // (paling mirip dengan onMqttMessage lama Anda)
  mqtt.subscribe([](const String& topic, const String& payload, const size_t size) {
    onMqttMessage(topic, payload);   // versi baru menerima String
  });
}

bool mqttConnect() {
  // subscribe topik command/config Anda tetap sama isinya
  bool ok = mqtt.connect(DEVICE_ID, MQTT_USER, MQTT_PASSWORD);
  if (ok) {
    mqtt.subscribe(topicCommand);   // lele/device/<id>/command
    mqtt.subscribe(topicConfig);    // lele/device/<id>/config
  }
  return ok;
}
```

### 5d. Ubah signature `onMqttMessage`
```cpp
// LAMA: void onMqttMessage(char* topic, byte* payload, unsigned int length)
// BARU:
void onMqttMessage(const String& topic, const String& payload) {
  // Tidak perlu lagi merakit String dari byte* — payload sudah String.
  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, payload)) return;   // gagal parse → abaikan

  if (topic == topicCommand) {
    // ... logika perintah Anda (sama seperti sebelumnya) ...
  } else if (topic == topicConfig) {
    // ... logika config ...
  }
}
```

### 5e. Ubah wrapper publish & cek koneksi
```cpp
bool mqttReady() {
  return MQTT_ENABLE && WiFi.status() == WL_CONNECTED && mqtt.isConnected();  // ◄ isConnected()
}
bool mqttPublish(const char* topic, String payload) {
  if (!mqttReady()) return false;
  return mqtt.publish(topic, payload);   // ◄ MQTTPubSubClient
}
```

### 5f. Ubah `loop()`
```cpp
void loop() {
  // ... kode Anda yang lain ...
  if (WIFI_ENABLE && WiFi.status() == WL_CONNECTED) {
    mqtt.update();                       // ◄ ganti mqttClient.loop();
    if (!mqtt.isConnected()) {           // reconnect bila putus
      static unsigned long t = 0;
      if (millis() - t > 5000) { t = millis(); mqttConnect(); }
    }
  }
}
```

> Sisanya (sensor, motor, layar, logika pakan) **tidak perlu diubah**. Yang
> berubah hanya "pipa" MQTT-nya.

---

## 6. Catatan keandalan (untuk kolam 24/7)

- **Keepalive < 100 dtk**: Cloudflare memutus WebSocket yang diam >100 dtk.
  Device Anda publish status tiap 3 dtk + `setKeepAliveTimeout(60)` → aman.
- **Reconnect otomatis**: `ws.setReconnectInterval(3000)` + cek `isConnected()`
  di `loop()` membuat device menyambung lagi setelah WiFi/listrik sempat putus.
- **Jam (NTP)** tidak wajib untuk WSS via Cloudflare (TLS di-handle Cloudflare),
  beda dengan TLS langsung — ini salah satu keuntungan jalur ini.

---

## 7. Troubleshooting

| Gejala (di Serial Monitor) | Penyebab & solusi |
|----------------------------|-------------------|
| Berhenti di "WiFi connecting..." | SSID/password salah, atau WiFi 5GHz (ESP32 hanya 2.4GHz) |
| WS connect lalu putus terus | Subprotocol salah → pastikan argumen ke-5 `beginSSL` = `"mqtt"` |
| Connect ditolak / "not authorised" | Password salah. Pakai nilai ASLI `MQTT_PASSWORD` (`grep MQTT_PASSWORD .env`), bukan kata "PASSWORD". Jika `.env` diubah tapi belum `./run.sh mqtt-passwd` → hash lama, mismatch |
| Tak konek di MQTTX, Path `/mqtt` | Ganti Path ke `/` (mosquitto WS di root) |
| WSS gagal handshake / timeout | Port 9001 belum dipublish (belum `./run.sh deploy` versi baru), atau Public Hostname Cloudflare salah (harus Service `HTTP` → `localhost:9001`) |
| Device tak muncul di dashboard | Cek `./run.sh mqtt-sub` di server — apakah pesan masuk? |
| Connect tapi tiap ~100 dtk putus | Keepalive kurang → `setKeepAliveTimeout(60)` & rajin publish |

Uji cepat di server (lihat pesan yang masuk dari device):
```bash
./run.sh mqtt-sub          # tampilkan semua pesan MQTT di broker
```

---

## 8. Ringkas: checklist

- [ ] Server: `./run.sh deploy` (port WS 9001 aktif)
- [ ] Cloudflare: Public Hostname `mqtt.trin-polman.id` → `HTTP localhost:9001`
- [ ] Uji dari MQTTX (`wss://mqtt.trin-polman.id:443/`) → Connected
- [ ] ESP32: install 3 library
- [ ] ESP32: upload `contoh_mqtt_websocket.ino` → "MQTT (WSS) terhubung!"
- [ ] Device muncul di `/api/lele/devices`
- [ ] Port sketch besar pakan lele (Bagian 5)

Selamat — device kolam jauh Anda kini terhubung lewat internet tanpa VPS. 🎉
