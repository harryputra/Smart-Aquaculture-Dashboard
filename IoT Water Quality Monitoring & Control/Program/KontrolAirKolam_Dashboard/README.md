# KontrolAirKolam_Dashboard (ESP32) — terhubung ke Smart Aquaculture Dashboard

Versi **ESP32 + MQTT** dari `KontrolAirKolamV2` (Arduino Uno buatan mahasiswa),
disesuaikan agar **datanya bisa dimonitor di dashboard** dan valve **bisa
dikontrol dari web**. Sensor masih **simulasi potensiometer**; siap diganti sensor
asli (DO, kekeruhan, pH, suhu) tanpa mengubah alur.

## Apa yang berubah dari versi mahasiswa
| Versi mahasiswa (Uno) | Versi ini (ESP32 + Dashboard) |
|---|---|
| Arduino Uno, tanpa jaringan | ESP32 + WiFi + MQTT over WebSocket Secure (Cloudflare) |
| 4 potensio (pH, keruh, DO, level) | **5 potensio** (+ **suhu**) |
| Kontrol via tombol + Serial | Tombol + Serial **+ perintah dari dashboard** |
| Data hanya di Serial Monitor | Data dikirim ke dashboard → grafik & notifikasi |
| ADC 10-bit (0–1023) | ADC 12-bit (0–4095) |

Logika inti (mode Manual/Auto, state machine kuras→isi, setpoint) **dipertahankan**.

## Library (Arduino IDE → Library Manager)
- **WebSockets** by *Markus Sattler (Links2004)*
- **MQTTPubSubClient** by *hideakitai*
- **ArduinoJson** by *Benoit Blanchon* (parsing perintah kontrol/aerator)
- Board: **ESP32 Dev Module** (install "esp32 by Espressif").

## Wiring (ESP32)
| Fungsi | Pin ESP32 | Keterangan |
|---|---|---|
| Potensio pH | GPIO 34 | ADC1, input-only |
| Potensio Kekeruhan | GPIO 35 | ADC1 |
| Potensio DO (oksigen) | GPIO 32 | ADC1 |
| Potensio Suhu | GPIO 33 | ADC1 |
| Potensio Level air | GPIO 36 (VP) | ADC1 |
| Tombol Kuras | GPIO 25 | ke GND, `INPUT_PULLUP` |
| Tombol Isi | GPIO 26 | ke GND, `INPUT_PULLUP` |
| Relay Kuras (outlet) | GPIO 16 | **Active-LOW** |
| Relay Isi (inlet) | GPIO 17 | **Active-LOW** |
| Relay Aerator (blower/kincir) | GPIO 27 | **Active-LOW** |

> Tiap potensio: kaki luar ke **3V3** & **GND**, kaki tengah ke pin ADC.
> ⚠️ Jangan pakai pin ADC2 (GPIO 0/2/4/12–15/25–27) untuk analog saat WiFi aktif.

## Konfigurasi (file `Parameter.h`)
1. **WiFi**: `WIFI_SSID`, `WIFI_PASSWORD`.
2. **Broker**: `MQTT_SERVER` = `mqtt.trin-polman.id` (sama dengan feeder lele —
   jangan diubah kecuali domain broker beda). User/password broker sudah terisi.
3. **Identitas kolam** (WAJIB): `FARM_ID` & `POND_ID`.
   - Di dashboard: **Peternakan → buka kolam**. Salin **pond_id** (mis. `pond_lx9k2`)
     dan **farm_id** dari alamat/detail kolam. Isi ke `Parameter.h`.
   - Kalau belum ada kolamnya, buat dulu (menu Peternakan → Tambah Kolam).

## Cara pakai
1. Isi `Parameter.h`, pilih board **ESP32 Dev Module**, **Upload**.
2. Buka **Serial Monitor 115200**. Harusnya muncul `[WiFi] OK` lalu `[MQTT] Terhubung`.
3. Buka dashboard → kolam terkait. Begitu data masuk, kolam otomatis jadi mode
   **ESP32** dan nilai **Suhu / DO / Kekeruhan / pH / Kedalaman** tampil live.
4. Putar potensio → nilai berubah di dashboard (± beberapa detik).

## Kontrol air (kuras/isi)
Ada **dua cara**, pilih salah satu sesuai kebutuhan:
- **Otomatis lokal** (ketik `A` di Serial, atau kirim `set_mode:auto`): ESP32
  menjalankan sendiri siklus kuras→isi bila kualitas air keluar dari rentang ideal
  (pH 6.5–8.5, keruh < 50 NTU, DO > 3 mg/L, suhu 22–32 °C) — berdiri sendiri.
- **Dari dashboard** (mode MANUAL): tombol kontrol air di dashboard mengirim
  `open_valve`/`close_valve` (kuras) & `open_inlet`/`close_inlet` (isi). ESP32
  menuruti perintah ini (latch). **Auto-drain dashboard** (saat sensor kritis) &
  **jadwal kuras** juga otomatis mengirim perintah ini.

> Tombol fisik selalu bisa dipakai (jog manual) kapan pun.

## Aerator (kendali oksigen / DO)
Relay aerator (GPIO 27) dikendalikan **di device** (aman walau internet putus):
- **Auto (histeresis DO)**: aerator **ON** bila DO ≤ `do_on` (default 3.0 mg/L),
  **OFF** bila DO ≥ `do_off` (default 4.0). Ambang di antaranya menahan status agar
  relay tak klik-klik.
- **Manual**: ON/OFF paksa dari dashboard.
- Config & mode dikirim dashboard via `set_aerator`
  (`{command:"set_aerator","mode":"auto|manual|off","do_on":..,"do_off":..,"manual_on":..}`).
- Status aerator dikirim di payload sensor (`"aerator":true/false`) → tampil di
  Detail Kolam (Operasional).

## Format data (untuk referensi)
Device mengirim ke `aquaculture/<FARM_ID>/<POND_ID>/sensors`:
```json
{ "temperature": 27.4, "depth": 62.0, "dissolved_oxygen": 6.2, "turbidity": 12.5, "ph": 7.3 }
```
Dashboard menyimpannya ke `sensor_data` + InfluxDB → grafik, ambang, notifikasi,
auto-drain. Perintah balik dari dashboard di `aquaculture/<FARM_ID>/<POND_ID>/control`.

## Mengganti ke sensor asli (nanti)
Cukup ubah fungsi `bacaSemuaSensor()` di `Otomatis.ino`: ganti `analogRead(...)` +
`mapFloat(...)` dengan pembacaan sensor asli (mis. DO analog, pH module, sensor
turbidity, DS18B20 untuk suhu, ultrasonik untuk level). Alur MQTT & kontrol tak berubah.
