#ifndef PARAMETER_H
#define PARAMETER_H
// ======================================================================
// MonitoringKualitasAir_Dashboard (ESP32-S3) — versi TERHUBUNG DASHBOARD.
// Sensor asli: Suhu (DS18B20), pH, Kekeruhan, Ultrasonik AIR & PAKAN.
// Kirim data ke Smart Aquaculture Dashboard via MQTT (WSS) + kontrol relay
// kuras/isi dari web. TERPISAH dari ESP32 pemberi pakan.
// ======================================================================

// ------------------ WiFi & MQTT (WSS via Cloudflare) -------------------
#define WIFI_SSID       "GANTI_WIFI"
#define WIFI_PASSWORD   "GANTI_PASSWORD"

// Broker sama dengan feeder lele (domain Cloudflare, WSS 443 → mosquitto).
#define MQTT_SERVER     "mqtt.trin-polman.id"
#define MQTT_PORT       443
#define MQTT_PATH       "/"
#define MQTT_SUBPROTO   "mqtt"             // WAJIB
#define MQTT_USER       "aquaculture"
#define MQTT_PASSWORD   "aquaculture123"

// ------------------ Identitas kolam (dari dashboard) -------------------
// Dashboard → Peternakan → buka kolam → salin farm_id & pond_id ke sini.
#define FARM_ID         "GANTI_FARM_ID"
#define POND_ID         "GANTI_POND_ID"

// ------------------------------ PIN ------------------------------------
#define PIN_SUHU_DS18B20   17     // DS18B20 (OneWire)
#define PIN_PH             2      // pH (analog, ADC1)
#define PIN_KEKERUHAN      1      // kekeruhan (analog, ADC1)
#define TRIG_AIR           6      // ultrasonik ketinggian AIR
#define ECHO_AIR           7
#define TRIG_PAKAN         15     // ultrasonik ketinggian PAKAN
#define ECHO_PAKAN         16
#define RELAY_KURAS        11     // relay kuras/outlet (Active-LOW)
#define RELAY_ISI          12     // relay isi/inlet   (Active-LOW)

// ---------------------------- KALIBRASI --------------------------------
// pH: pH = -5.70 * volt + ph_calibration_value
#define PH_KALIBRASI          (-0.5)
#define PH_CALIBRATION_VALUE  (21.34 + PH_KALIBRASI)

// Kekeruhan → % kejernihan (ADC jernih & keruh). Ke dashboard dikirim sebagai
// TURBIDITY = 100 − kejernihan (tinggi = makin keruh).
#define ADC_AIR_JERNIH   3038     // → 100 % jernih
#define ADC_AIR_KERUH    765      // →   0 % jernih

// Ultrasonik → tinggi (cm). level = tinggi_wadah − jarak sensor ke permukaan.
#define TINGGI_TABUNG_AIR_CM   100.0
#define TINGGI_WADAH_PAKAN_CM  30.0

#define PUBLISH_INTERVAL_MS    3000

#endif
