# MonitoringKualitasAir_Dashboard (ESP32-S3) — terhubung dashboard

Versi **real-sensor + MQTT** dari monitoring kualitas air. Mengirim data ke Smart
Aquaculture Dashboard (tampil live + notifikasi + auto-drain) dan menerima perintah
**kuras/isi** dari web. **Terpisah** dari ESP32 pemberi pakan. Menggantikan
prototipe potensio `IoT Water Quality Monitoring & Control/.../KontrolAirKolam_Dashboard`.

## Library
- OneWire, DallasTemperature (suhu DS18B20)
- **WebSockets** (Links2004), **MQTTPubSubClient** (hideakitai), **ArduinoJson**
- Board: **ESP32S3 Dev Module**. Serial 115200.

## Pin (sama dgn program gabungan)
| Fungsi | Pin |
|---|---|
| Suhu DS18B20 | GPIO 17 |
| pH (analog ADC1) | GPIO 2 |
| Kekeruhan (analog ADC1) | GPIO 1 |
| Ultrasonik AIR | TRIG 6 / ECHO 7 |
| Ultrasonik PAKAN | TRIG 15 / ECHO 16 |
| Relay Kuras / Isi | GPIO 11 / 12 (Active-LOW) |
| LED Kuras / Isi | GPIO 9 / 10 (indikator, Active-HIGH) |

## Konfigurasi (`Parameter.h`)
1. `WIFI_SSID` / `WIFI_PASSWORD`.
2. `FARM_ID` & `POND_ID` — salin dari kolam di dashboard **v1** (server lama).
3. Kalibrasi pH & kekeruhan, tinggi wadah air/pakan.
4. `MQTT_SERVER` = `mqtt.trin-polman.id` (biarkan; sama dgn feeder v1).
5. **Dual-server (v1 + v2)** — device ini sekarang kirim data ke DUA dashboard
   sekaligus. Lihat bagian "Kirim ke 2 server" di bawah sebelum upload.

## Kirim ke 2 server (v1 + v2) — WAJIB dibaca sebelum upload

Device ini publish data sensor ke **kedua** server, tapi hanya **v2** yang boleh
mengirim perintah kontrol (kuras/isi) — v1 murni mirror read-only. Ini untuk
mencegah relay fisik menerima perintah bentrok dari 2 dashboard independen.

`FARM_ID_V2`/`POND_ID_V2` di `Parameter.h` diarahkan ke **kolam Pak Tiana yang
sudah ada**: `farm_tunas_mekar` / `pond_c1_tunas` (UMKM "Kelompok Tani Ternak
Tunas Mekar", **Kolam Lele C1** — kolam yang juga memakai mesin pakan). Kolam ini
sudah dibuat oleh seed (`backend/scripts/seed-tiana.js`), jadi **tidak perlu**
migrasi/seed kolam terpisah. Data sensor air, level pakan (ultrasonik hopper),
serta kuras/isi otomatis tampil langsung di Kolam C1.

> Agar kuras+isi otomatis berjalan: buka **Kolam C1 → tab Pengaturan** di dashboard,
> aktifkan **Auto-Drain** dan set ambang (kekeruhan max, suhu max, DO min,
> kedalaman min, ambang pakan). Manual & terjadwal tak butuh langkah ini.

Langkah yang **masih perlu dikerjakan manual** sebelum upload:

1. **Cloudflare Tunnel** (belum bisa diotomasi, wajib lewat dashboard
   Cloudflare): tambah Public Hostname baru →
   `mqtt-v2.trin-polman.id` → `http://localhost:9011` (port MQTT WebSocket
   stack v2). Tanpa ini, koneksi ke v2 tidak akan pernah tersambung.
2. **Cek `MQTT_USER_V2` / `MQTT_PASSWORD_V2`** di `Parameter.h` — defaultnya
   `aquaculture`/`aquaculture123` (sama dengan `.env.example`). Kalau kredensial
   MQTT di server v2 sudah diganti dari default (seharusnya begitu untuk
   produksi), ganti juga 2 baris ini supaya cocok dengan
   `mosquitto/config/passwd` stack v2.
3. `MQTT_V1_ENABLED` bisa di-set `false` kapan pun nanti kalau v1 sudah mau
   dipensiunkan sepenuhnya — device otomatis berhenti kirim ke v1 tanpa
   perlu ubah logic lain.

Serial monitor akan menampilkan log terpisah `[MQTT-v1]` dan `[MQTT-v2]` untuk
memudahkan diagnosa jika salah satu server gagal connect.

## Data yang dikirim → `aquaculture/<FARM_ID>/<POND_ID>/sensors`
```json
{ "temperature": 27.5, "depth": 62.0, "turbidity": 18.0, "ph": 7.3, "feed_level_cm": 21.5 }
```
- **depth** = ketinggian air (cm) dari ultrasonik AIR.
- **turbidity** = `100 − %kejernihan` (tinggi = makin keruh) → cocok dengan ambang
  `turbidity_max` di dashboard.
- **DO tidak dikirim** (node ini tanpa sensor DO) → di dashboard kolom DO kosong.
- **feed_level_cm** = ketinggian pakan (ultrasonik PAKAN) — dikirim sebagai info
  tambahan. *Untuk menampilkannya di dashboard perlu sedikit tambahan backend+UI
  (kolom baru) — beri tahu bila mau dibuatkan.*

## Kontrol air dari dashboard
Node menuruti perintah `open_valve`/`close_valve` (Kuras) & `open_inlet`/
`close_inlet` (Isi) — sama seperti tombol Kontrol Air di Detail Kolam, halaman
Perangkat Air, auto-drain, dan jadwal kuras. Serial `1`/`2` = toggle relay lokal.

## Cara uji singkat
1. Isi `Parameter.h`, Upload. Serial → `[WiFi] OK` lalu `[MQTT] Terhubung`.
2. Buka kolam di dashboard → nilai Suhu/pH/Kekeruhan/Kedalaman tampil live.
3. Tekan kontrol kuras/isi di dashboard → relay bergerak (lihat `[CTRL]` di Serial).

> Catatan: node ini tanpa aerator (tak ada relay/sensor DO) — perintah aerator
> dari dashboard diabaikan dengan aman.

## LED Indikator
- **LED_Kuras (GPIO 9)** menyala saat Relay Kuras sedang ON (baik dipicu dari
  dashboard, jadwal, auto-drain, maupun toggle Serial `1`).
- **LED_Isi (GPIO 10)** menyala saat Relay Isi sedang ON.
- LED bersifat Active-HIGH biasa (bukan Active-LOW seperti relay) — jadi
  tinggal sambung LED (+resistor ±220–330Ω) dari GPIO ke LED lalu ke GND.
- Status LED otomatis mengikuti `desiredKuras` / `desiredIsi` di setiap
  perulangan `loop()`, jadi selalu sinkron dengan kondisi relay.
