# 🐟 Patch V3.2 Hybrid - Pakan Lele Dual Control

Patch ini menyesuaikan sistem dengan **firmware ESP32 V3.1 final** Anda + tambahan **MQTT** untuk dashboard dua arah.

## 🎯 Filosofi Hybrid

✅ **Preferences tetap dipakai** — data tidak hilang saat restart / WiFi mati
✅ **MQTT untuk sinkronisasi** dengan dashboard real-time
✅ **Device tetap autonomous** — LCD bisa kontrol penuh meski web mati
✅ **Dashboard = second screen** — semua 8 menu LCD ada padanannya di web
✅ **Dual control** — operator pilih lewat fisik atau web, sinkron otomatis

## 📦 File yang Berubah

```
esp32/esp32_pakan_lele_v3_2.ino          # ← UPLOAD ke ESP32
backend/lele-integration.js              # ← REPLACE
frontend/src/pages/LeleFeeder.jsx        # ← REPLACE (8 tab baru)
frontend/src/services/leleApi.js         # ← REPLACE
frontend/src/components/lele/            # ← 8 panel baru:
  StatusSistemPanel.jsx    PakanOtomatisPanel.jsx
  TimbangBiomassaPanel.jsx DataKolamPanel.jsx
  JadwalPakanPanel.jsx     KalibrasiTarePanel.jsx
  RiwayatAkhirPanel.jsx    PengaturanPanel.jsx
database/migration-lele-v3-2.sql         # ← jalankan SEKALI
```

## 🚀 Cara Install (Windows PowerShell)

### 1. Extract patch ke folder project
Extract `patch-lele-v3-2-hybrid.zip` ke `D:\smart-aquaculture\smart-aquaculture`, timpa semua file yang konflik.

### 2. Jalankan migration database
```powershell
cd D:\smart-aquaculture\smart-aquaculture
Get-Content database\migration-lele-v3-2.sql | docker exec -i aquaculture_postgres psql -U aquaculture -d aquaculture
```

Output yang diharapkan: `ALTER TABLE`, `CREATE TABLE`, dst.

### 3. Rebuild backend & frontend
```powershell
docker compose up -d --build backend frontend
```

### 4. Install library Arduino tambahan
Arduino IDE → Tools → Manage Libraries → install:

- **PubSubClient** by Nick O'Leary (MQTT)
- **ArduinoJson** by Benoit Blanchon (parse command)

Library V3.1 yang harus sudah ada: `LiquidCrystal_I2C`, `HX711`, `ESP32Servo`, `RTClib`, `Preferences`.

### 5. Edit firmware V3.2

Buka `esp32/esp32_pakan_lele_v3_2.ino`, edit baris ini sesuai network Anda:

```cpp
const bool WIFI_ENABLE = true;
const bool MQTT_ENABLE = true;     // set false = standalone seperti V3.1 (LCD only)

// WAJIB GANTI ke SSID & password WiFi yang Anda pakai
const char* WIFI_SSID = "GANTI_SSID_ANDA";
const char* WIFI_PASSWORD = "GANTI_PASSWORD_WIFI";

// IP laptop dari `ipconfig` (network adapter WiFi)
// Berdasar ipconfig Anda: 192.168.100.91
const char* MQTT_SERVER = "192.168.100.91";
const uint16_t MQTT_PORT = 1883;
const char* MQTT_USER = "aquaculture";       // jangan diubah (sama dgn mosquitto/passwd)
const char* MQTT_PASSWORD = "aquaculture123";

const char* DEVICE_ID = "pakan_lele_01";       // unik per ESP32
```

#### 🌐 Skenario Network

**Skenario A — WiFi router rumah (RECOMMENDED):**
- Laptop & ESP32 konek ke router yang sama
- `MQTT_SERVER = "192.168.100.91"` (IP laptop saat ini)
- ⚠️ IP laptop bisa berubah! Set IP statis di router atau cek ulang `ipconfig` setiap kali

**Skenario B — Hotspot dari laptop:**
- Nyalakan Mobile Hotspot di Settings Windows
- ESP32 konek ke SSID hotspot laptop
- `MQTT_SERVER = "192.168.137.1"` (IP default Windows Mobile Hotspot)
- Cek `ipconfig` → cari adapter "Local Area Connection*" yang aktif

**🔥 Buka Firewall Windows (WAJIB):**
PowerShell sebagai Administrator:
```powershell
New-NetFirewallRule -DisplayName "MQTT Mosquitto" -Direction Inbound -LocalPort 1883 -Protocol TCP -Action Allow
```

### 6. Upload firmware
Board: ESP32 Dev Module, lalu Upload.

LCD akan tampil:
```
PAKAN LELE
V3.2 Hybrid
```
Lalu:
```
WiFi OK
192.168.x.x
```

### 7. Buka dashboard
http://localhost:3000 → menu **Pakan Lele**.

Device muncul otomatis dalam ~5 detik setelah connect MQTT.

## 🎮 Cara Dual Control Bekerja

### Dari LCD fisik
Tekan tombol UP/DOWN/OK/BACK → device merespons → status ke dashboard.

### Dari Web
**Tab Status Sistem** → klik D-pad virtual → device merespons seperti tombol fisik
**Tab Pakan Otomatis** → toggle Auto Feed atau klik Manual Feed
**Tab Timbang Biomassa** → klik "Mulai Sampling" → LCD langsung masuk mode sampling
**Tab Data Kolam** → edit jumlah ikan / frekuensi → tersimpan di Preferences device
**Tab Jadwal Pakan** → edit jam:menit per jadwal → device update RTC scheduler
**Tab Kalibrasi/Tare** → klik Tare → device langsung tare

Setiap perintah via MQTT `lele/device/{DEVICE_ID}/command` → ESP32 respond ACK ke `lele/device/ack` → dashboard tampilkan notifikasi.

## 🔌 MQTT Topics

### ESP32 → Dashboard:
- `lele/device/status` — status real-time tiap 3 detik (termasuk array schedules)
- `lele/biomass/sample` — tiap 1 ikan
- `lele/biomass/summary` — saat sampling selesai
- `lele/feed/session` / `lele/feed/batch` / `lele/feed/summary` — sesi feeding
- `lele/device/error` — error
- `lele/device/ack` — acknowledge command

### Dashboard → ESP32:
- `lele/device/{DEVICE_ID}/command` — remote command
- `lele/device/{DEVICE_ID}/config` — update config (fish_count, schedule, dst)

## ⚠️ Troubleshooting

**Device tidak muncul:**
```powershell
docker logs aquaculture_backend --tail 50
docker logs aquaculture_mosquitto --tail 30
docker exec aquaculture_mosquitto mosquitto_sub -h localhost -u aquaculture -P aquaculture123 -t "lele/#" -v
```

**ESP32 tidak konek MQTT:**
- IP MQTT_SERVER benar (cek `ipconfig` di laptop, gunakan IP adapter WiFi yang sama dengan ESP32)
- Firewall Windows ALLOW port 1883 (lihat command di step 5)
- Laptop & ESP32 di **subnet yang sama** (contoh: keduanya 192.168.100.x)
- Serial Monitor (115200) — cari log `[MQTT] Connected & subscribed`
- Test ping dari laptop ke ESP32 setelah konek WiFi: `ping 192.168.100.xxx` (IP ESP32 dari LCD)

**Cara cek IP ESP32:**
Setelah upload firmware, LCD akan tampil:
```
WiFi OK
192.168.100.xxx     ← ini IP ESP32
```
Catat untuk troubleshoot.

**Tombol web tidak respond:**
- Status `mqtt_connected` di card harus hijau
- Serial Monitor — saat klik tombol web harus muncul `[MQTT IN] ...command...`
- Pastikan firmware versi V3.2 (splash screen LCD)

**Standalone tanpa dashboard:**
Set `MQTT_ENABLE = false` di firmware → LCD tetap berfungsi 100%.

## ✅ Verifikasi

- [ ] LCD tampil "PAKAN LELE / V3.2 Hybrid" saat boot
- [ ] LCD tampil "WiFi OK" + IP
- [ ] Dashboard → Pakan Lele → device ONLINE
- [ ] Klik D-pad virtual UP → LCD cursor pindah
- [ ] Toggle Auto Feed di web → LCD blink "Auto Feed ON/OFF"
- [ ] Edit jumlah ikan di web → device update otomatis
- [ ] Sampling dari LCD → web update real-time

Selamat, sistem Anda sekarang fully dual control! 🎉
