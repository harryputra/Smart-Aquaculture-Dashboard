# 📖 TUTORIAL LENGKAP — SMART AQUACULTURE V3.2 HYBRID
## Dual Control: Web Dashboard ↔ LCD + Tombol Fisik

**Sistem:** Windows 11 + Docker Desktop + ESP32 + LCD 16×2
**Waktu estimasi:** 30–60 menit

---

## 🗺️ GAMBARAN BESAR SISTEM

```
┌─────────────────────────────────────────────────────────────────┐
│                        LAPTOP / PC                              │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │   Browser    │    │   Backend    │    │    Mosquitto     │  │
│  │ localhost:   │◄──►│  Node.js     │◄──►│  MQTT Broker    │  │
│  │    3000      │    │  port 5000   │    │  port 1883      │  │
│  └──────────────┘    └──────┬───────┘    └────────┬─────────┘  │
│                             │                     │             │
│                    ┌────────┴──────┐              │             │
│                    │  PostgreSQL   │              │             │
│                    │  port 5432    │              │             │
│                    └───────────────┘              │             │
└───────────────────────────────────────────────────┼─────────────┘
                                                    │ WiFi
                                          192.168.100.91:1883
                                                    │
                                    ┌───────────────▼──────────────┐
                                    │          ESP32               │
                                    │   Firmware V3.2 Hybrid       │
                                    │                              │
                                    │  ┌─────────┐ ┌──────────┐   │
                                    │  │  LCD    │ │ Tombol   │   │
                                    │  │ 16×2    │ │ Fisik    │   │
                                    │  └─────────┘ └──────────┘   │
                                    │  ┌─────────┐ ┌──────────┐   │
                                    │  │  HX711  │ │  Servo   │   │
                                    │  │Chamber  │ │ Stepper  │   │
                                    │  │Sampling │ │ Spinner  │   │
                                    │  └─────────┘ └──────────┘   │
                                    └──────────────────────────────┘
```

**Cara kerja dual control:**
- Tombol fisik → LCD bergerak → ESP32 kirim status ke MQTT → Dashboard update
- Klik tombol di web → MQTT kirim command → ESP32 eksekusi → LCD update

---

## BAGIAN 1 — PERSIAPAN LAPTOP

### 1.1 Cek Docker Desktop sudah running

Buka Docker Desktop, pastikan status hijau "Running".

Buka PowerShell, jalankan:
```powershell
docker ps
```
Output yang diharapkan: ada container `aquaculture_backend`, `aquaculture_frontend`, `aquaculture_mosquitto`, `aquaculture_postgres`.

Kalau container belum jalan:
```powershell
cd D:\smart-aquaculture\smart-aquaculture
docker compose up -d
```

### 1.2 Cek IP laptop Anda

```powershell
ipconfig
```

Catat **IPv4 Address** di bagian **Wireless LAN adapter Wi-Fi**.
Berdasarkan ipconfig Anda: **`192.168.100.91`**

> ⚠️ IP ini WAJIB SAMA dengan yang ada di firmware ESP32 (`MQTT_SERVER`).
> Cek ulang setiap kali restart laptop/router.

### 1.3 Buka Firewall Windows port 1883

Buka **PowerShell sebagai Administrator**, jalankan:

```powershell
New-NetFirewallRule -DisplayName "MQTT Mosquitto 1883" -Direction Inbound -LocalPort 1883 -Protocol TCP -Action Allow
```

Verifikasi rule sudah ada:
```powershell
Get-NetFirewallRule -DisplayName "MQTT Mosquitto 1883"
```

### 1.4 Test MQTT Broker bisa diakses

Dari PowerShell biasa:
```powershell
docker exec aquaculture_mosquitto mosquitto_sub -h localhost -u aquaculture -P aquaculture123 -t "lele/#" -v
```

Kalau muncul cursor tanpa error → MQTT broker OK. Biarkan jendela ini terbuka untuk monitoring. Tekan `Ctrl+C` kalau selesai test.

---

## BAGIAN 2 — SETUP ESP32 (Arduino IDE)

### 2.1 Install Arduino IDE

Download dari https://www.arduino.cc/en/software  
Pilih versi **2.x** (terbaru).

### 2.2 Tambah ESP32 Board ke Arduino IDE

1. Arduino IDE → **File → Preferences**
2. Di "Additional boards manager URLs", tambahkan:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. Klik OK
4. **Tools → Board → Boards Manager**
5. Cari `esp32` → Install **esp32 by Espressif Systems**
6. Tunggu selesai (±5 menit, file besar)

### 2.3 Install Library yang Dibutuhkan

**Tools → Manage Libraries**, install satu per satu:

| Library | Author | Versi |
|---------|--------|-------|
| **PubSubClient** | Nick O'Leary | 2.8.0+ |
| **ArduinoJson** | Benoit Blanchon | **6.x** (JANGAN v7) |
| **LiquidCrystal I2C** | Frank de Brabander | latest |
| **HX711** | Bogdan Necula | latest |
| **ESP32Servo** | Kevin Harrington | latest |
| **RTClib** | Adafruit | latest |

> ⚠️ ArduinoJson: Saat muncul pilihan versi, pilih **6.21.x**, bukan v7.

### 2.4 Buka File Firmware V3.2

1. Buka file `esp32/esp32_pakan_lele_v3_2.ino` di Arduino IDE
2. Kalau muncul popup "The file needs to be inside a folder" → klik **OK**
   (Arduino akan buat folder otomatis)

### 2.5 Edit Config Firmware

Cari dan edit bagian ini di atas file:

```cpp
// =====================================================
// WIFI + MQTT CONFIG
// =====================================================
const bool WIFI_ENABLE = true;
const bool MQTT_ENABLE = true;

// GANTI KE WIFI ANDA
const char* WIFI_SSID = "NamaWiFiAnda";       // ← Nama WiFi yang sama dengan laptop
const char* WIFI_PASSWORD = "PasswordWiFi";   // ← Password WiFi

// IP LAPTOP ANDA (dari ipconfig → WiFi adapter)
const char* MQTT_SERVER = "192.168.100.91";   // ← IP laptop Anda (sudah diisi)
const uint16_t MQTT_PORT = 1883;
const char* MQTT_USER = "aquaculture";        // ← jangan diubah
const char* MQTT_PASSWORD = "aquaculture123"; // ← jangan diubah

const char* DEVICE_ID = "pakan_lele_01";      // ← bisa diubah kalau multi ESP32
```

> 🔑 Kunci keberhasilan: `WIFI_SSID` = WiFi yang sama dengan laptop.
> Laptop dan ESP32 HARUS di jaringan yang sama!

### 2.6 Pilih Board dan Port

**Tools → Board → esp32 → DOIT ESP32 DEVKIT V1**
(atau sesuai board Anda)

**Tools → Port → COM14**
(sesuai port yang muncul saat ESP32 dicolok, cek Device Manager kalau tidak muncul)

### 2.7 Compile dan Upload

Klik tombol **→ Upload** (panah kanan).

Tunggu proses:
```
Compiling sketch...
Linking everything together...
Uploading...
Done uploading.
```

Kalau error:
- `PubSubClient.h: No such file` → library PubSubClient belum install
- `ArduinoJson.h: No such file` → library ArduinoJson belum install
- `fatal error: Preferences.h` → ESP32 core belum install di step 2.2

---

## BAGIAN 3 — VERIFIKASI ESP32 BOOT

### 3.1 Buka Serial Monitor

Arduino IDE → **Tools → Serial Monitor**
Set baud rate ke **115200**

Tekan tombol **RESET** di ESP32 (tombol kecil di board).

### 3.2 Output yang Diharapkan

```
=== PAKAN LELE V3.2 HYBRID ===
[BOOT] Step 1: GPIO init...
[BOOT] Step 2: Servo init...
[BOOT] Step 3: I2C + LCD init...
[BOOT] Step 4: Load Preferences...
  fishCount=1000, feedingPerDay=2, sampleReady=0
[BOOT] Step 5: RTC init...
  RTC OK
[BOOT] Step 6: WiFi + MQTT init...
[MQTT] Connected & subscribed to lele/device/pakan_lele_01/command
[BOOT] Step 7: HX711 init...
  Chamber=1, Sampling=1
[BOOT] Step 8: Tare all...
[BOOT] Step 9: Safety stop actuators...
[BOOT] Step 10: First publish status...
[BOOT] ✓ Setup complete, entering loop
```

### 3.3 Cek LCD

LCD seharusnya menampilkan:
```
Line 1: PAKAN LELE
Line 2: V3.2 Hybrid
```
Lalu:
```
Line 1: WiFi OK
Line 2: 192.168.100.xxx
```
Lalu:
```
Line 1: SYSTEM READY
Line 2: Next: 07:00
```
Lalu masuk ke menu utama:
```
Line 1: MENU UTAMA
Line 2: >Status Sistem
```

### 3.4 Diagnosa Kalau Boot Loop

Kalau "=== PAKAN LELE V3.2 HYBRID ===" muncul berulang → lihat di Step berapa crash:

| Terakhir muncul | Penyebab | Solusi |
|----------------|----------|--------|
| Hanya header, langsung restart | Library belum install | Install PubSubClient + ArduinoJson |
| Step 3 | LCD wiring salah / alamat I2C beda | Cek SDA=21, SCL=22. Test alamat LCD (0x27 atau 0x3F) |
| Step 5 | RTC tidak terdeteksi | Cek wiring DS3231 |
| Step 6 | Stuck di WiFi | Cek SSID/password, laptop & ESP32 satu jaringan |
| Step 7 | HX711 error | Cek wiring load cell |

**Cara bypass MQTT sementara untuk test LCD:**
Edit firmware, ubah: `const bool MQTT_ENABLE = false;`
Upload ulang → kalau LCD normal, masalahnya ada di MQTT/WiFi config.

---

## BAGIAN 4 — VERIFIKASI DASHBOARD WEB

### 4.1 Buka Dashboard

Buka browser, ketik: **http://localhost:3000**

Navigasi ke menu **Pakan Lele** di sidebar kiri.

### 4.2 Device Muncul Otomatis

Dalam 5-10 detik setelah ESP32 connect MQTT, device akan muncul:

```
┌─────────────────────────────┐
│ pakan_lele_01          ONLINE │
│ ID: pakan_lele_01            │
│ Kolam: — belum di-assign —   │
└─────────────────────────────┘
```

Kalau tidak muncul setelah 30 detik → cek troubleshooting di bawah.

### 4.3 Assign ke Kolam (Opsional)

Klik device → tab **Pengaturan** → klik **Assign Kolam**
Pilih kolam dari dropdown → Simpan.

---

## BAGIAN 5 — CARA DUAL CONTROL

### 5.1 Kontrol dari LCD (Cara Lama — Tetap Berfungsi)

Gunakan 4 tombol fisik:
- **UP** = scroll menu ke atas / nilai bertambah
- **DOWN** = scroll menu ke bawah / nilai berkurang
- **OK** = masuk / konfirmasi / simpan
- **BACK** = kembali ke menu sebelumnya

Struktur menu:
```
MENU UTAMA
├── 1. Status Sistem      → info mode, WiFi, MQTT, HX711
├── 2. Pakan Otomatis     → toggle Auto Feed, manual feed
├── 3. Timbang Biomassa   → sampling ikan, lihat rata², set jumlah
├── 4. Data Kolam         → jumlah ikan, frekuensi/hari, feed info
├── 5. Jadwal Pakan       → edit jadwal, auto generate
├── 6. Kalibrasi/Tare     → tare chamber, tare sampling
├── 7. Riwayat Akhir      → feed terakhir, sampling, error
└── 8. Pengaturan         → WiFi, RTC, Device Info
```

### 5.2 Kontrol dari Web Dashboard (BARU)

Buka **http://localhost:3000/lele-feeder**

Setiap tab di web = setiap menu di LCD:

#### Tab 1: Status Sistem
- **Mirror LCD** — menampilkan isi LCD 16×2 secara live
- **Virtual D-Pad** — UP/DOWN/OK/BACK → sama persis tombol fisik
  - Klik UP di web = seperti tekan tombol UP di hardware
  - Klik OK di web = seperti tekan tombol OK di hardware

#### Tab 2: Pakan Otomatis
- **Toggle Auto Feed** → nyala/mati pakan otomatis sesuai jadwal
- **Manual Feed Adaptif** → feed sesuai biomassa terkini (klik 1x langsung jalan)
- **Custom Gram** → ketik berapa gram yang mau dikirim

#### Tab 3: Timbang Biomassa
- **Mulai Sampling** → ESP32 langsung masuk mode sampling, lihat LCD untuk panduan
- **Set Jumlah Sample** → kirim ke device berapa ikan yang mau di-sampling
- **Reset Sampling** → hapus data sampling di device

#### Tab 4: Data Kolam
- **Jumlah Ikan** → ketik jumlah, klik Kirim → tersimpan di Preferences ESP32
- **Frekuensi/Hari** → ubah frekuensi → jadwal auto-generate otomatis

#### Tab 5: Jadwal Pakan
- **Edit per jadwal** → klik Edit di card jadwal → ubah jam:menit → Simpan
- **Toggle aktif/nonaktif** per jadwal
- **Auto-Generate** → buat ulang semua jadwal berdasar frekuensi/hari

#### Tab 6: Kalibrasi/Tare
- **Live reading** chamber dan sampling (update tiap 3 detik)
- **Tare Pakan / Tare Biomassa / Tare Semua** → kirim perintah ke ESP32

#### Tab 7: Riwayat Akhir
- **Feed Terakhir** — sukses/gagal, target vs aktual
- **Sampling Akhir** — rata² berat, biomassa
- **Error Terakhir** — kode error terakhir
- **Full history** — semua sesi, batch, error

#### Tab 8: Pengaturan
- Info koneksi WiFi, MQTT, RTC
- Assign device ke kolam

### 5.3 Sinkronisasi Otomatis

Tidak perlu refresh manual. Sistem update otomatis:
- **Web → ESP32**: command via MQTT, respons dalam 1-2 detik
- **ESP32 → Web**: status dikirim tiap 3 detik

Contoh skenario:
1. Anda tekan tombol OK di hardware → LCD masuk submenu
2. Web dashboard otomatis update (mirror LCD ikut berubah dalam 3 detik)
3. Atau sebaliknya, Anda klik OK di D-pad virtual web → LCD fisik ikut bergerak

---

## BAGIAN 6 — OPERASI NORMAL HARIAN

### 6.1 Urutan Pemakaian Awal (Pertama Kali)

```
1. Timbang Biomassa: sampling minimum 10 ikan
   → masuk menu Timbang Biomassa → Mulai Sampling
   → letakkan ikan satu per satu, tekan OK tiap ikan
   → selesai → rate pakan dihitung otomatis

2. Set Jumlah Ikan:
   → Data Kolam → Jumlah Ikan → isi angka

3. Set Jadwal:
   → Jadwal Pakan → pilih jadwal → atur jam:menit
   → ATAU klik Auto Generate di web

4. Nyalakan Auto Feed:
   → Pakan Otomatis → Auto Feed ON/OFF → ON

5. Selesai! Device akan pakan otomatis sesuai jadwal.
```

### 6.2 Monitoring Harian

Buka dashboard → tab **Status Sistem**:
- Status ONLINE/OFFLINE (hijau/merah)
- Countdown jadwal berikutnya
- Live berat chamber dan sampling
- Semua indikator hardware

### 6.3 Kalau Ingin Manual Feed

Dari web: tab **Pakan Otomatis** → klik **KIRIM PERINTAH FEED ADAPTIF**
Dari LCD: Pakan Otomatis → Mulai Feed Manual → OK=Start Feed

---

## BAGIAN 7 — TROUBLESHOOTING

### Device tidak muncul di dashboard

**Cek 1: ESP32 sudah konek MQTT?**
Serial Monitor Arduino → cari `[MQTT] Connected`

**Cek 2: Backend menerima data?**
```powershell
docker logs aquaculture_backend --tail 20
```

**Cek 3: MQTT menerima data dari ESP32?**
```powershell
docker exec aquaculture_mosquitto mosquitto_sub -h localhost -u aquaculture -P aquaculture123 -t "lele/#" -v
```
Reset ESP32 → seharusnya muncul JSON status di terminal ini.

**Cek 4: Firewall Windows**
```powershell
# Cek rule sudah ada
Get-NetFirewallRule -DisplayName "MQTT Mosquitto 1883"

# Kalau belum ada, buat:
New-NetFirewallRule -DisplayName "MQTT Mosquitto 1883" -Direction Inbound -LocalPort 1883 -Protocol TCP -Action Allow
```

**Cek 5: IP MQTT_SERVER benar?**
```powershell
ipconfig
# Pastikan IP di firmware = IP laptop di WiFi adapter
```

### Tombol virtual web tidak respons

1. Cek `mqtt_connected` di card status → harus hijau
2. Serial Monitor → saat klik tombol web harus muncul `[MQTT IN]`
3. Cek ack di tab Status → harus muncul "Device respond: btn"

### ESP32 tidak konek WiFi

1. Pastikan SSID & password benar (case sensitive, tidak ada spasi)
2. ESP32 tidak bisa konek ke WiFi 5GHz! Pastikan router pakai 2.4GHz
3. Jarak ESP32 tidak terlalu jauh dari router
4. Test: set MQTT_ENABLE=false, kalau WiFi konek → masalah di MQTT

### Dashboard error / blank

```powershell
# Restart semua service
docker compose down
docker compose up -d
```

---

## BAGIAN 8 — REFERENSI CEPAT

### Port yang Dipakai

| Service | URL | Keterangan |
|---------|-----|-----------|
| Dashboard | http://localhost:3000 | Web UI |
| Backend API | http://localhost:5000/api | REST API |
| MQTT Broker | 192.168.100.91:1883 | Untuk ESP32 |
| Grafana | http://localhost:3001 | Analytics |
| PostgreSQL | localhost:5432 | Database |

### MQTT Credentials

| Setting | Value |
|---------|-------|
| Host | 192.168.100.91 (IP laptop WiFi) |
| Port | 1883 |
| Username | aquaculture |
| Password | aquaculture123 |

### Firmware ESP32

| Setting | Value |
|---------|-------|
| WIFI_SSID | ← SSID WiFi yang sama dengan laptop |
| WIFI_PASSWORD | ← Password WiFi |
| MQTT_SERVER | 192.168.100.91 |
| MQTT_USER | aquaculture |
| MQTT_PASSWORD | aquaculture123 |
| DEVICE_ID | pakan_lele_01 |

### Command Docker Berguna

```powershell
# Cek semua container jalan
docker ps

# Restart semua
docker compose restart

# Rebuild setelah ada perubahan kode
docker compose up -d --build backend frontend

# Lihat log backend realtime
docker logs -f aquaculture_backend

# Monitor MQTT realtime
docker exec aquaculture_mosquitto mosquitto_sub -h localhost -u aquaculture -P aquaculture123 -t "lele/#" -v

# Jalankan migration database
Get-Content database\migration-lele-v3-2.sql | docker exec -i aquaculture_postgres psql -U aquaculture -d aquaculture
```

---

## ✅ CHECKLIST VERIFIKASI AKHIR

Tandai semua sebelum mulai operasi:

**Laptop/Server:**
- [ ] Docker Desktop running, semua container status Up
- [ ] http://localhost:3000 bisa dibuka
- [ ] Firewall port 1883 sudah dibuka
- [ ] IP laptop dicatat: **192.168.100.91**

**ESP32:**
- [ ] Library PubSubClient & ArduinoJson terinstall
- [ ] WIFI_SSID & WIFI_PASSWORD sudah diisi benar
- [ ] MQTT_SERVER = 192.168.100.91
- [ ] Upload sukses, tidak ada error merah
- [ ] Serial Monitor: muncul "[BOOT] ✓ Setup complete"
- [ ] LCD: tampil "SYSTEM READY" → masuk "MENU UTAMA"

**Integrasi:**
- [ ] ESP32 dan laptop di WiFi yang sama
- [ ] Dashboard: device "pakan_lele_01" muncul ONLINE
- [ ] Test klik D-pad virtual → LCD bergerak
- [ ] Test tekan tombol fisik → dashboard update

**Operasi:**
- [ ] Sampling biomassa sudah dilakukan (min 3 ikan)
- [ ] Jadwal pakan sudah diset
- [ ] Auto Feed sudah di-ON-kan

---

*Selamat! Sistem pakan lele dual control Anda siap digunakan. 🐟*
