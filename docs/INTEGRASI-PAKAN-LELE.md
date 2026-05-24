# 🐟 Integrasi ESP32 Pakan Lele

Panduan integrasi firmware ESP32 Pakan Lele V2.0 dengan Smart Aquaculture.

## ⚙️ Setup ESP32

Di code Arduino Anda, edit bagian WiFi & MQTT:

```cpp
const char* WIFI_SSID = "NAMA_WIFI_ANDA";
const char* WIFI_PASSWORD = "PASSWORD_WIFI";
const char* MQTT_SERVER = "192.168.x.x";   // IP komputer yang menjalankan Docker
const uint16_t MQTT_PORT = 1883;
const char* MQTT_USER = "aquaculture";       // ← TAMBAHKAN
const char* MQTT_PASSWORD = "aquaculture123"; // ← TAMBAHKAN
const char* DEVICE_ID = "pakan_lele_01";
```

> **PENTING:** Code asli Anda `MQTT_USER` kosong. Karena MQTT broker kita pakai auth, **tambahkan kredensial** di atas.

## 🚀 Cara Update Aplikasi

### 1. Extract ZIP patch ke folder lama (timpa file)
```powershell
cd D:\smart-aquaculture\smart-aquaculture
# Extract patch-lele-integration.zip ke folder ini
```

### 2. Jalankan migration database
```powershell
docker compose start postgres
# Tunggu 5 detik
Get-Content database\migration-lele.sql | docker exec -i aquaculture_postgres psql -U aquaculture -d aquaculture
```

Atau di Linux/Mac:
```bash
cat database/migration-lele.sql | docker exec -i aquaculture_postgres psql -U aquaculture -d aquaculture
```

### 3. Rebuild backend & frontend
```powershell
docker compose up -d --build backend frontend
```

### 4. Upload firmware ke ESP32
- Buka Arduino IDE
- Sesuaikan WIFI_SSID, MQTT_SERVER, MQTT_USER, MQTT_PASSWORD
- Upload

## 🎯 Cara Pakai

### 1. Tunggu Device Terdeteksi
- ESP32 nyala → kirim status MQTT setiap 15 detik
- Buka aplikasi → menu **Pakan Lele** di sidebar
- Device akan muncul otomatis (max 30 detik)

### 2. Assign ke Kolam
- Pilih device → klik tombol **Assign Kolam**
- Pilih kolam target → simpan
- Setelah itu semua data feeding & biomassa otomatis tersambung ke kolam

### 3. Monitor Real-time
Menu Pakan Lele punya 4 tab:
- **Status Real-time** — Status WiFi, MQTT, RTC, HX711, sample readiness
- **Biomassa** — Data sampling ikan + estimasi pakan
- **Riwayat Feeding** — Semua sesi pakan + detail per batch
- **Log Error** — Error dari device

### 4. Integrasi dengan Sistem Kolam
Setelah device di-assign ke kolam:
- Sesi pakan otomatis masuk ke **tab Pakan** kolam terkait
- Sampling biomassa otomatis muncul di **menu Notifikasi**
- Jumlah ikan dari biomassa summary auto-sync ke `fish_count` kolam
- Error dari device → notifikasi critical

## 📡 MQTT Topics

Backend listen di topic ini:
| Topic | Dari ESP32 | Aksi Backend |
|-------|------------|--------------|
| `lele/device/status` | Status device (15 detik) | Update tabel `lele_devices` |
| `lele/biomass/sample` | Saat OK ditekan di sampling | Simpan ke `lele_biomass_samples` |
| `lele/biomass/summary` | Setelah 3 sampling selesai | Simpan summary + sync fish_count |
| `lele/feed/session` | Mulai feeding | Simpan ke `lele_feed_sessions` |
| `lele/feed/batch` | Setiap batch selesai | Detail batch |
| `lele/feed/summary` | Akhir session | Sukses/gagal + log ke feeding_logs |
| `lele/device/error` | Error apapun | Simpan + notifikasi critical |

## 🐛 Troubleshooting

### Device tidak muncul
- Cek serial monitor ESP32 → pastikan MQTT connected
- Cek backend logs: `docker compose logs -f backend | grep lele`
- Pastikan MQTT_USER = "aquaculture" di code ESP32

### Data feeding tidak masuk ke kolam
- Pastikan device sudah di-assign ke kolam
- Cek apakah `pond_id` di tabel `lele_devices` sudah terisi

### Backend error import
- File `lele-integration.js` harus ada di folder `backend/`
- Rebuild backend: `docker compose up -d --build backend`
