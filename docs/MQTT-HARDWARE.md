# 📡 Setup MQTT — Server & Hardware (ESP32 Pakan Lele)

Panduan menghubungkan device **ESP32 feeder lele** (`esp32/esp32_pakan_lele_v3_2`)
ke broker MQTT.

## Pilih skenario Anda

| Skenario | Broker | Panduan |
|----------|--------|---------|
| **Kolam jauh** (beda jaringan dgn server, hanya ada WiFi internet) | Broker sendiri di **VPS + TLS** | **[Bagian A](#a-produksi-kolam-jauh-broker-vps--tls)** ⭐ produksi |
| Kolam & server **satu LAN** (mis. uji di lab) | Mosquitto lokal di server | [Bagian B](#b-lan-kolam--server-satu-jaringan) |

> Inti masalah: server trin hanya bisa diakses dari internet via **Cloudflare
> Tunnel (HTTP/WS)** — tak ada port TCP publik untuk MQTT. Maka untuk kolam jauh,
> broker ditaruh di **VPS ber-IP publik** (lihat folder [`vps-broker/`](../vps-broker/)).

---

# A) PRODUKSI: kolam jauh (broker VPS + TLS)

```
  ESP32 (kolam, WiFi internet) ──mqtts:8883 (TLS)──►  VPS (mosquitto, IP publik)
                                                          ▲
  Backend trin (LELE_MQTT_*) ───mqtts:8883 (TLS)─────────┘
                                                          ▼
                                   Postgres → Dashboard (Cloudflare Tunnel)
```

### A.1 Siapkan broker di VPS
Ikuti [`vps-broker/README.md`](../vps-broker/README.md): VPS kecil (1 vCPU/1 GB),
Ubuntu 22.04/24.04, lalu `cp .env.example .env` → isi `DOMAIN` + `MQTT_PASSWORD`
→ `./run.sh`. Disarankan `TLS_MODE=letsencrypt` dengan subdomain mis.
`mqtt.trin-polman.id` (A record DNS-only ke IP VPS).

### A.2 Sambungkan backend trin ke broker VPS
Di `.env` app utama (root), isi blok `LELE_MQTT_*`:
```
LELE_MQTT_HOST=mqtt.trin-polman.id
LELE_MQTT_PORT=8883
LELE_MQTT_USER=aquaculture
LELE_MQTT_PASSWORD=<password broker VPS>
LELE_MQTT_TLS_INSECURE=false        # true hanya jika cert self-signed
```
Lalu `./run.sh prod-restart`. Cek log: `✓ MQTT lele (remote) terhubung`.
(Broker lokal tetap dipakai untuk topik `aquaculture/...` — tak terpengaruh.)

### A.3 Firmware ESP32 (TLS)
Di `esp32_pakan_lele_v3_2.ino`, ubah transport ke TLS:
```cpp
#include <WiFiClientSecure.h>          // ◄ ganti dari <WiFiClient.h>
#include <PubSubClient.h>

WiFiClientSecure wifiClient;            // ◄ ganti dari: WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

const bool   MQTT_ENABLE  = true;                  // ◄ aktifkan
const char*  MQTT_SERVER  = "mqtt.trin-polman.id"; // ◄ domain broker VPS
const uint16_t MQTT_PORT  = 8883;                  // ◄ TLS
const char*  MQTT_USER    = "aquaculture";
const char*  MQTT_PASSWORD= "PASSWORD_BROKER_VPS";

// Di setup(), SEBELUM mqttClient.connect():
//  - Let's Encrypt: verifikasi penuh pakai root ISRG X1
//      wifiClient.setCACert(ISRG_ROOT_X1);   // tempel PEM root LE
//  - Cara cepat / self-signed: enkripsi tanpa verifikasi cert
//      wifiClient.setInsecure();
```
Catatan: TLS butuh RAM lebih — **ESP32 mampu**. Bila pakai **NodeMCU/ESP8266**,
`WiFiClientSecure` versi ESP8266 (set `wifiClient.setInsecure()` atau
`setTrustAnchors`), dan jam perangkat harus benar (NTP) agar verifikasi cert valid.

> Self-signed → set `wifiClient.setInsecure()` di ESP32 **dan**
> `LELE_MQTT_TLS_INSECURE=true` di backend. Let's Encrypt → keduanya verifikasi penuh.

---

# B) LAN: kolam & server satu jaringan

> Hanya untuk uji di lab / kolam yang benar-benar satu LAN dengan server.
> Untuk produksi kolam jauh, pakai **Bagian A**.

## ⚠️ Konsep penting: MQTT TIDAK lewat Cloudflare Tunnel

Web dashboard (`aquaculture.trin-polman.id`) lewat **Cloudflare Tunnel (HTTPS)**.
**MQTT berbeda** — itu koneksi **TCP mentah port 1883**. Cloudflare Tunnel untuk
TCP butuh client menjalankan `cloudflared access tcp`, dan **ESP32 tidak bisa**
melakukannya. Jadi:

> ❌ JANGAN menambahkan route MQTT di dialog "Add published application" Cloudflare.
> ✅ ESP32 konek **langsung ke IP LAN server** di port 1883 (jaringan lokal POLMAN).

```
  ESP32 (WiFi LAN POLMAN)  ──TCP 1883──►  172.16.67.5  (VM docker-host)
                                              │  mosquitto:1883
                                              ▼
                                   backend (lele-integration) → Postgres
                                              ▼
                                   Dashboard (via Cloudflare Tunnel, HTTPS)
```

**Syarat:** ESP32 dan server harus berada di **LAN yang sama / bisa saling
routing** (jaringan `172.16.67.0/24`). Untuk akses dari internet/jaringan lain,
ESP32 perlu masuk ke LAN itu (mis. VPN/Tailscale di gateway) — di luar lingkup
lab standar.

---

## 1) Sisi Server (VM trin)

Broker `mosquitto` sudah jalan via `./run.sh deploy` (publish `0.0.0.0:1883`).
Yang perlu dipastikan:

```bash
# a. Cari IP LAN VM (harus 172.16.67.5)
hostname -I

# b. Buka port 1883 di firewall VM
sudo ufw allow 1883/tcp
sudo ufw status

# c. Pastikan broker listening di host
ss -tlnp | grep 1883          # harus ada 0.0.0.0:1883

# d. Pastikan kredensial MQTT konsisten.
#    Kredensial device HARUS cocok dengan:
#    - MQTT_USER / MQTT_PASSWORD di .env, DAN
#    - file mosquitto/config/passwd (versi hash).
#    Jika Anda MENGUBAH MQTT_PASSWORD di .env, regenerate passwd lalu restart:
./run.sh mqtt-passwd
./run.sh prod-restart
```

### Verifikasi broker tanpa hardware

```bash
# Intip semua pesan yang masuk ke broker (Ctrl+C berhenti)
./run.sh mqtt-sub

# Di terminal lain: kirim status device PALSU → harus muncul di mqtt-sub
# dan device tampil di dashboard / endpoint /api/lele/devices
./run.sh mqtt-test                 # device_id default: pakan_lele_01
curl -s http://localhost:8095/api/lele/devices
```

Kalau `mqtt-test` muncul di `mqtt-sub` dan device tampil di `/api/lele/devices`,
berarti pipeline **broker → backend → DB → dashboard** sehat. Tinggal arahkan
hardware ke broker yang sama.

### Test dari laptop di LAN (opsional)

```bash
# di laptop yang satu LAN dengan server (punya mosquitto-clients)
mosquitto_sub -h 172.16.67.5 -p 1883 -u aquaculture -P 'PASSWORD_ANDA' -t '#' -v
```
Kalau gagal di sini → masalah jaringan/UFW, bukan ESP32.

---

## 2) Sisi Hardware (ESP32)

Edit blok config di
[`esp32/esp32_pakan_lele_v3_2/esp32_pakan_lele_v3_2.ino`](../esp32/esp32_pakan_lele_v3_2/esp32_pakan_lele_v3_2.ino)
(sekitar baris 43–56):

```cpp
const bool WIFI_ENABLE = true;
const bool MQTT_ENABLE = true;          // ◄ WAJIB true (default-nya false!)

const char* WIFI_SSID     = "NAMA_WIFI_LAB";   // ◄ WiFi yang 1 LAN dgn server
const char* WIFI_PASSWORD = "PASSWORD_WIFI";

const char* MQTT_SERVER   = "172.16.67.5";     // ◄ IP LAN VM server (BUKAN 172.20.10.2)
const uint16_t MQTT_PORT  = 1883;
const char* MQTT_USER     = "aquaculture";     // ◄ samakan dgn .env MQTT_USER
const char* MQTT_PASSWORD = "PASSWORD_ANDA";   // ◄ samakan dgn .env MQTT_PASSWORD

const char* DEVICE_ID = "pakan_lele_01";       // identitas unik device
```

Poin penting:
1. **`MQTT_ENABLE` harus `true`** — di repo nilainya `false` (MQTT mati).
2. **`MQTT_SERVER`** = IP LAN server (`172.16.67.5`), bukan IP hotspot lama.
3. **`WIFI_SSID/PASSWORD`** = jaringan yang bisa menjangkau `172.16.67.5`.
   (Kalau WiFi lab beda subnet, pastikan ada routing ke `172.16.67.0/24`.)
4. **User/Password MQTT** harus sama persis dengan `.env` di server.
5. Board: kode ini untuk **ESP32** (`#include <WiFi.h>`). Bila pakai
   **NodeMCU/ESP8266**, ganti ke `#include <ESP8266WiFi.h>` (PubSubClient sama).

Setelah upload, buka **Serial Monitor (115200)** — cari log koneksi WiFi & MQTT.
Saat tersambung, device publish ke `lele/device/status` tiap 3 detik.

---

## 3) Topik MQTT (referensi)

Device → server (publish):

| Topik | Isi |
|-------|-----|
| `lele/device/status` | Status device tiap 3 dtk (online, wifi, pakan, dll) |
| `lele/biomass/sample` · `lele/biomass/summary` | Data sampling bobot ikan |
| `lele/feed/session` · `lele/feed/batch` · `lele/feed/summary` | Sesi pemberian pakan |
| `lele/device/error` · `lele/device/ack` | Error & acknowledgement |

Server → device (command):

| Topik | Isi |
|-------|-----|
| `lele/device/{DEVICE_ID}/command` | Perintah (manual feed, tare, sampling, dll) |
| `lele/device/{DEVICE_ID}/config` | Update konfigurasi |

`{DEVICE_ID}` = nilai `DEVICE_ID` di sketch (default `pakan_lele_01`).

---

## 4) Troubleshooting cepat

| Gejala | Kemungkinan penyebab |
|--------|----------------------|
| Device tak muncul di dashboard | `MQTT_ENABLE=false`, IP/SSID salah, atau UFW blok 1883 |
| MQTT connect lalu putus (rc=5) | User/password MQTT tidak cocok dgn `.env`/`passwd` |
| `mqtt-test` jalan tapi device asli tidak | Masalah jaringan ESP32→server (subnet/UFW), bukan broker |
| Ganti password tapi auth gagal | Lupa `./run.sh mqtt-passwd` + `prod-restart` |
| Tidak bisa konek dari internet | MQTT memang LAN-only; ESP32 harus di LAN server |
