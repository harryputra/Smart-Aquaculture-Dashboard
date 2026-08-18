# Panduan OTA — Sistem Monitoring & Kontrol Kualitas Air (V6P)

> OTA (update firmware jarak jauh) untuk perangkat **monitoring & kontrol
> kualitas air** (ESP32‑S3, firmware `esp32/V6P-MonitoringKualitasAir_Dashboard`).
> Modelnya kini **device‑id**, **disamakan dengan feeder** — pairing dari
> dashboard + OTA nirkabel. Panduan feeder: `docs/PANDUAN-OTA-FEEDER.md`.
>
> Status: firmware **v2.0.0** (device‑id + OTA sha256 diperbaiki) & backend
> **sudah dibuat**. Sisa: **compile + bootstrap flash sekali**, lalu OTA nirkabel.

---

## 0. Arsitektur singkat

```
DASHBOARD (Smart-Aquaculture-Dashboard)                 PERANGKAT AIR (ESP32-S3)
  Halaman Perangkat → kartu air → tombol OTA              device_id = air_<mac>
  backend water-devices.js:                               subscribe:
    POST /api/water/devices/<id>/ota   ──manifest MQTT──►   aquaculture/device/<id>/ota
      {version, url, sha256}                                → unduh .bin (HTTPS)
    katalog firmware = lele_firmware (model 'kualitas_air') → verifikasi SHA256
  download .bin (publik):                                   → tulis slot non-aktif
    /api/lele/firmware/download/<id>   ◄──HTTPS pull──       → reboot / rollback
                                        lapor: aquaculture/device/<id>/ota_status
```

- **Broker & host** disamakan feeder: `mqtt.trin-polman.id` (MQTT) +
  `aquaculture.trin-polman.id` (unduh/self‑check). Lihat `Parameter.h`.
- **Verifikasi** integritas = **SHA256** (mbedtls) — sebelumnya keliru
  `Update.setMD5` (selalu gagal), **sudah diperbaiki** di `Ota.ino`.
- **Rollback** dual‑partisi: bila firmware baru gagal boot → otomatis kembali ke
  yang lama (`esp_ota_mark_app_valid_cancel_rollback` di `Koneksi.ino`).

---

## 1. BOOTSTRAP sekali (WAJIB, harus dekat alat) ⚠️

OTA butuh **partisi dual‑OTA**. Firmware single‑app tak bisa OTA. Flash pertama
via **USB**:

1. Arduino IDE → **Tools → Partition Scheme** → pilih yang **ada 2 slot app**
   (mis. **"Minimal SPIFFS (1.9MB APP with OTA)"** atau **"Default 4MB with
   spiffs (1.2MB APP/OTA)"**) — **JANGAN** "Huge APP (3MB No OTA)".
2. Board: **ESP32S3 Dev Module**. Serial 115200.
3. Di `Parameter.h` pastikan:
   - `FIRMWARE_VERSION "2.0.0"` (naikkan tiap rilis: `2.0.1`, `2.1.0`, …).
   - `MQTT_SERVER "mqtt.trin-polman.id"`, `MQTT_SERVER_V2 "mqtt.trin-polman.id"`.
   - `OTA_API_HOST_V2 "aquaculture.trin-polman.id"` (domain dashboard Anda).
   - WiFi (`WIFI_SSID`/`WIFI_PASSWORD`).
4. **Upload via USB.** Serial: `[ID] device_id: air_xxxxxx` → `[WiFi] OK` →
   `[MQTT-v2] Terhubung`.

> Sesudah bootstrap, update berikutnya **cukup OTA nirkabel** (langkah 3).

---

## 2. Pairing (device‑id, seperti feeder)

1. Perangkat menyala → publish `aquaculture/device/<id>/status` → **auto‑daftar**
   di dashboard.
2. Dashboard → **Perangkat → Monitoring & Kontrol Air** → kartu `air_<mac>`
   (ONLINE) → pilih **Kolam** (mis. Kolam Lele C1) → **Simpan**.
3. Setelah di‑assign: sensor air tampil di kolam itu; kontrol **Kuras/Isi**
   otomatis diteruskan (bridge) ke perangkat.

Firmware **tidak** hardcode kolam lagi — semua assignment dari dashboard.

---

## 3. Alur update OTA rutin (setelah bootstrap)

1. **Compile** firmware baru → Arduino IDE **Sketch → Export Compiled Binary**
   → dapat `.bin` (naikkan `FIRMWARE_VERSION` dulu!).
2. Dashboard → **Firmware (OTA)** → **Upload** `.bin`:
   - **Model** = **`kualitas_air`** (WAJIB — beda dari feeder `pakan_lele`).
   - Versi = sama dengan `FIRMWARE_VERSION` di firmware (mis. `2.0.1`).
   - **Set Latest**.
3. Dashboard → **Perangkat → Monitoring & Kontrol Air** → kartu perangkat →
   tombol **OTA** (perangkat harus **ONLINE**).
4. Perangkat unduh → **verifikasi sha256** → flash → reboot → `firmware_version`
   di kartu berubah ke versi baru. Serial: `[OTA] …% … Sukses! Reboot`.

> Jika halaman Firmware **belum** punya pilihan **model** `kualitas_air`
> (defaultnya `pakan_lele`), minta ditambahkan selektor model — tanpa itu,
> firmware air ter‑upload sebagai model feeder & OTA air tak menemukannya.

---

## 4. Uji OTA (termasuk rollback)

- **Sukses**: upload firmware `FIRMWARE_VERSION` **lebih tinggi** (mis. `2.0.1`)
  → Set Latest → OTA → versi berubah di dashboard.
- **Verifikasi sha256**: upload `.bin` yang di‑ubah/rusak → perangkat menolak
  ("sha256 MISMATCH" di Serial), firmware lama tetap.
- **Rollback**: bila firmware baru gagal boot berulang → bootloader kembali ke
  slot lama otomatis (dual‑OTA) → perangkat tetap hidup.

---

## 5. Troubleshooting

| Gejala | Sebab | Solusi |
|---|---|---|
| Perangkat tak muncul di halaman Perangkat | belum online / broker beda | Cek Serial `[MQTT-v2] Terhubung`; `MQTT_SERVER_V2 = mqtt.trin-polman.id` |
| Tombol OTA: "Belum ada firmware air" | firmware belum di‑upload dgn model `kualitas_air` | Upload di halaman Firmware, model **kualitas_air**, Set Latest |
| OTA: `Update.begin` gagal / "partisi tidak muat" | Partition Scheme tanpa OTA | Flash ulang USB dgn skema **ber‑OTA** (Bagian 1) |
| OTA: "sha256 MISMATCH" | file berubah / salah upload | Upload ulang `.bin` yang benar; pastikan Set Latest |
| OTA berhenti di tengah / timeout | WiFi lemah saat unduh | Dekatkan ke AP; ulangi OTA |
| Sensor tak masuk kolam | perangkat belum di‑assign | Perangkat → assign ke kolam |
| Kuras/Isi tak jalan | perangkat belum di‑assign / offline | assign + pastikan ONLINE (bridge kontrol butuh assignment) |

---

## 6. Ringkas file terkait

| Bagian | File |
|---|---|
| Firmware OTA air | `esp32/V6P-MonitoringKualitasAir_Dashboard/Ota.ino` (`performOTA` sha256), `Koneksi.ino` (rollback), `Parameter.h` (versi/host) |
| Backend water‑device + trigger OTA | `backend/water-devices.js` (`/api/water/devices/:id/ota`) |
| Katalog firmware (dipakai bersama feeder) | `backend/lele-ota.js` + tabel `lele_firmware` (model `kualitas_air`) |
| UI pairing + tombol OTA | `frontend/src/pages/Devices.jsx` (seksi "Monitoring & Kontrol Air") |
| Halaman upload firmware | `frontend/src/pages/Firmware.jsx` |

> Panduan feeder (arsitektur OTA yang sama) & troubleshooting umum:
> `docs/PANDUAN-OTA-FEEDER.md`.
