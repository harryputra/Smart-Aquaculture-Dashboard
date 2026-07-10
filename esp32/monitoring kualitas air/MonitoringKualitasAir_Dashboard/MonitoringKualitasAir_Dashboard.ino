// ======================================================================
// MonitoringKualitasAir_Dashboard (ESP32-S3)
// Monitoring kualitas air REAL SENSOR + terhubung ke Smart Aquaculture
// Dashboard (kirim data via MQTT + kontrol relay kuras/isi dari web).
// TERPISAH dari ESP32 pemberi pakan.
//
// Library: OneWire, DallasTemperature, WebSockets (Links2004),
//          MQTTPubSubClient (hideakitai), ArduinoJson.
// Board: ESP32S3 Dev Module. Serial 115200.
// Data → aquaculture/<FARM_ID>/<POND_ID>/sensors  (temperature/depth/turbidity/ph)
// Kontrol ← aquaculture/<FARM_ID>/<POND_ID>/control (open_valve/close_valve/...)
// ======================================================================
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <MQTTPubSubClient.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include "Parameter.h"

// --- Transport ---
WebSocketsClient wsClient;
MQTTPubSubClient mqttClient;
String topicSensors, topicStatus, topicControl;

// --- Sensor suhu ---
OneWire oneWire(PIN_SUHU_DS18B20);
DallasTemperature suhuSensor(&oneWire);

// --- Pembacaan ---
float suhuC = 0, phVal = 7, kejernihanPct = 100, turbidity = 0;
float jarakAir = -1, jarakPakan = -1, levelAir = -1, levelPakan = -1;

// --- Relay (kuras/isi) — latch dari dashboard atau Serial ---
bool desiredKuras = false, desiredIsi = false;

// --- Timing ---
unsigned long lastPublish = 0, lastStatus = 0, lastMqttAttempt = 0;

// (forward decl — antar file .ino auto-prototype, tapi eksplisitkan yg dipakai)
void setupWiFiMqtt();
void maintainMqtt();
void publishSensors();
void publishStatus();
void onControl(const String& payload);

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== MONITORING KUALITAS AIR (Dashboard) ===");

  analogReadResolution(12);
  suhuSensor.begin();

  pinMode(TRIG_AIR, OUTPUT);   pinMode(ECHO_AIR, INPUT);   digitalWrite(TRIG_AIR, LOW);
  pinMode(TRIG_PAKAN, OUTPUT); pinMode(ECHO_PAKAN, INPUT); digitalWrite(TRIG_PAKAN, LOW);
  pinMode(RELAY_KURAS, OUTPUT); pinMode(RELAY_ISI, OUTPUT);
  digitalWrite(RELAY_KURAS, HIGH); digitalWrite(RELAY_ISI, HIGH);   // Active-LOW → OFF

#ifdef RGB_BUILTIN
  neopixelWrite(RGB_BUILTIN, 50, 0, 0); delay(200);
  neopixelWrite(RGB_BUILTIN, 0, 50, 0); delay(200);
  neopixelWrite(RGB_BUILTIN, 0, 0, 50); delay(200);
  neopixelWrite(RGB_BUILTIN, 0, 0, 0);
#endif

  topicSensors = String("aquaculture/") + FARM_ID + "/" + POND_ID + "/sensors";
  topicStatus  = String("aquaculture/") + FARM_ID + "/" + POND_ID + "/status";
  topicControl = String("aquaculture/") + FARM_ID + "/" + POND_ID + "/control";

  setupWiFiMqtt();
  Serial.println("Serial: '1'=toggle Kuras | '2'=toggle Isi. Kontrol web tetap jalan.");
}

// ---------------------- FUNGSI SENSOR ----------------------------------
float bacaJarak(int trig, int echo) {
  digitalWrite(trig, LOW);  delayMicroseconds(2);
  digitalWrite(trig, HIGH); delayMicroseconds(10);
  digitalWrite(trig, LOW);
  long durasi = pulseIn(echo, HIGH, 30000);
  if (durasi == 0) return -1.0;
  return (durasi * 0.0343) / 2.0;
}

float bacaPH() {
  int buf[10], t;
  for (int i = 0; i < 10; i++) { buf[i] = analogRead(PIN_PH); delay(10); }
  for (int i = 0; i < 9; i++)
    for (int j = i + 1; j < 10; j++)
      if (buf[i] > buf[j]) { t = buf[i]; buf[i] = buf[j]; buf[j] = t; }
  long avg = 0;
  for (int i = 2; i < 8; i++) avg += buf[i];
  float volt = (float)avg * 3.3 / 4095.0 / 6.0;
  return -5.70 * volt + PH_CALIBRATION_VALUE;
}

float bacaKejernihan() {
  int v = analogRead(PIN_KEKERUHAN);
  float k = map(v, ADC_AIR_KERUH, ADC_AIR_JERNIH, 0, 100);
  if (k < 0) k = 0; if (k > 100) k = 100;
  return k;
}

void statusRGB() {
#ifdef RGB_BUILTIN
  if (jarakAir < 0)        neopixelWrite(RGB_BUILTIN, 0, 0, 40);
  else if (jarakAir < 10)  neopixelWrite(RGB_BUILTIN, 60, 0, 0);
  else if (jarakAir <= 30) neopixelWrite(RGB_BUILTIN, 50, 30, 0);
  else                     neopixelWrite(RGB_BUILTIN, 0, 50, 0);
#endif
}

void applyRelays() {
  digitalWrite(RELAY_KURAS, desiredKuras ? LOW : HIGH);
  digitalWrite(RELAY_ISI,   desiredIsi   ? LOW : HIGH);
}

void handleRelaySerial() {
  if (Serial.available() <= 0) return;
  char c = Serial.read();
  if (c == '1') { desiredKuras = !desiredKuras; Serial.printf("Kuras: %s\n", desiredKuras ? "ON" : "OFF"); }
  else if (c == '2') { desiredIsi = !desiredIsi; Serial.printf("Isi: %s\n", desiredIsi ? "ON" : "OFF"); }
}

void bacaSemuaSensor() {
  suhuSensor.requestTemperatures();
  float s = suhuSensor.getTempCByIndex(0);
  if (s != DEVICE_DISCONNECTED_C) suhuC = s;
  phVal = bacaPH();
  kejernihanPct = bacaKejernihan();
  turbidity = 100.0 - kejernihanPct;            // dashboard: tinggi = keruh
  jarakAir = bacaJarak(TRIG_AIR, ECHO_AIR);
  delay(30);
  jarakPakan = bacaJarak(TRIG_PAKAN, ECHO_PAKAN);
  levelAir   = (jarakAir   >= 0) ? max(0.0f, (float)TINGGI_TABUNG_AIR_CM  - jarakAir)   : -1;
  levelPakan = (jarakPakan >= 0) ? max(0.0f, (float)TINGGI_WADAH_PAKAN_CM - jarakPakan) : -1;
}

// ============================== LOOP ===================================
void loop() {
  maintainMqtt();
  handleRelaySerial();
  bacaSemuaSensor();
  applyRelays();
  statusRGB();

  unsigned long now = millis();
  if (now - lastPublish >= PUBLISH_INTERVAL_MS) { lastPublish = now; publishSensors(); }
  if (now - lastStatus  >= 15000)               { lastStatus  = now; publishStatus(); }

  delay(50);
}
