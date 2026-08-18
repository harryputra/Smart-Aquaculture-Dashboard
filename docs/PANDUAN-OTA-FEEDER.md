# Panduan Lengkap — OTA Feeder, Anti "Offline saat Feeding", & Pakan Offline

> Panduan menyeluruh untuk sistem **pemberi pakan lele** (ESP32). Mencakup:
> 1. **OTA** (update firmware jarak jauh) penuh — arsitektur, bootstrap sekali, upload, trigger, rollback, uji.
> 2. **Anti "status mati di dashboard saat memberi pakan"** — sudah diperbaiki; cara verifikasi.
> 3. **Pemberian pakan tetap jalan tanpa internet** + **distribusi persen offline** sesuai Rencana Pakan.
> 4. **Troubleshooting "sistem tiba‑tiba mati saat request pakan manual/langsung"**.
>
> Status ringkas:
> | Bagian | Status |
> |---|---|
> | Anti offline‑palsu saat feeding | ✅ Selesai (deploy backend + flash firmware terbaru) |
> | Backend OTA (katalog, upload, trigger, self‑check, rollout) | ✅ Selesai (`backend/lele-ota.js`, `frontend/src/pages/Firmware.jsx`) |
> | Firmware OTA di feeder | ✅ **Kode v3.9 dibuat** (`esp32/pakan_lele_v3_9.ino`) — tinggal **compile + bootstrap flash** sekali |
> | Distribusi persen **offline** (onboard) | ✅ **Kode v3.9 dibuat** (`scheduleGram` + backend dual‑mode) — tinggal flash |
>
> **v3.9 (`esp32/pakan_lele_v3_9.ino`) = v3.8 + OTA (HTTPS+sha256+rollback) +
> `scheduleGram` (pakan persen OFFLINE) + heartbeat.** Backend `feed-plan.js`
> otomatis: device ≥ v3.9 → onboard offline; < v3.9 → online‑driven. **Wajib
> Anda compile & uji** sebelum produksi.

---

## 0. Peta arsitektur (siapa mengerjakan apa)

```
                 ┌───────────────── DASHBOARD (server) ─────────────────┐
                 │  Rencana Pakan (biomassa → % → gram)                  │
                 │  Halaman Firmware (upload .bin, trigger OTA)          │
                 │  backend: lele-ota.js (katalog+trigger), feed-plan.js │
                 └───────────────▲───────────────┬──────────────────────┘
                          status/ack/ota_status  │ command / config / ota (MQTT WSS)
                                 │                ▼
                 ┌───────────────┴──────────── FEEDER ESP32 ────────────┐
                 │  RTC (jadwal offline)   HX711 (timbang)              │
                 │  Auger/Servo/Spinner    Update.h (OTA dual-partition)│
                 └──────────────────────────────────────────────────────┘
```

- **Online**: dashboard mengirim `manual_feed_gram` di jam sesi (mode sekarang).
- **Offline (v3.9)**: firmware menyimpan **gram per jadwal** di NVS → memberi pakan
  sendiri lewat RTC walau internet/dashboard mati. Persen di dashboard →
  dihitung jadi **gram per slot** → di‑push ke firmware.

---

## 1. Anti "status mati di dashboard saat memberi pakan" ✅

### Penyebab
Saat feeding, `loop()` firmware **terblokir** di `runFeedingSession` (motor +
timbang). Firmware lama berhenti mengirim `status` > 30 dtk → backend menandai
**OFFLINE**, lalu ONLINE lagi setelah selesai.

### Yang sudah diperbaiki
- **Firmware** (v3.2/v3.5/v3.8): `publishDeviceStatus(false)` (heartbeat throttle
  3 dtk) dipanggil di `maintainNetwork()` — dan `maintainNetwork()` dipanggil di
  **semua loop feeding** (fill/dispense/anti‑clog/settling). Jadi status tetap
  terkirim tiap ~3 dtk selama memberi pakan.
- **Backend** (`lele-integration.js`): `touchLastSeen()` menyegarkan `last_seen`
  dari **setiap** pesan device (feed/batch/session/summary/progress/ack), bukan
  hanya `/status`.

### Cara verifikasi (setelah deploy + flash)
1. `git pull && ./run.sh deploy` (backend).
2. Flash firmware terbaru ke feeder.
3. Picu 1× pemberian pakan → amati badge status kolam di dashboard.
   **Harus tetap "Feeder Online"** sepanjang proses (tidak berkedip offline).

> Jika **masih** offline saat feeding padahal firmware terbaru → kemungkinan
> **brownout daya** (lihat Bagian 4), bukan lagi masalah deteksi.

---

## 2. OTA — Update Firmware Jarak Jauh (penuh)

### 2.1 Arsitektur (sudah jadi di backend)
- **Katalog firmware**: tabel `lele_firmware` (`migration-ota.sql`).
- **Upload**: `POST /api/lele/firmware` (Pemilik/Superadmin) → simpan `.bin` +
  hitung **sha256** + tandai `is_latest`.
- **Trigger**: `POST /api/lele/devices/:id/ota` → publish **manifest** ke
  `lele/device/<id>/ota`:
  ```json
  { "version": "3.9.0", "url": "https://…/api/lele/firmware/download/<id>", "sha256": "<64 hex>" }
  ```
- **Self‑check** (device narik sendiri): `GET /api/lele/firmware/latest?model=pakan_lele&current=<ver>&device=<id>`
  → `{ update_available, version, url, sha256 }`.
- **Download publik** (tanpa login, untuk device): `GET /api/lele/firmware/download/:id`.
- **Rollout canary** & **log**: `POST /api/lele/ota/rollout`, `GET /api/lele/ota/log`.
- **UI**: halaman **Firmware (OTA)** di dashboard (upload, set latest, trigger, progres).

### 2.2 Sisi firmware (v3.5 → port ke v3.9)
Firmware **v3.5** (`esp32/esp32_code/pakan_lele_v3_5_pwmcontrol.ino`) sudah
mengimplementasikan OTA yang **cocok** dengan backend:
- Include: `WiFiClientSecure.h`, `Update.h`, `mbedtls/md.h` (sha256 lintas‑versi).
- `FIRMWARE_VERSION`, `OTA_API_HOST`, `OTA_TLS_INSECURE`, `OTA_SELFCHECK_ENABLE`.
- Subscribe `topicOta` = `lele/device/<id>/ota`.
- `onMqttMessage` cabang OTA: parse `{version,url,sha256}`, skip bila versi sama.
- `performOTA()`: HTTPS pull → `Update.begin` → tulis + hitung **sha256 (mbedtls)**
  → cocokkan → `Update.end(true)` → `ESP.restart()`.
- `esp_ota_mark_app_valid_cancel_rollback()` saat boot sukses (rollback otomatis
  bila firmware baru gagal boot).
- `firmware_version` disertakan di payload status.

**Yang perlu dikerjakan:** port blok OTA v3.5 ke firmware yang Anda pakai (v3.8)
→ jadikan **v3.9**. (Saya siapkan diff‑nya; lihat Bagian 5.)

### 2.3 ⚠️ BOOTSTRAP sekali (WAJIB, harus dekat alat)
OTA butuh **partisi dual‑OTA**. Firmware biasa (single‑app) **tidak bisa** OTA.
Jadi **flash pertama v3.9 lewat kabel USB** dengan skema partisi yang benar:

1. Arduino IDE → **Tools → Partition Scheme** → pilih yang ada 2 slot app, mis.
   **"Minimal SPIFFS (1.9MB APP with OTA / …)"** atau **"Default 4MB with spiffs
   (1.2MB APP/…OTA)"** — **jangan** "Huge APP (3MB No OTA)".
2. Isi `FIRMWARE_VERSION` (mis. `"3.9.0"`), `OTA_API_HOST` (mis.
   `aquaculture.trin-polman.id` — domain dashboard, HTTPS), WiFi, MQTT.
3. **Upload via USB.** Setelah ini, update berikutnya cukup **OTA nirkabel**.

> Setelah bootstrap, naikkan versi tiap rilis (`3.9.1`, `3.9.2`, …) supaya
> self‑check & manifest bisa membedakan "ada update".

### 2.4 Alur update rutin (setelah bootstrap)
1. Compile firmware baru → **Sketch → Export Compiled Binary** → dapat `.bin`.
2. Dashboard → **Firmware (OTA)** → **Upload** `.bin` (isi model `pakan_lele` +
   versi) → **Set Latest**.
3. **Trigger** ke device (atau device menemukan sendiri via self‑check) → device
   unduh, verifikasi sha256, flash, reboot, lapor `ota_status`.
4. Pantau progres di UI. Bila gagal verifikasi/boot → **rollback otomatis** ke
   firmware lama (device tetap hidup).

### 2.5 Uji OTA (lihat juga `docs/UJI-OTA.md`)
- Upload firmware dgn `FIRMWARE_VERSION` **lebih tinggi** → Set Latest → Trigger.
- Serial device: `[OTA] progress … sha256 OK … restart`.
- Dashboard: `firmware_version` device berubah ke versi baru.
- Uji **rollback**: sengaja upload `.bin` rusak → device tolak (sha256 mismatch)
  atau gagal boot → kembali ke versi lama otomatis.

---

## 3. Pemberian pakan OFFLINE + distribusi persen (v3.9)

### 3.1 Prinsip
- Jadwal disimpan di **RTC + NVS** feeder → tetap jalan tanpa internet.
- Agar porsi **sesuai persen Rencana Pakan**, dashboard menghitung **gram per
  slot** (`gram = kebutuhan_harian × persen`) lalu **push ke firmware**. Firmware
  menyimpan `scheduleGram[slot]` dan memberi gram itu di jamnya.

### 3.2 Perubahan firmware (v3.9) — ringkas
```cpp
float scheduleGram[SCHEDULE_COUNT] = {0,0,0,0,0,0};   // 0 = pakai adaptif lama
// NVS load/save: prefs.getFloat/putFloat("g0".."g5", ...)
// config handler: if (doc.containsKey("gram")) scheduleGram[idx] = doc["gram"];
// checkAutoSchedule():
//   float target = (scheduleGram[i] > 0.5f) ? scheduleGram[i]
//                                           : calculateFeedPerScheduleGram();
//   runFeedingSession(target, "JADWAL");
// status schedules JSON: tambah "gram": scheduleGram[i]
```

### 3.3 Dua mode (hindari dobel)
| Mode | Kapan | Yang memberi pakan | auto_feed onboard | Cron dashboard |
|---|---|---|---|---|
| **Online** (sekarang) | firmware < v3.9 | Dashboard (`manual_feed_gram`) | **OFF** | **AKTIF** |
| **Offline** (v3.9) | firmware ≥ v3.9 | **Feeder onboard** (`scheduleGram`) | **ON** | **NON‑AKTIF** utk device ini |

**Aturan backend (feed-plan.js):** saat menyimpan Rencana Pakan, cek
`firmware_version` device:
- **≥ 3.9** → push `gram` per slot + `set_auto_feed: true` (onboard jalan offline);
  cron **skip** device ini (biar tak dobel).
- **< 3.9** → tetap online‑driven (`set_auto_feed: false`, cron kirim gram).

> Dengan begitu, upgrade firmware = otomatis pindah ke mode offline tanpa ubah
> cara pakai di dashboard.

### 3.4 Sinkron biomassa (agar gram cocok)
Dashboard sudah bisa push `fish_count` & `avg_fish_g` ke firmware. Untuk mode
offline, **push langsung `gram` per slot** (bukan mengandalkan hitungan onboard)
→ porsi persis sama dengan Rencana Pakan, apa pun rate onboard.

---

## 4. Troubleshooting "sistem tiba‑tiba mati saat request pakan"

Gejala: kirim pakan (manual/jadwal) → alat **offline / reboot / feeding gagal**.
Tiga akar berbeda — bedakan dengan **Serial Monitor** saat 1× pemberian.

### A. "Offline palsu" (deteksi) — SUDAH diperbaiki
- Ciri: **log feeding tetap jalan** di Serial, hanya **dashboard** yang berkedip offline.
- Solusi: flash firmware terbaru (heartbeat) + deploy backend. (Bagian 1)

### B. **Brownout listrik** (paling sering bikin GAGAL) ⚠️
- Ciri: Serial **reboot** (muncul banner boot `=== … ===`) atau `[WiFi]/[MQTT]`
  reconnect **persis saat motor/spinner mulai** → arus besar → tegangan drop.
- Solusi hardware:
  - **Pisahkan suplai** motor/stepper/servo dari ESP32 (jangan satu regulator).
  - PSU cukup ampere (puncak motor+spinner+servo bisa 2–3A).
  - **Kapasitor** elektrolit besar (≥1000µF) + 0.1µF keramik di suplai ESP32.
  - Kabel daya lebih **tebal & pendek**, ground bersama.

### C. **DISP_TIMEOUT — "Chamber tidak kosong"** (mekanis/sensor)
- Arti: chamber terisi & pintu dibuka, tapi 60 dtk berat **tak turun** → pakan
  **nyangkut** / tak keluar.
- Cek: pakan keluar atau macet? chamber fisik kosong tapi dashboard "Chamber X g">0?
- Solusi:
  1. **Tare ulang chamber** (tab Kalibrasi/Tare) — bila kosong tapi baca ≠ 0.
  2. Naikkan **spinner PWM** (Kontrol Pakan → Sebaran → 255).
  3. Pintu mode **Instan** bila pakan gampang nyangkut.
  4. Pelet **kering & ukuran pas**, corong bersih; servo pintu membuka penuh.

### Tabel pembeda cepat
| Yang Anda lihat di Serial saat feed | Akar | Solusi |
|---|---|---|
| Log feeding jalan, hanya dashboard offline | Offline palsu | Firmware terbaru + deploy (Bagian 1) |
| Alat **reboot**/WiFi putus saat motor jalan | **Brownout** | Perbaiki daya (Bagian 4B) |
| "DISP TIMEOUT / Chamber tidak kosong" | Macet/sensor | Tare + spinner + mekanis (Bagian 4C) |

---

## 5. Checklist implementasi & urutan

1. **Deploy backend** terbaru: `git pull && ./run.sh deploy` (heartbeat + touchLastSeen + OTA sudah ada).
2. **Firmware v3.9** (saat dekat alat):
   - [ ] Port blok OTA v3.5 → firmware terpasang (include, konstanta, subscribe `topicOta`, `onOtaManifest`, `performOTA`, self‑check, `esp_ota_mark_app_valid`).
   - [ ] Tambah `scheduleGram` (distribusi offline) — Bagian 3.2.
   - [ ] Pastikan heartbeat `publishDeviceStatus(false)` di `maintainNetwork()` (sudah ada di v3.8).
   - [ ] Set `FIRMWARE_VERSION="3.9.0"`, `OTA_API_HOST` domain dashboard.
   - [ ] **BOOTSTRAP via USB** dgn Partition Scheme ber‑OTA (Bagian 2.3).
3. **Backend dual‑mode** (feed-plan.js): push `gram` per slot + `set_auto_feed:true` + cron skip untuk device ≥ v3.9 (Bagian 3.3).
4. **Uji**:
   - [ ] Feed 1× → dashboard tetap Online (anti offline‑palsu).
   - [ ] Cabut internet → jam sesi tiba → feeder tetap memberi gram sesuai persen (offline).
   - [ ] Upload firmware versi lebih tinggi → OTA sukses → versi berubah di dashboard.
   - [ ] Uji rollback (bin rusak) → device kembali ke versi lama.

> Referensi kode: OTA firmware = `esp32/esp32_code/pakan_lele_v3_5_pwmcontrol.ino`
> (fungsi `performOTA`, `onMqttMessage` cabang OTA, self‑check). Backend OTA =
> `backend/lele-ota.js`. Uji OTA rinci = `docs/UJI-OTA.md`. Rencana OTA =
> `docs/RENCANA-OTA.md`.
