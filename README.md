# 🐟 Smart Aquaculture Monitoring System

Sistem monitoring dan kontrol peternakan ikan modern berbasis IoT dengan arsitektur microservices. Dirancang untuk mengelola multiple peternakan dengan multiple kolam, lengkap dengan monitoring sensor real-time, kontrol katup otomatis, penjadwalan, dan simulasi.

![Stack](https://img.shields.io/badge/Stack-IoT%20%2B%20MQTT%20%2B%20InfluxDB%20%2B%20PostgreSQL%20%2B%20Grafana-blue)
![License](https://img.shields.io/badge/License-MIT-green)
![Docker](https://img.shields.io/badge/Docker-Ready-blue)

---

## ✨ Fitur Utama

### 📊 Monitoring Real-time
- 🌡️ **Suhu Air** (Temperature)
- 📏 **Kedalaman Air** (Depth)
- 💧 **Dissolved Oxygen** (DO)
- 🌫️ **Kekeruhan** (Turbidity)
- ⚗️ **pH Air**

### 🎮 Kontrol Kolam
- **Manual Mode** - Buka/tutup katup dengan satu klik
- **Scheduled Mode** - Jadwal pengurasan otomatis (harian/mingguan)
- **Auto Mode** - Pengurasan otomatis saat sensor melebihi batas

### 🏗️ Manajemen Multi-Tenant
- Kelola banyak peternakan
- Kelola banyak kolam per peternakan
- Threshold sensor per-kolam

### 🧪 Simulasi
- Atur nilai sensor manual via slider
- Mode auto-send untuk testing berkelanjutan
- 6 preset skenario (Normal, Overheating, Low DO, dll)

### 📈 Visualisasi
- Dashboard React dengan tema "Ocean Depths"
- Grafana embedded untuk analitik mendalam
- Real-time charts dengan auto-refresh

---

## 🏗️ Arsitektur Sistem

```
┌─────────────┐
│   ESP32     │ ─┐
│  (Sensor)   │  │
└─────────────┘  │   ┌──────────────┐
                 ├──▶│   Mosquitto  │
┌─────────────┐  │   │     MQTT     │
│  Simulator  │ ─┘   └──────┬───────┘
│   (Web)     │             │
└─────────────┘             ▼
                     ┌──────────────┐
                     │   Telegraf   │
                     └──┬────────┬──┘
                        │        │
                        ▼        ▼
                ┌──────────┐  ┌──────────┐
                │ InfluxDB │  │ Postgres │
                │(TimeSeries│  │(Relational│
                └────┬─────┘  └────┬─────┘
                     │             │
                     ▼             ▼
              ┌──────────┐   ┌──────────┐
              │ Grafana  │   │ Backend  │
              │          │   │ Node.js  │
              └────┬─────┘   └────┬─────┘
                   │              │
                   └──────┬───────┘
                          ▼
                   ┌──────────────┐
                   │   Frontend   │
                   │    React     │
                   └──────────────┘
```

---

## 🚀 Quick Start

### Prasyarat
- Docker Desktop atau Docker Engine
- Docker Compose v2+
- 4GB RAM, 10GB storage

### Jalankan dalam 1 Perintah (one-click)

```bash
# Linux / macOS / Git Bash
./run.sh            # setup .env + passwd MQTT + build + start, lalu tampilkan ringkasan

# Windows
run.bat
```

Lalu buka **http://localhost:3000** (frontend) — Grafana ter-embed di
`http://localhost:3000/grafana/`. Tanpa login (aplikasi tidak punya autentikasi).

Subcommand lain: `./run.sh down | restart | status | logs [svc] | reset | doctor | mqtt-passwd | help`.

📖 **Tutorial lengkap:** [docs/TUTORIAL-INSTALASI.md](docs/TUTORIAL-INSTALASI.md)

---

## 🖥️ Deploy ke Server Lab trin (Produksi)

Stack ini berat (7 container, termasuk InfluxDB + PostgreSQL + Grafana). VM
`docker-host` hanya **4 GB RAM / 2 vCPU** dan dibagi dengan app lain — sudah
dipasang **memory limit per-service** (total ±1.9 GB) agar tidak OOM.

```bash
# di VM (user trin, lokasi /home/trin/docker/apps/smart-aquaculture/)
cp .env.example .env
nano .env                 # WAJIB: ganti semua secret [GANTI], set WEB_PORT bebas,
                          #        set GRAFANA_ROOT_URL ke domain publik
./run.sh mqtt-passwd      # bila MQTT_PASSWORD diubah, regenerate file passwd
./run.sh deploy           # build + start mode produksi (detached, auto-restart, tahan reboot)
```

`deploy` akan **memperingatkan bila secret masih default** sebelum lanjut.

### Publikasi via Cloudflare Tunnel
Hanya **frontend** yang dipublikasikan (port DB/backend/Grafana di-bind ke
`127.0.0.1` saja — tidak terbuka ke publik).

1. Cloudflare dashboard → Tunnels → **proxmox-server** → *Public Hostname*
2. Tambah `aquaculture.trin-polman.id` → service `http://localhost:${WEB_PORT}`
3. Set `GRAFANA_ROOT_URL=https://aquaculture.trin-polman.id/grafana/` di `.env` →
   `./run.sh prod-restart`
4. **ESP32** konek MQTT ke `172.16.67.5:1883` (buka port `1883` di UFW; ini satu-satunya
   port non-HTTP yang perlu di-expose ke LAN).

> ⚠️ Pilih `WEB_PORT` yang **bebas** di host — `8088` (koperasi) & `33061` (mariadb) sudah dipakai.

### Verifikasi cepat (TTFB)
```bash
curl -s -o /dev/null -w "TTFB:%{time_starttransfer} Total:%{time_total}\n" \
  https://aquaculture.trin-polman.id/api/health
```
TTFB ≤ ~150ms = app sehat. Endpoint `/api/health` melakukan ping DB ringan.

### Update / redeploy
```bash
git pull && ./run.sh deploy        # rebuild image + restart, data volume tetap aman
```

Kelola produksi: `./run.sh prod-logs` (Ctrl+C keluar log, app tetap jalan) ·
`./run.sh prod-restart` · `./run.sh prod-down`.

---

## 🛠️ Tech Stack

### Backend
- **Node.js 20** + **Express** - REST API
- **MQTT.js** - Komunikasi MQTT
- **node-postgres (pg)** - PostgreSQL client
- **influxdb-client** - InfluxDB v2 client
- **node-cron** - Penjadwalan

### Frontend
- **React 18** + **Vite** - UI framework
- **React Router** - Routing
- **Recharts** - Charts
- **Lucide React** - Icons
- **CSS Variables** - Theming

### Infrastructure
- **Eclipse Mosquitto 2.0** - MQTT broker
- **Telegraf 1.28** - Data collector
- **InfluxDB 2.7** - Time-series database
- **PostgreSQL 15** - Relational database
- **Grafana 10.2** - Visualization

### Hardware
- **ESP32** - Microcontroller dengan WiFi
- **PubSubClient** - Library MQTT untuk Arduino
- **ArduinoJson** - JSON parser

---

## 📁 Struktur Project

```
smart-aquaculture/
├── docker-compose.yml          # Orchestration semua service
├── README.md                   # Dokumentasi ini
│
├── backend/                    # Node.js API
│   ├── server.js              # Express server + MQTT handler
│   ├── package.json
│   └── Dockerfile
│
├── frontend/                   # React Web App
│   ├── src/
│   │   ├── App.jsx           # Routes + Layout
│   │   ├── index.css         # Theme "Ocean Depths"
│   │   ├── services/api.js   # API client
│   │   └── pages/
│   │       ├── Dashboard.jsx
│   │       ├── Farms.jsx
│   │       ├── FarmDetail.jsx
│   │       ├── PondDetail.jsx
│   │       ├── Simulation.jsx
│   │       └── GrafanaView.jsx
│   ├── Dockerfile
│   └── nginx.conf
│
├── database/
│   └── init.sql               # Schema PostgreSQL
│
├── esp32/
│   └── esp32_aquaculture.ino  # Kode Arduino untuk ESP32
│
├── mosquitto/
│   └── config/
│       ├── mosquitto.conf
│       └── passwd.txt
│
├── telegraf/
│   └── telegraf.conf          # Bridge MQTT → InfluxDB + Postgres
│
├── grafana/
│   ├── provisioning/
│   │   ├── datasources/
│   │   └── dashboards/
│   └── dashboards/
│       └── aquaculture.json
│
└── docs/
    └── TUTORIAL-INSTALASI.md  # Tutorial lengkap
```

---

## 🌐 Endpoint & Port

**Produksi** (`./run.sh deploy`) hanya mem-*publish* **frontend** + **MQTT** ke host.
Postgres/InfluxDB/Grafana/backend **tidak** dibuka ke host (diakses lewat jaringan
docker internal / proxy nginx) — supaya tak bentrok port di VM bersama & DB aman.
Port internal hanya dibuka di **dev lokal** (`./run.sh up`, via `docker-compose.debug.yml`).
Nilai port & kredensial diambil dari `.env` (lihat `.env.example`).

| Service | URL / Bind | Publish ke host? | Default Credentials |
|---------|------------|------------------|---------------------|
| Frontend | `http://localhost:${WEB_PORT}` (3000) | ✅ prod & dev → Cloudflare Tunnel | - |
| Grafana (embed) | `http://localhost:${WEB_PORT}/grafana/` | ✅ lewat frontend | anonymous Viewer |
| API (via proxy) | `http://localhost:${WEB_PORT}/api/...` | ✅ lewat frontend | - |
| MQTT | `0.0.0.0:${MQTT_PORT}` (1883) | ✅ prod & dev (LAN, untuk ESP32) | `$MQTT_USER` / `$MQTT_PASSWORD` |
| Grafana (admin) | `127.0.0.1:${GRAFANA_PORT}` (3001) | 🔧 dev only | admin / `$GRAFANA_ADMIN_PASSWORD` |
| Backend (langsung) | `127.0.0.1:${BACKEND_PORT}` (5000) | 🔧 dev only | - |
| InfluxDB | `127.0.0.1:${INFLUX_PORT}` (8086) | 🔧 dev only | admin / `$INFLUX_ADMIN_PASSWORD` |
| PostgreSQL | `127.0.0.1:${DB_PORT}` (5432) | 🔧 dev only | `$DB_USER` / `$DB_PASSWORD` |

> **Port bentrok di server?** Produksi hanya butuh `WEB_PORT` & `MQTT_PORT` bebas.
> Jika bentrok, ubah keduanya di `.env` lalu `./run.sh deploy` lagi. Akses DB di
> server: `docker compose exec postgres psql -U $DB_USER $DB_NAME` (tak perlu port host).

---

## 📡 MQTT Topics

```
aquaculture/{farm_id}/{pond_id}/sensors    # Data sensor (dari ESP32 → Server)
aquaculture/{farm_id}/{pond_id}/control    # Perintah kontrol (Server → ESP32)
aquaculture/{farm_id}/{pond_id}/status     # Status device (ESP32 → Server)
```

### Format Payload Sensor
```json
{
  "temperature": 27.5,
  "depth": 120,
  "dissolved_oxygen": 6.8,
  "turbidity": 15,
  "ph": 7.2,
  "timestamp": 1731234567890
}
```

### Format Perintah Kontrol
```json
{
  "command": "open_valve" | "close_valve",
  "source": "manual" | "schedule" | "auto"
}
```

---

## 🎨 Tema UI

Project ini menggunakan tema **"Ocean Depths"** dengan dark mode profesional:

- **Background**: `#0a0e1a` (deep ocean)
- **Primary**: `#06b6d4` (cyan)
- **Accent**: `#3b82f6` (blue)
- **Fonts**: Outfit (display), Plus Jakarta Sans (body), JetBrains Mono (mono)

---

## 🔒 Default Threshold Sensor

| Sensor | Min | Max | Unit |
|--------|-----|-----|------|
| Suhu | 25 | 30 | °C |
| Kedalaman | 80 | 150 | cm |
| Dissolved Oxygen | 5 | 8 | mg/L |
| Kekeruhan | - | 50 | NTU |
| pH | 6.5 | 8.5 | - |

Threshold dapat diubah per-kolam di menu **Pengaturan**.

---

## 📜 Lisensi

MIT License - silakan gunakan, modifikasi, dan distribusikan untuk keperluan apapun.

---

## 🤝 Kontribusi

Project ini adalah template open. Anda bebas:
- Menambah fitur baru (notifikasi WhatsApp, alarm suara, dll)
- Mengganti sensor dengan yang real
- Modify UI sesuai brand
- Deploy ke cloud (AWS, GCP, DigitalOcean)

---

## 📞 Resources

- **Tutorial**: [docs/TUTORIAL-INSTALASI.md](docs/TUTORIAL-INSTALASI.md)
- **MQTT Docs**: https://mosquitto.org/documentation/
- **InfluxDB Flux**: https://docs.influxdata.com/flux/
- **Grafana**: https://grafana.com/docs/

---

Made with 💙 for the future of sustainable aquaculture
#   S m a r t - A q u a c u l t u r e - D a s h b o a r d  
 