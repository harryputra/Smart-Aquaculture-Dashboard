#ifndef PARAMETER_H
#define PARAMETER_H
// ======================================================================
// KontrolAirKolam_Dashboard — versi ESP32 + MQTT, terhubung ke Smart
// Aquaculture Dashboard. Adaptasi dari KontrolAirKolamV2 (mahasiswa).
// Sensor masih SIMULASI POTENSIOMETER (nanti diganti sensor asli:
// DO, kekeruhan, pH, suhu). Level air (ultrasonik) untuk kuras/isi.
// ======================================================================

// ----------------------------------------------------------------------
// 1) WiFi & MQTT (over WebSocket Secure via Cloudflare — sama dgn feeder lele)
// ----------------------------------------------------------------------
#define WIFI_SSID       "GANTI_WIFI"
#define WIFI_PASSWORD   "GANTI_PASSWORD"

// Broker MQTT: domain Cloudflare (WSS 443) yang meneruskan ke mosquitto server.
// SAMA dengan yang dipakai feeder lele. Jangan pakai IP lokal.
#define MQTT_SERVER     "mqtt.trin-polman.id"
#define MQTT_PORT       443
#define MQTT_PATH       "/"
#define MQTT_SUBPROTO   "mqtt"            // WAJIB; default "arduino" ditolak mosquitto
#define MQTT_USER       "aquaculture"     // samakan dgn .env server
#define MQTT_PASSWORD   "aquaculture123"  // GANTI bila password broker diubah

// ----------------------------------------------------------------------
// 2) IDENTITAS KOLAM  ← WAJIB DIISI sesuai dashboard
//    Buka dashboard → Peternakan → (buka kolam). Ambil FARM_ID & POND_ID
//    dari URL/detail kolam (mis. pond_lx9k2). Topik akan jadi:
//      aquaculture/<FARM_ID>/<POND_ID>/sensors|status|control
// ----------------------------------------------------------------------
#define FARM_ID         "GANTI_FARM_ID"
#define POND_ID         "GANTI_POND_ID"

// ----------------------------------------------------------------------
// 3) PIN ESP32
//    ADC1 (input-only 34–39 & 32/33) — JANGAN pakai ADC2 (bentrok WiFi).
// ----------------------------------------------------------------------
#define PIN_SENS_PH         34   // Potensio 1  → pH
#define PIN_SENS_TURBIDITY  35   // Potensio 2  → Kekeruhan (NTU)
#define PIN_SENS_OXYGEN     32   // Potensio 3  → DO / oksigen terlarut (mg/L)
#define PIN_SENS_TEMP       33   // Potensio 4  → Suhu (°C)
#define PIN_SENS_LEVEL      36   // Potensio 5  → Level air / kedalaman (cm) [ultrasonik]

#define PIN_BUTTON_KURAS    25   // tombol lokal kuras (INPUT_PULLUP)
#define PIN_BUTTON_ISI      26   // tombol lokal isi   (INPUT_PULLUP)
#define PIN_VALVE_KURAS     16   // relay kuras/outlet (Active-LOW)
#define PIN_VALVE_ISI       17   // relay isi/inlet    (Active-LOW)

#define ADC_MAX             4095  // ESP32 = 12-bit

// ----------------------------------------------------------------------
// 4) RANGE FISIK (mapping potensio → nilai sensor)
// ----------------------------------------------------------------------
const float PH_MIN        = 0.0,   PH_MAX        = 14.0;
const float TURBIDITY_MIN = 0.0,   TURBIDITY_MAX = 100.0;   // NTU
const float OXYGEN_MIN    = 0.0,   OXYGEN_MAX    = 20.0;    // mg/L
const float TEMP_MIN      = 0.0,   TEMP_MAX      = 40.0;    // °C
const float LEVEL_MIN     = 0.0,   LEVEL_MAX     = 100.0;   // cm

// ----------------------------------------------------------------------
// 5) AMBANG KUALITAS AIR (untuk mode AUTO lokal) — ideal budidaya lele
//    Air dianggap BURUK bila keluar dari rentang ini.
// ----------------------------------------------------------------------
const float PH_IDEAL_MIN     = 6.5,  PH_IDEAL_MAX  = 8.5;
const float TURBIDITY_MAX_OK = 50.0;   // > 50 NTU = keruh
const float OXYGEN_MIN_OK    = 3.0;    // < 3 mg/L = DO rendah (bahaya)
const float TEMP_IDEAL_MIN   = 22.0, TEMP_IDEAL_MAX = 32.0;

// Target level saat siklus kuras→isi
const float levelDrainTarget = 30.0;   // kuras sampai ≤ 30 cm
const float levelFillTarget  = 80.0;   // isi sampai ≥ 80 cm

// ----------------------------------------------------------------------
// 6) LANGKAH STATE MACHINE OTOMATIS
// ----------------------------------------------------------------------
#define LANGKAH_CEK_KUALITAS  1
#define LANGKAH_KURAS         2
#define LANGKAH_ISI           3
#define LANGKAH_SELESAI       4

// Interval kirim data sensor ke dashboard (ms)
#define PUBLISH_INTERVAL_MS   3000

#endif
