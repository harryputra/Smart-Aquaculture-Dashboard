// ======================================================================
// MonitoringKualitasAir_Dashboard (ESP32-S3)
// ======================================================================
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <MQTTPubSubClient.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include "Parameter.h"

// --- Transport server v1 ---
WebSocketsClient wsClient;
MQTTPubSubClient mqttClient;
String topicSensors, topicStatus, topicControl;
String topicOta2, topicOtaStatus2;

// --- Transport server v2 ---
WebSocketsClient wsClient2;
MQTTPubSubClient mqttClient2;
String topicSensors2, topicStatus2, topicControl2;
String deviceId;   // ID perangkat air dari MAC (air_<mac>) — model device-id spt feeder

// --- Sensor suhu ---
OneWire oneWire(PIN_SUHU_DS18B20);
DallasTemperature suhuSensor(&oneWire);

// --- Sensor DO (Modbus) ---
HardwareSerial modbusSerial(1);
uint8_t ComDO[8] = { 0x01, 0x03, 0x00, 0x00, 0x00, 0x06, 0xC5, 0xC8 };
float nilaiDO = 0.0; 

// --- Pembacaan ---
float suhuC = 0, phVal = 7, turbidity = 0;
float jarakAir = -1, jarakPakan = -1, levelAir = -1, levelPakan = -1;

// --- Relay ---
bool desiredKuras = false, desiredIsi = false;

// --- Timing ---
unsigned long lastPublish = 0, lastStatus = 0, lastMqttAttempt = 0, lastMqttAttempt2 = 0;

void setupWiFiMqtt();
void maintainMqtt();
void publishSensors();
void publishStatus();
void onControl(const String& payload);

float baca_adc_stabil(int pin, int jumlah_sampel) {
  long total_adc = 0;
  for (int i = 0; i < jumlah_sampel; i++) {
    total_adc += analogRead(pin);
    delay(5); 
  }
  return (float)total_adc / jumlah_sampel;
}

// Fungsi konversi linier ke NTU (BARU)
float baca_turbidity_ntu() {
  float adc_mentah = baca_adc_stabil(PIN_KEKERUHAN, 50);
  float ntu = (adc_mentah - ADC_KOLAM) * (NTU_MAKSIMAL - NTU_KOLAM) / (ADC_TERHALANG - ADC_KOLAM) + NTU_KOLAM;
  
  if (ntu < 0.0f) ntu = 0.0f;
  else if (ntu > NTU_MAKSIMAL) ntu = NTU_MAKSIMAL;
  return ntu;
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== MONITORING KUALITAS AIR (Dashboard) ===");

  analogReadResolution(12);
  suhuSensor.begin();
  
  // Inisialisasi Modbus DO
  modbusSerial.begin(4800, SERIAL_8N1, RX_PIN_DO, TX_PIN_DO);

  pinMode(TRIG_AIR, OUTPUT);   pinMode(ECHO_AIR, INPUT);   digitalWrite(TRIG_AIR, LOW);
  pinMode(TRIG_PAKAN, OUTPUT); pinMode(ECHO_PAKAN, INPUT); digitalWrite(TRIG_PAKAN, LOW);
  pinMode(RELAY_KURAS, OUTPUT); pinMode(RELAY_ISI, OUTPUT);
  digitalWrite(RELAY_KURAS, HIGH); digitalWrite(RELAY_ISI, HIGH);   

  pinMode(LED_KURAS, OUTPUT); pinMode(LED_ISI, OUTPUT);
  digitalWrite(LED_KURAS, LOW); digitalWrite(LED_ISI, LOW);         

#ifdef RGB_BUILTIN
  neopixelWrite(RGB_BUILTIN, 50, 0, 0); delay(200);
  neopixelWrite(RGB_BUILTIN, 0, 50, 0); delay(200);
  neopixelWrite(RGB_BUILTIN, 0, 0, 50); delay(200);
  neopixelWrite(RGB_BUILTIN, 0, 0, 0);
#endif

  topicSensors = String("aquaculture/") + FARM_ID + "/" + POND_ID + "/sensors";
  topicStatus  = String("aquaculture/") + FARM_ID + "/" + POND_ID + "/status";
  topicControl = String("aquaculture/") + FARM_ID + "/" + POND_ID + "/control";

  // Model DEVICE-ID (seperti feeder): topik memakai device_id dari MAC. Backend
  // meng-ASSIGN device → kolam; firmware tak perlu hardcode farm/pond lagi.
  uint32_t macLow = (uint32_t)(ESP.getEfuseMac() & 0xFFFFFF);
  deviceId = String("air_") + String(macLow, HEX);
  Serial.println("[ID] device_id: " + deviceId);
  topicSensors2 = String("aquaculture/device/") + deviceId + "/sensors";
  topicStatus2  = String("aquaculture/device/") + deviceId + "/status";
  topicControl2 = String("aquaculture/device/") + deviceId + "/control";
  topicOta2       = String("aquaculture/device/") + deviceId + "/ota";
  topicOtaStatus2 = String("aquaculture/device/") + deviceId + "/ota_status";

  setupWiFiMqtt();
  Serial.println("Serial: '1'=toggle Kuras | '2'=toggle Isi.");
}

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

// ======================== MODBUS DO ========================
uint8_t readN(uint8_t *buf, size_t len) {
  size_t offset = 0, left = len;
  int16_t Tineout = 500;
  uint8_t *buffer = buf;
  long curr = millis();
  while (left) {
    if (modbusSerial.available()) {
      buffer[offset] = modbusSerial.read();
      offset++;
      left--;
    }
    if (millis() - curr > Tineout) break;
  }
  return offset;
}

unsigned int CRC16_2(unsigned char *buf, int len) {
  unsigned int crc = 0xFFFF;
  for (int pos = 0; pos < len; pos++) {
    crc ^= (unsigned int)buf[pos];
    for (int i = 8; i != 0; i--) {
      if ((crc & 0x0001) != 0) { crc >>= 1; crc ^= 0xA001; } 
      else { crc >>= 1; }
    }
  }
  crc = ((crc & 0x00ff) << 8) | ((crc & 0xff00) >> 8);
  return crc;
}

void baca_DO() {
  // TAMBAHAN PENTING: Timer non-blocking agar tidak spam sensor
  static unsigned long lastDORequest = 0;
  if (millis() - lastDORequest < 2000) return; // Hanya eksekusi tiap 2 detik
  lastDORequest = millis();

  uint32_t val1 = 0;
  uint8_t Data[18] = { 0 };
  uint8_t ch = 0;
  bool flag = 1;
  
  // Bersihkan sisa buffer dari loop sebelumnya (jika ada)
  while (modbusSerial.available() > 0) modbusSerial.read();
  
  // Tembak perintah request ke sensor
  modbusSerial.write(ComDO, 8);
  
  long timeStart = millis();
  
  while (flag) {
    if ((millis() - timeStart) > 1000) {
      Serial.println("[DEBUG DO] Timeout! Sensor tidak merespon.");
      return; 
    }
    
    if (readN(&ch, 1) == 1 && ch == 0x01) {
      Data[0] = ch;
      if (readN(&ch, 1) == 1 && ch == 0x03) {
        Data[1] = ch;
        if (readN(&ch, 1) == 1 && ch == 0x0C) {
          Data[2] = ch;
          if (readN(&Data[3], 14) == 14) {
            if (CRC16_2(Data, 15) == (Data[15] * 256 + Data[16])) {
              // Kalkulasi data Modbus
              val1 = Data[7];
              val1 = (val1 << 8) | Data[8];
              val1 = (val1 << 8) | Data[9];
              val1 = (val1 << 8) | Data[10];
              float *Do = (float *)&val1;
              nilaiDO = *Do; 
              
              // Tampilkan nilai berhasil untuk konfirmasi di Serial Monitor
              Serial.print("[DEBUG DO] Nilai DO Terbaca: ");
              Serial.println(nilaiDO);
              
              flag = 0; // Berhasil, keluar dari loop tunggu
            }
          }
        }
      }
    }
  }
}
// ==========================================================

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
  digitalWrite(LED_KURAS, desiredKuras ? HIGH : LOW);      
  digitalWrite(LED_ISI,   desiredIsi   ? HIGH : LOW);
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
  turbidity = baca_turbidity_ntu(); 
  
  // Baca DO dan update variabel global nilaiDO
  baca_DO();
  
  jarakAir = bacaJarak(TRIG_AIR, ECHO_AIR);
  delay(30);
  jarakPakan = bacaJarak(TRIG_PAKAN, ECHO_PAKAN);
  levelAir   = (jarakAir   >= 0) ? max(0.0f, (float)TINGGI_TABUNG_AIR_CM  - jarakAir + DEPTH_KALIBRASI_CM) : -1;
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

// Fungsi dummy manual publish, jaga-jaga kalau dipanggil di luaran
void publishSensorData() {
  if (!mqttClient2.isConnected()) return;
  StaticJsonDocument<256> doc;
  doc["temperature"]   = suhuC;       
  doc["depth"]         = levelAir >= 0 ? levelAir : -1;       
  doc["turbidity"]     = round(turbidity * 10.0) / 10.0; 
  doc["ph"]            = phVal;        
  doc["do"]            = round(nilaiDO * 100.0) / 100.0;
  doc["feed_level_cm"] = levelPakan >= 0 ? levelPakan : -1;       
  
  String payload;
  serializeJson(doc, payload);
  String topicSensor2 = String("aquaculture/") + FARM_ID_V2 + "/" + POND_ID_V2 + "/sensors";
  mqttClient2.publish(topicSensor2, payload);
  Serial.print("[SENSOR] Data terkirim ke Dashboard: ");
  Serial.println(payload);
}