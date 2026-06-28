# 📡 Rencana: OTA Update Firmware ESP32 (fleet feeder lele)

Update firmware jarak jauh untuk banyak feeder (mis. 10 kolam Pak Andri) tanpa colok
kabel. Keputusan terkunci dari diskusi:

- **Pemicu**: MQTT push (manifest via `lele/device/<id>/ota`) **+** self-check saat
  boot/berkala (jaring pengaman bila device offline saat push).
- **Keamanan**: verifikasi **sha256** (nilai dari manifest MQTT yang sudah TLS+auth)
  **+ validasi sertifikat HTTPS** (embed root CA Cloudflare/ISRG) saat unduh `.bin`.
- **Rollout**: **canary** (uji 1 device → verifikasi sehat → sebar) + granular
  (per-device / per-kolam / per-farm / "versi < X").
- **Otorisasi**: hanya **Pemilik/Superadmin** boleh memicu OTA (pakai role guard auth).

## Arsitektur (MQTT-trigger + HTTPS pull)
```
upload .bin → backend simpan + sha256 + versi
  → admin klik Update → publish manifest {version,url,sha256} ke lele/device/<id>/ota
    → ESP32: cek versi & tidak-sedang-feeding → HTTPS GET .bin via
      aquaculture.trin-polman.id/api/lele/firmware/... (Cloudflare→tunnel→backend)
      → tulis slot non-aktif + hitung sha256 → cocok? set boot baru → REBOOT
      → boot baru: WiFi+MQTT OK → mark VALID; gagal → ROLLBACK otomatis
      → lapor progress/success/fail + versi → dashboard
```

## ⚠️ Bootstrap (sekali, wajib)
OTA hanya jalan bila **partition scheme dual-OTA** (`ota_0`/`ota_1`). Firmware saat ini
kemungkinan "Huge App" (tanpa OTA). Maka **semua device di-flash fisik SEKALI** dengan
skema ber-OTA + firmware berisi klien OTA. Sesudah itu semua update cukup OTA.
Checkpoint saat build: pastikan **ukuran firmware muat** di slot (skema mis. "Minimal
SPIFFS 1.9MB APP with OTA" / "1.2MB×2").

## Fase pembangunan
**Fase 1 — Firmware klien OTA**
- `FIRMWARE_VERSION` + kirim di payload status; subscribe topik `ota`.
- HTTPS-OTA (`HTTPUpdate`/`esp_https_ota`) + verifikasi sha256 + validasi cert (root CA).
- Health-confirm + rollback; lapor progress (downloading%/success/fail) via MQTT.
- Set partition scheme ber-OTA (perlu reflash bootstrap sekali).

**Fase 2 — Backend**
- Migrasi: tabel `lele_firmware` (versi, model, filename, sha256, ukuran, catatan,
  is_latest) + kolom `lele_devices.firmware_version`.
- Endpoint: upload firmware (multipart + hitung sha256), serve `.bin`, trigger OTA
  (publish manifest), terima progress/versi dari device. Role guard Pemilik+.

**Fase 3 — Dashboard halaman "Firmware"**
- Upload firmware + daftar versi; **matriks versi per device** (siapa perlu update).
- Tombol Update: canary (1 dulu) / per-kolam / per-farm / semua; progress bar real-time.

**Fase 4 — Orkestrasi canary & polish**
- Alur canary otomatis (uji 1 → verifikasi online di versi baru → lanjut sebar).
- Indikator rollback, riwayat update, audit.

## Catatan
- `.bin` dilayani lewat domain existing (Cloudflare) — tak perlu infrastruktur baru.
- Firmware tak bisa dikompilasi di lingkungan ini; build & upload via Arduino IDE.
- (Fase lanjut opsional) firmware bertanda tangan / Secure Boot — paling kuat, kompleks.
