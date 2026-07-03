// ======================================================================
// KontrolAirKolam_Dashboard (ESP32) — Monitoring kualitas air + kuras/isi
// otomatis, TERHUBUNG ke Smart Aquaculture Dashboard via MQTT (WSS).
//
// Adaptasi dari KontrolAirKolamV2 (Arduino Uno, mahasiswa). Perubahan utama:
//  - Pindah ke ESP32 + WiFi + MQTT over WebSocket Secure (Cloudflare)
//  - Kirim data sensor ke dashboard (format: temperature/depth/dissolved_oxygen/
//    turbidity/ph) → tampil di halaman kolam
//  - Terima perintah valve dari dashboard (open_valve/close_valve/open_inlet/
//    close_inlet) → kuras/isi bisa dikontrol dari web
//  - Tambah sensor SUHU (potensio ke-5)
// Sensor masih SIMULASI POTENSIOMETER (nanti diganti sensor asli).
//
// Library (Arduino IDE → Library Manager):
//   - "WebSockets" by Markus Sattler (Links2004)   → WebSocketsClient
//   - "MQTTPubSubClient" by hideakitai
// Board: ESP32 Dev Module.  Serial: 115200.
// ======================================================================
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <MQTTPubSubClient.h>
#include <ArduinoJson.h>          // parsing perintah kontrol (valve/aerator)
#include "Parameter.h"

// === Transport ===
WebSocketsClient wsClient;
MQTTPubSubClient mqttClient;
String topicSensors, topicStatus, topicControl;

// === MODE ===
bool modeOtomatis     = false;
bool modeOtomatisLama = false;

// === VALVE ===
bool valveKurasState = false, valveKurasStateLama = false;
bool valveIsiState   = false, valveIsiStateLama   = false;
bool desiredKuras    = false;   // status "latch" dari perintah remote (mode manual)
bool desiredIsi      = false;

// === SENSOR (hasil mapping potensio) ===
float sensorPH         = 7.0;
float sensorTurbidity  = 5.0;
float sensorOxygen     = 8.0;
float sensorTemp       = 27.0;
float sensorWaterLevel = 50.0;

// === STATE MACHINE OTOMATIS ===
int langkahOtomatis = LANGKAH_CEK_KUALITAS;

// === AERATOR (kendali DO) ===
int   aeratorMode     = 1;      // 0=off, 1=auto (histeresis DO), 2=manual
float aeratorDoOn     = AERATOR_DO_ON_DEFAULT;
float aeratorDoOff    = AERATOR_DO_OFF_DEFAULT;
bool  aeratorManualOn = false;  // status saat mode manual
bool  aeratorOn       = false;  // status aktual relay aerator

// === TIMING ===
unsigned long lastPublish    = 0;
unsigned long lastStatus     = 0;
unsigned long lastMqttAttempt = 0;

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== KONTROL AIR KOLAM (Dashboard) ===");

  pinMode(PIN_BUTTON_KURAS, INPUT_PULLUP);
  pinMode(PIN_BUTTON_ISI,   INPUT_PULLUP);
  pinMode(PIN_VALVE_KURAS,  OUTPUT);
  pinMode(PIN_VALVE_ISI,    OUTPUT);
  pinMode(PIN_AERATOR,      OUTPUT);
  digitalWrite(PIN_VALVE_KURAS, HIGH);   // relay Active-LOW → OFF
  digitalWrite(PIN_VALVE_ISI,   HIGH);
  digitalWrite(PIN_AERATOR,     HIGH);

  analogReadResolution(12);              // ESP32 ADC 12-bit (0..4095)

  topicSensors = String("aquaculture/") + FARM_ID + "/" + POND_ID + "/sensors";
  topicStatus  = String("aquaculture/") + FARM_ID + "/" + POND_ID + "/status";
  topicControl = String("aquaculture/") + FARM_ID + "/" + POND_ID + "/control";

  setupWiFiMqtt();

  Serial.println("Mode default: MANUAL. Ketik 'A'=AUTO | 'M'=MANUAL (Serial).");
  Serial.println("Kontrol dari dashboard tetap berjalan (perintah valve).");
}

void loop() {
  maintainMqtt();          // pump WebSocket + keepalive + reconnect

  bacaSemuaSensor();       // baca 5 potensio (selalu, agar dashboard selalu update)

  // Perintah Serial (opsional, seperti versi mahasiswa)
  if (Serial.available() > 0) {
    char c = Serial.read();
    if (c == 'A' || c == 'a') modeOtomatis = true;
    else if (c == 'M' || c == 'm') modeOtomatis = false;
  }

  // Transisi mode → matikan valve & reset langkah
  if (modeOtomatis != modeOtomatisLama) {
    valveKurasState = valveIsiState = false;
    desiredKuras = desiredIsi = false;
    digitalWrite(PIN_VALVE_KURAS, HIGH);
    digitalWrite(PIN_VALVE_ISI,   HIGH);
    if (modeOtomatis) langkahOtomatis = LANGKAH_CEK_KUALITAS;
    Serial.printf("\n>> Mode: %s\n", modeOtomatis ? "AUTOMATIC" : "MANUAL");
    modeOtomatisLama = modeOtomatis;
  }

  if (modeOtomatis) runAutomaticMode();
  else              runManualMode();

  updateAerator();   // kendali aerator (auto DO / manual) — independen dari valve

  // Log valve saat berubah
  if (valveKurasState != valveKurasStateLama || valveIsiState != valveIsiStateLama) {
    Serial.printf("[VALVE] Kuras:%s Isi:%s\n",
                  valveKurasState ? "ON" : "off", valveIsiState ? "ON" : "off");
    valveKurasStateLama = valveKurasState;
    valveIsiStateLama   = valveIsiState;
  }

  // Kirim data sensor & status ke dashboard
  unsigned long now = millis();
  if (now - lastPublish >= PUBLISH_INTERVAL_MS) { lastPublish = now; publishSensors(); }
  if (now - lastStatus  >= 15000)               { lastStatus  = now; publishStatus(); }

  delay(30);
}
