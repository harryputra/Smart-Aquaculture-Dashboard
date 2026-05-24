# 📋 Patch Smart Aquaculture — Dashboard Pakan Lele Final

Update halaman **Pakan Lele** sesuai spesifikasi 8 menu LCD final + 10 panel dashboard.

## 🎯 Struktur Baru: 8 Tab Sesuai Menu LCD

| Tab | Sumber | Fitur Utama |
|-----|--------|-------------|
| **Status Sistem** | LCD Status | Mirror LCD (STANDBY/AUTO FEED/OFFLINE) + indicator hardware |
| **Pakan Otomatis** | LCD Pakan Otomatis | Toggle Auto Feed RTC + **Manual Feed Adaptif** (bukan test 100/300g) |
| **Timbang Biomassa** | LCD Timbang Biomassa | Riwayat sampel + grafik pertumbuhan + warning bila <10 sampel |
| **Data Kolam** | LCD Data Kolam | Edit jumlah ikan, feeding rate %, frekuensi/hari + preview perhitungan adaptif live |
| **Jadwal Pakan** | LCD Jadwal Pakan | **Jam-based** (07:00, 17:00), bukan interval test 5 menit |
| **Kalibrasi/Tare** | LCD Kalibrasi | Tombol Tare Chamber/Sampling/Semua + Riwayat tare. Kalibrasi factor **dikunci di Technician Mode** |
| **Riwayat Terakhir** | LCD Riwayat | 3 stat ringkasan (Last Feed/Sampling/Error) + 3 sub-tab full history |
| **Pengaturan** | LCD Pengaturan | Info device + daftar fitur Technician Mode yang disembunyikan |

## 🚀 Cara Apply

### 1. Extract patch ke folder existing
```powershell
cd D:\smart-aquaculture\smart-aquaculture
# Extract patch-lele-final-spec.zip ke folder ini, timpa file yang sama
```

### 2. Jalankan migration database

```powershell
docker compose start postgres
Start-Sleep -Seconds 5
Get-Content database\migration-lele-final.sql | docker exec -i aquaculture_postgres psql -U aquaculture -d aquaculture
```

Linux/Mac:
```bash
cat database/migration-lele-final.sql | docker exec -i aquaculture_postgres psql -U aquaculture -d aquaculture
```

### 3. Rebuild backend & frontend
```powershell
docker compose up -d --build backend frontend
```

### 4. Test
- Buka http://localhost:3000 → menu **Pakan Lele**
- Cek 8 tab baru sesuai spec

## ✨ Highlight Perubahan

### ✅ Manual Feed Pakai Adaptif
Test feeding 100/300 gram dihapus dari menu utama. Tombol **Mulai Manual Feed** sekarang
otomatis menghitung target berdasarkan biomassa sampling × fish count × feeding rate / per day.
Logika sistem tetap konsisten.

### ✅ Jadwal Jam-Based
Jadwal pakan: jam tertentu (misalnya 07:00, 17:00) + toggle aktif/nonaktif per jadwal.
Tidak lagi pakai interval menit untuk versi final.

### ✅ Min Sampling 10 Ikan
Sistem warning bila sampling terakhir <10 ikan (untuk kolam 1000-3000 ekor).
Min sampel bisa disesuaikan di tab Data Kolam.

### ✅ Technician Mode Lock
Fitur berisiko (test 100/300g, factory reset, actuator test, kalibrasi faktor) dipindah ke
Technician Mode (kombinasi tombol saat booting), tidak ditampilkan di menu operator.

### ✅ Live Feed Calculation Preview
Tab Data Kolam menampilkan preview perhitungan adaptif **real-time** saat operator
mengubah jumlah ikan / feeding rate / frequency:
```
Biomassa = avg × ikan / 1000
Pakan/Hari = Biomassa × rate%
Pakan/Jadwal = Pakan/Hari / frekuensi
```

### ✅ Grafik Pertumbuhan
Tab Biomassa otomatis plot grafik tren bobot rata-rata dari snapshot sampling
(berguna untuk monitoring pertumbuhan jangka panjang).

## 📡 Command MQTT Baru (untuk Firmware)

Dashboard akan kirim command ke topic `lele/device/{device_id}/command`:

| Command | Payload | Aksi di ESP32 |
|---------|---------|----------------|
| `manual_feed_adaptive` | `{ target_g, source }` | Mulai feeding session dengan target gram |
| `set_auto_feed` | `{ enabled }` | Toggle auto feed RTC |
| `tare` | `{ scale_type }` | Tare chamber/sampling/all |

> **Untuk firmware ESP32 Anda**: tambahkan subscribe ke `lele/device/{DEVICE_ID}/command` dan handle 3 command di atas. Saya bisa bantu code-nya kalau perlu.

## 📁 File yang Diubah/Baru

```
patch-lele-final-spec.zip
├── backend/lele-integration.js          ← Update: 10+ endpoint baru
├── frontend/src/
│   ├── pages/LeleFeeder.jsx             ← Rewrite: 8 tab struktur
│   ├── services/leleApi.js              ← Update: API client lengkap
│   └── components/lele/                 ← BARU (8 panel)
│       ├── DeviceStatusPanel.jsx
│       ├── FeedingControlPanel.jsx
│       ├── BiomassSamplingPanel.jsx
│       ├── PondDataPanel.jsx
│       ├── FeedingSchedulePanel.jsx
│       ├── SensorHealthPanel.jsx
│       ├── LastActivityPanel.jsx
│       └── SystemSettingsPanel.jsx
└── database/migration-lele-final.sql    ← BARU: 4 tabel baru
```
