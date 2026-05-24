# 📘 Tutorial Smart Aquaculture v2

Panduan instalasi & penggunaan sistem Smart Aquaculture versi terbaru dengan fitur:
- **Mode Ganda**: Auto-switch ESP32 realtime / Dummy data
- **Penjadwalan Pakan Otomatis**
- **Pencatatan Kematian & Estimasi Panen**
- **Notifikasi Risiko + Auto Drain & Refill**

---

## 🚀 Quick Start

### 1. Persyaratan
- Docker Desktop / Docker Engine + Compose
- 4 GB RAM minimum, 10 GB disk

### 2. Install dari ZIP

```bash
unzip smart-aquaculture-v2.zip
cd smart-aquaculture
```

### 3. Generate Password MQTT

**Linux/macOS:**
```bash
docker run --rm -v "$(pwd)/mosquitto/config:/mosquitto/config" \
  eclipse-mosquitto:2.0 mosquitto_passwd -U /mosquitto/config/passwd.txt
```

**Windows PowerShell:**
```powershell
docker run --rm -v "${PWD}/mosquitto/config:/mosquitto/config" eclipse-mosquitto:2.0 mosquitto_passwd -U /mosquitto/config/passwd.txt
```

### 4. Jalankan

**Jika sudah pernah install versi lama** (PENTING - schema berubah):
```bash
docker compose down -v
docker compose up -d --build
```

**Jika install baru:**
```bash
docker compose up -d --build
```

⏳ Build pertama: 5-15 menit.

### 5. Akses

| Service | URL | Login |
|---------|-----|-------|
| 🌐 Web App | http://localhost:3000 | - |
| 📊 Grafana | http://localhost:3001 | admin / admin123 |
| 💾 InfluxDB | http://localhost:8086 | admin / admin123456 |

---

## 🎯 Fitur Baru v2

### 🔄 Mode Ganda (Auto-Switch)

Setiap kolam punya 2 mode yang berganti **otomatis**:

**Mode ESP32 (Realtime)** 🟢
- Aktif saat ESP32 mengirim data via MQTT
- Data sensor dari hardware fisik

**Mode Dummy** 🔵
- Aktif saat ESP32 tidak terdeteksi (30 detik tanpa data)
- Atur nilai sensor lewat menu **Simulasi Dummy**

Tidak perlu setting manual — sistem deteksi koneksi otomatis.

---

### 🍽️ Penjadwalan Pakan Otomatis

Kolam → tab **Pakan** → **+ Tambah Jadwal**:
- Waktu (misal: 07:00 dan 16:00)
- Pilih hari aktif
- Jumlah dalam kg
- Jenis pakan

Sistem otomatis kirim perintah `feed` ke ESP32, catat ke log, dan buat notifikasi.

Bisa juga **Catat Manual** untuk pemberian pakan diluar jadwal.

---

### 💀 Pencatatan Kematian → Estimasi Panen

Kolam → tab **Kematian & Panen**:

**4 Stats:**
- **Populasi Awal**: jumlah saat tebar
- **Total Mati**: akumulasi kematian
- **Mortality Rate**: persentase kematian
- **Estimasi Panen**: sisa ikan yang akan dipanen

**Cara catat:**
1. Klik **+ Catat Kematian**
2. Isi jumlah & penyebab (Penyakit/Kualitas Air/Predator/Stress/Tidak Diketahui)
3. Stats terupdate otomatis

---

### 🚨 Notifikasi Risiko + Auto Drain & Refill

Saat sensor melebihi batas kritis (suhu > 30°C atau DO < 5 mg/L):

**Yang otomatis terjadi:**
1. 🔔 Notifikasi muncul di menu **Notifikasi**
2. 🚰 Katup pengurasan terbuka 30 detik
3. 🌊 Katup pengisian terbuka 60 detik
4. ✅ Selesai → notifikasi "Siklus Drain-Refill Selesai"

Setting di tab **Pengaturan** kolam: toggle Auto-Drain & Auto-Refill, atur threshold sensor.

Berlaku untuk data realtime ESP32 maupun data dummy.

---

### 📊 Semua Grafik Ditampilkan

Sekarang **5 grafik lengkap**: Suhu, Kedalaman, DO, Kekeruhan, pH — dengan area chart bergradient + auto-refresh 3 detik.

---

### 🎮 Kontrol Manual Lebih Masuk Akal

Tab **Kontrol** punya **2 katup terpisah**:

| Katup | Fungsi |
|-------|--------|
| 💧 Pengurasan | Buang air kotor keluar |
| 🌊 Pengisian | Isi air bersih masuk |

Plus tombol **Siklus Otomatis** untuk mengganti air dalam 1 klik.

---

### 🎨 UI Lebih Cerah

Tema light mode dengan aksen ocean cyan, kontras tinggi, sidebar dengan badge notifikasi, responsif mobile.

---

## 📱 Walkthrough Demo

### Skenario 1: Test Tanpa ESP32

1. Buka http://localhost:3000
2. **Peternakan** → pilih peternakan default
3. Pilih kolam (badge "Mode Dummy")
4. Menu **Simulasi Dummy** → pilih kolam target
5. Klik preset **"Suhu Tinggi"** → toggle **Auto-Send ON**
6. Kembali ke kolam → tab **Monitor**
7. Tunggu 5 detik: suhu jadi merah (>30°C)
8. Tunggu 30 detik: menu **Notifikasi** muncul "Suhu Air Terlalu Tinggi"
9. Tab **Log Aktivitas**: valve open → close → inlet open → close
10. ✅ Auto drain & refill bekerja!

### Skenario 2: Pakan Otomatis

1. Kolam → tab **Pakan** → **+ Tambah Jadwal**
2. Waktu 07:00, hari semua, jumlah 2.5 kg, simpan
3. Tambah jadwal 16:00, 2.5 kg, simpan
4. Otomatis jalan sesuai waktu sistem

### Skenario 3: Tracking Panen

1. Kolam → tab **Kematian & Panen** (lihat populasi awal: 1000)
2. **+ Catat Kematian** → 5 ekor, "tidak diketahui"
3. Stats: Mati=5, Rate=0.50%, Estimasi Panen=995
4. Catat lagi: 3 ekor, "penyakit"
5. Stats terupdate otomatis

---

## 🆘 Troubleshooting

### Container error setelah update
```bash
docker compose down -v   # ⚠️ hapus data lama!
docker compose up -d --build
```

### Notifikasi tidak muncul
- Cek threshold di tab **Pengaturan** kolam
- Pastikan **Auto-Drain Enabled** = ON
- Kirim data dummy melebihi threshold

### Estimasi panen tidak update
- Pastikan kolam punya `initial_fish_count` (otomatis ada untuk kolam baru)
- Untuk kolam lama: hapus & buat ulang

### ESP32 mode tetap "Dummy"
- Tunggu 30 detik setelah ESP32 mulai kirim data
- Cek MQTT topic: `aquaculture/{farm_id}/{pond_id}/sensors`
- Pastikan farm_id & pond_id ESP32 cocok dengan database

### Web tidak load setelah update
```bash
docker compose restart frontend backend
# atau rebuild
docker compose up -d --build frontend backend
```

---

## 📂 Struktur File Penting

```
smart-aquaculture/
├── backend/server.js                  # API + MQTT + cron + auto-drain
├── frontend/src/
│   ├── App.jsx                        # Routes + sidebar notif badge
│   ├── pages/
│   │   ├── Dashboard.jsx             # 6 stat cards summary
│   │   ├── Farms.jsx                 # CRUD peternakan
│   │   ├── FarmDetail.jsx            # List kolam (ada badge mode)
│   │   ├── PondDetail.jsx            # 7 tab kolam
│   │   ├── Simulation.jsx            # Dummy data simulator
│   │   ├── Notifications.jsx         # Filter notifikasi
│   │   └── GrafanaView.jsx           # Embed Grafana
│   └── components/                    # 7 tab components
├── esp32/esp32_aquaculture.ino       # Firmware v2 (2 katup)
└── database/init.sql                  # Schema v2 lengkap
```

---

## 🔌 API Endpoints Baru

```
# Feeding
GET    /api/feeding-schedules?pond_id=...
POST   /api/feeding-schedules
DELETE /api/feeding-schedules/:id
GET    /api/feeding-logs/:pondId
POST   /api/feeding-logs

# Mortality
GET    /api/mortality/:pondId
GET    /api/mortality/:pondId/summary
POST   /api/mortality
DELETE /api/mortality/:id

# Notifications
GET    /api/notifications?pond_id=&unread_only=&limit=
GET    /api/notifications/unread-count
PUT    /api/notifications/:id/read
PUT    /api/notifications/read-all

# Auto control
POST   /api/control/:pondId/drain-cycle   # Trigger siklus penuh

# Dashboard summary
GET    /api/dashboard/summary
```

---

🎉 **Selamat menggunakan Smart Aquaculture v2!**
