#ifndef PARAMETER_H
#define PARAMETER_H
// ======================================================================
// MonitoringKualitasAir_Dashboard (ESP32-S3) — versi TERHUBUNG DASHBOARD.
// Sensor asli: Suhu (DS18B20), pH, Kekeruhan, Ultrasonik AIR & PAKAN, DO (RS485)
// ======================================================================

// ------------------ WiFi & MQTT (WSS via Cloudflare) -------------------
#define WIFI_SSID       "wifi-lele"
#define WIFI_PASSWORD   "polman2026"

// SATU SERVER saja = Smart-Aquaculture-Dashboard (SAMA dengan sistem pemberi
// pakan/feeder). Mirror ke server lama (v1) DIMATIKAN. Semua (sensor + kontrol
// kuras/isi + OTA) lewat broker ini.
#define MQTT_V1_ENABLED false               // v1 (mirror lama) dimatikan
#define MQTT_SERVER     "mqtt.trin-polman.id"
#define MQTT_PORT       443
#define MQTT_PATH       "/"
#define MQTT_SUBPROTO   "mqtt"
#define MQTT_USER       "aquaculture"
#define MQTT_PASSWORD   "aquaculture123"

// (tak dipakai saat MQTT_V1_ENABLED false)
#define FARM_ID         "farm_002"
#define POND_ID         "pond_003"

// ------------------ Server AKTIF (pengontrol) = dashboard ini -----------
// Disamakan dengan feeder: broker mqtt.trin-polman.id + host OTA
// aquaculture.trin-polman.id. Kolam Pak Tiana C1 (bersama mesin pakan).
#define MQTT_SERVER_V2    "mqtt.trin-polman.id"
#define MQTT_PORT_V2      443
#define MQTT_PATH_V2      "/"
#define MQTT_SUBPROTO_V2  "mqtt"
#define MQTT_USER_V2      "aquaculture"
#define MQTT_PASSWORD_V2  "aquaculture123"

#define FARM_ID_V2        "farm_tunas_mekar"
#define POND_ID_V2        "pond_c1_tunas"

// ------------------------------ PIN ------------------------------------
#define PIN_SUHU_DS18B20   17   
#define PIN_PH             2    
#define PIN_KEKERUHAN      1    
#define TRIG_AIR           6    
#define ECHO_AIR           7    
#define TRIG_PAKAN         15    
#define ECHO_PAKAN         16    
#define RELAY_KURAS        11    
#define RELAY_ISI          12    
#define LED_KURAS          9     
#define LED_ISI            10     

// --- PIN SENSOR DO ---
#define RX_PIN_DO          42
#define TX_PIN_DO          41

// ---------------------------- KALIBRASI --------------------------------
#define PH_KALIBRASI          (0.5)
#define PH_CALIBRATION_VALUE  (21.34 + PH_KALIBRASI)

// --- KALIBRASI KEKERUHAN BARU (INTERPOLASI) ---
#define ADC_KOLAM          750.0f
#define NTU_KOLAM          50.0f
#define ADC_TERHALANG      0.0f
#define NTU_MAKSIMAL       1000.0f

#define TINGGI_TABUNG_AIR_CM   100.0
#define TINGGI_WADAH_PAKAN_CM  30.0

#define PUBLISH_INTERVAL_MS    3000

// ------------------ OTA Configuration -------------------
// Host self-check/unduh OTA = domain dashboard ini (SAMA dengan feeder v3.9).
#define FIRMWARE_VERSION  "1.0.0"
#define OTA_API_HOST_V2   "aquaculture.trin-polman.id"

#endif