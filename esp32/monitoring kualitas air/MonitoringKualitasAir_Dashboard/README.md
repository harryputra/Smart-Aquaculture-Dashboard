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

## Konfigurasi (`Parameter.h`)
1. `WIFI_SSID` / `WIFI_PASSWORD`.
2. `FARM_ID` & `POND_ID` — salin dari kolam di dashboard.
3. Kalibrasi pH & kekeruhan, tinggi wadah air/pakan.
4. `MQTT_SERVER` = `mqtt.trin-polman.id` (biarkan; sama dgn feeder).

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
