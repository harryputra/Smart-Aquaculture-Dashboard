# MonitoringKualitasAir (ESP32-S3) — gabungan 1 program

Menyatukan 5 sketch uji (`Cek_SensorSuhu_DS18B20`, `Cek_SensorPH`,
`Cek_Kekeruhan`, `Cek_Ultrasonik_2_RGB`, `Cek_Relay_2`) menjadi **satu program
utuh** untuk **1 ESP32-S3**. ESP32 ini KHUSUS monitoring kualitas air —
**terpisah** dari ESP32 pemberi pakan.

## Library
- **OneWire** (Paul Stoffregen)
- **DallasTemperature** (Miles Burton)
- Board: **ESP32S3 Dev Module**. Serial 115200.

## Pin
| Fungsi | Pin | Catatan |
|---|---|---|
| Suhu DS18B20 | GPIO 17 | OneWire (digital) |
| pH | GPIO 2 | analog (ADC1) |
| Kekeruhan | GPIO 1 | analog (ADC1) |
| Ultrasonik AIR | TRIG 6 / ECHO 7 | ketinggian air |
| Ultrasonik PAKAN | TRIG 15 / ECHO 16 | ketinggian pakan |
| LED RGB | `RGB_BUILTIN` | indikator status |
| Relay Kuras | GPIO 11 | Active-LOW |
| Relay Isi | GPIO 12 | Active-LOW |

## Perilaku
- Membaca **semua sensor** tiap loop, menampilkan ke Serial Monitor tiap 1 detik.
- **LED RGB**: biru=error/RTO · merah=sangat dekat (<10 cm) · kuning=waspada
  (10–30 cm) · hijau=aman (>30 cm) — berdasarkan ultrasonik AIR.
- **Relay** kuras/isi via Serial: ketik `1` (Kuras) / `2` (Isi) untuk toggle.

## Yang perlu Anda sesuaikan
- **Kalibrasi pH** (`ph_kalibrasi`) & **kekeruhan** (`ADC_AIR_JERNIH`/`ADC_AIR_KERUH`)
  sesuai sensor Anda.
- **Ultrasonik → tinggi**: set `TINGGI_TABUNG_AIR_CM` & `TINGGI_WADAH_PAKAN_CM`
  sesuai wadah nyata (level = tinggi wadah − jarak sensor).
- Konfirmasi pemetaan: **Ultrasonik 1 (6/7) = AIR**, **Ultrasonik 2 (15/16) = PAKAN**.

## Catatan
- Ini versi **lokal/standalone** (baca + tampil di Serial + kontrol relay manual).
- Untuk **terhubung ke dashboard** (kirim data via MQTT + kontrol dari web) seperti
  ESP32 pemberi pakan, perlu ditambah WiFi + MQTT (lihat pola
  `IoT Water Quality Monitoring & Control/Program/KontrolAirKolam_Dashboard`).
  Tanyakan bila ingin versi ini dibuatkan.
