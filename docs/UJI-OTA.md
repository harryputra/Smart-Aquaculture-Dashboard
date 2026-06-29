# ✅ Checklist Uji OTA Firmware (langkah demi langkah)

Panduan menguji OTA dari nol sampai rollout banyak device. Ikuti urut.
Lihat juga [RENCANA-OTA.md](RENCANA-OTA.md).

> Singkatan: **SM** = Serial Monitor Arduino IDE (115200 baud).

---

## 0. Prasyarat server (sekali)
- [ ] Sudah `git pull` + `./run.sh deploy` di server (backend rebuild, migrasi
      `migration-ota.sql` jalan, volume `lele_firmware` dibuat).
- [ ] `.env` di server berisi **`OTA_PUBLIC_BASE=https://aquaculture.trin-polman.id`**
      (samakan dengan domain dashboard).
- [ ] Punya akun **Pemilik / Super Admin** (upload & trigger OTA dibatasi peran ini).
- [ ] Cek health: `curl -s https://aquaculture.trin-polman.id/api/health`

---

## 1. Bootstrap firmware (WAJIB sekali per device)
OTA hanya jalan bila partisi **dual-OTA**. Firmware lama "Huge App" harus di-flash
fisik sekali dengan skema ber-OTA.

- [ ] Buka `pakan_lele_v3_5_pwmcontrol.ino` di Arduino IDE.
- [ ] **Tools → Partition Scheme → "Minimal SPIFFS (1.9MB APP with OTA/190KB SPIFFS)"**
      (atau skema lain yang ada "OTA"/dua slot APP).
- [ ] Pastikan `OTA_API_HOST` = domain dashboard (default `aquaculture.trin-polman.id`).
- [ ] `FIRMWARE_VERSION` di firmware, mis. tetap `"3.6.0"` untuk flash pertama.
- [ ] **Upload** ke ESP32 lewat kabel. Tunggu selesai.
- [ ] Di SM muncul: `[BOOT] Device ID: lele_xxxxxx` → catat/tempel stiker ID di mesin.
- [ ] Cek **ukuran sketch** saat compile: pastikan **< ukuran 1 slot APP** (mis. < ~1.9MB).
      Bila "Sketch too big", pilih skema dengan APP lebih besar atau kurangi fitur.

---

## 2. Device muncul di dashboard
- [ ] Nyalakan device (WiFi + MQTT). Di SM: `[MQTT] Connected, subscribed to ...`.
- [ ] Dashboard → **Perangkat**: device `lele_xxxxxx` muncul **ONLINE**.
- [ ] Dashboard → **Firmware** → tabel "Status Versi per Device": kolom **Versi
      sekarang = 3.6.0** (artinya `firmware_version` terkirim & tersimpan). ✔

Verifikasi via MQTT (opsional, di server):
```bash
./run.sh mqtt-sub        # lihat lele/device/status; cari "firmware_version":"3.6.0"
```

---

## 3. Siapkan firmware BARU (yang akan di-OTA-kan)
- [ ] Di firmware, **naikkan** `FIRMWARE_VERSION` → mis. `"3.6.1"`.
      (Boleh ubah hal kecil lain agar terlihat bedanya, mis. teks LCD.)
- [ ] **Sketch → Export Compiled Binary** (JANGAN upload kabel).
      File `.bin` ada di folder sketch (`build/...` atau di samping `.ino`).
- [ ] Pakai `.bin` aplikasi biasa (mis. `pakan_lele_v3_5_pwmcontrol.ino.bin`),
      **bukan** `*.bootloader.bin` / `*.partitions.bin`.

---

## 4. Unggah firmware ke dashboard
- [ ] Login sebagai **Pemilik/Super Admin** → **Firmware**.
- [ ] Kartu **Unggah Firmware**: pilih `.bin`, isi **Versi = 3.6.1**, Unggah.
- [ ] Muncul di **Katalog Firmware** dengan badge **latest** + sha256 (otomatis dihitung).

Verifikasi manifest (opsional):
```bash
curl -s "https://aquaculture.trin-polman.id/api/lele/firmware/latest?model=pakan_lele&current=3.6.0"
# → {"update_available":true,"version":"3.6.1","url":".../download/<id>","sha256":"..."}
```

---

## 5. Uji 1 device (manual) — paling penting
- [ ] **Firmware** → bagian "Status Versi per Device" → pilih **Target = v3.6.1**.
- [ ] Klik **Update** pada device uji. (Pantau SM device.)
- [ ] Di SM berurutan:
      `[OTA] Mulai unduh: https://.../download/<id>` →
      `Unduh xx%` (juga muncul di LCD "UPDATE FIRMWARE") →
      `[OTA] Sukses. Reboot ke firmware baru...` → device reboot →
      `[OTA] Firmware baru dikonfirmasi sehat (rollback dibatalkan).`
- [ ] Dashboard: kolom OTA jalan `unduh %` → **✓ sukses**, lalu **Versi sekarang = 3.6.1**
      dengan badge ✓ (perlu beberapa detik untuk device lapor balik).
- [ ] **Riwayat OTA**: muncul baris `dikirim` lalu `sukses`.

✅ Jika sampai sini berhasil → OTA inti **berfungsi**.

---

## 6. Uji rollout CANARY (banyak device)
Prasyarat: ada ≥2 device online di versi lama.
- [ ] **Firmware** → Target v3.6.1 → klik **Rollout Canary**.
- [ ] Muncul kartu **Rollout aktif**: "uji canary di <device pertama>…".
- [ ] Tunggu canary selesai & lapor versi baru → sistem **otomatis** menyebar ke
      device lain (lihat OTA progress mereka mulai jalan) → kartu hilang (status done).
- [ ] **Riwayat OTA**: `canary mulai` → `canary sehat → sebar` → `sukses` tiap device.

Uji pembatalan:
- [ ] Saat kartu rollout aktif, klik **Batalkan** → status jadi aborted, sisanya tak dikirim.

---

## 7. Uji self-check (tanpa klik dashboard)
- [ ] Pastikan ada firmware **latest** lebih baru dari versi sebuah device.
- [ ] Reboot device itu (cabut-colok). Saat boot/terhubung, firmware memanggil
      `/api/lele/firmware/latest`; bila ada versi baru → otomatis OTA.
- [ ] SM: `[OTA] Self-check: versi baru 3.6.x tersedia` → lanjut unduh.
      (Self-check juga berjalan otomatis tiap 6 jam.)

---

## 8. Uji kegagalan & rollback (opsional, lanjutan)
- **sha256 salah**: publish manifest palsu via MQTTX ke `lele/device/<id>/ota`
  dengan `sha256` ngawur → SM: `[OTA] sha256 MISMATCH` → device **tetap di firmware
  lama**, dashboard catat `gagal`. (Bukti integritas bekerja.)
- **Firmware baru rusak/boot-loop**: jika partisi rollback aktif, device kembali ke
  firmware lama otomatis; rollout canary mendeteksi via **timeout 15 menit** →
  status `canary timeout` (rollout dibatalkan, device lain aman).

---

## 9. Troubleshooting cepat
| Gejala | Kemungkinan & solusi |
|---|---|
| "Sketch too big" saat compile | Partition Scheme belum dual-OTA / APP slot kecil → pilih skema APP lebih besar |
| OTA `fail` "begin() gagal" / HTTP error | `OTA_PUBLIC_BASE`/`OTA_API_HOST` salah, atau Cloudflare belum route `/api` → cek `curl .../firmware/latest` |
| OTA `fail` "sha256 tidak cocok" | File korup saat unggah/unduh; unggah ulang `.bin` |
| Progress mentok lalu timeout | WiFi lemah di lokasi; coba lagi; pastikan sinyal cukup |
| Device tak muncul versinya | Firmware lama (tanpa OTA) belum di-flash bootstrap; ulangi Langkah 1 |
| Tombol Update/Unggah tak ada | Login bukan Pemilik/Super Admin |
| `OTA_PUBLIC_BASE belum diset` | Isi `OTA_PUBLIC_BASE` di `.env` server lalu `./run.sh prod-restart` |

---

## 10. Perintah verifikasi berguna (server)
```bash
# lihat lalu lintas MQTT (status, ota_status)
./run.sh mqtt-sub

# versi & status OTA tiap device di DB
docker compose exec postgres psql -U aquaculture aquaculture \
  -c "SELECT device_id, firmware_version, ota_state, ota_progress, ota_target_version FROM lele_devices;"

# riwayat OTA terakhir
docker compose exec postgres psql -U aquaculture aquaculture \
  -c "SELECT created_at, device_id, event, to_version, detail FROM lele_ota_log ORDER BY created_at DESC LIMIT 20;"
```
