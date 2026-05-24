/*
 * Smart Aquaculture - ESP32 Firmware v2
 * 
 * Fitur:
 * - Pembacaan 5 sensor (Suhu, Kedalaman, DO, Kekeruhan, pH)
 * - Kontrol 2 katup: Pengurasan (drain) & Pengisian (inlet)
 * - Pelaporan status & koneksi ke backend setiap 10 detik
 * - MQTT subscribe untuk perintah kontrol dari server
 *
 * Library yang dibutuhkan:
 * - WiFi.h (built-in ESP32)
 * - PubSubClient (oleh Nick O'Leary)
 * - ArduinoJson (oleh Benoit Blanchon)
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ============================
// KONFIGURASI - SESUAIKAN!
// ============================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* MQTT_HOST     = "192.168.1.100";  // IP komputer Docker
const int   MQTT_PORT     = 1883;
const char* MQTT_USER     = "aquaculture";
const char* MQTT_PASSWORD = "aquaculture123";

const char* FARM_ID = "farm_001";
const char* POND_ID = "pond_001";
const char* DEVICE_ID = "ESP32-001";

// PIN
#define PIN_DRAIN_VALVE  2    // Katup pengurasan
#define PIN_INLET_VALVE  4    // Katup pengisian
#define PIN_LED          13   // LED status
// Sensor analog pin (sesuaikan dengan hardware)
#define PIN_TEMP         34
#define PIN_DEPTH        35
#define PIN_DO           32
#define PIN_TURB         33
#define PIN_PH           36

WiFiClient espClient;
PubSubClient mqtt(espClient);

unsigned long lastSensorSend = 0;
unsigned long lastStatusSend = 0;
const unsigned long SENSOR_INTERVAL = 3000;   // Kirim sensor tiap 3 detik
const unsigned long STATUS_INTERVAL = 10000;  // Kirim status tiap 10 detik

bool drainValveOpen = false;
bool inletValveOpen = false;

// Buffer string topic
char topicSensor[100];
char topicControl[100];
char topicStatus[100];

void setup() {
  Serial.begin(115200);
  Serial.println("\n🐟 Smart Aquaculture ESP32 v2");

  pinMode(PIN_DRAIN_VALVE, OUTPUT);
  pinMode(PIN_INLET_VALVE, OUTPUT);
  pinMode(PIN_LED, OUTPUT);

  digitalWrite(PIN_DRAIN_VALVE, LOW);
  digitalWrite(PIN_INLET_VALVE, LOW);

  // Build topic
  snprintf(topicSensor, sizeof(topicSensor), "aquaculture/%s/%s/sensors", FARM_ID, POND_ID);
  snprintf(topicControl, sizeof(topicControl), "aquaculture/%s/%s/control", FARM_ID, POND_ID);
  snprintf(topicStatus, sizeof(topicStatus), "aquaculture/%s/%s/status", FARM_ID, POND_ID);

  connectWiFi();
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMessage);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  if (!mqtt.connected()) connectMQTT();
  mqtt.loop();

  unsigned long now = millis();

  if (now - lastSensorSend > SENSOR_INTERVAL) {
    lastSensorSend = now;
    sendSensorData();
  }

  if (now - lastStatusSend > STATUS_INTERVAL) {
    lastStatusSend = now;
    sendStatus();
  }
}

void connectWiFi() {
  Serial.printf("📶 Menyambung ke WiFi: %s\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry++ < 30) {
    delay(500);
    Serial.print(".");
    digitalWrite(PIN_LED, !digitalRead(PIN_LED));
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n✓ WiFi tersambung. IP: %s, RSSI: %d dBm\n",
      WiFi.localIP().toString().c_str(), WiFi.RSSI());
    digitalWrite(PIN_LED, HIGH);
  } else {
    Serial.println("\n✗ Gagal sambung WiFi");
  }
}

void connectMQTT() {
  while (!mqtt.connected()) {
    Serial.printf("📡 Menyambung MQTT %s:%d...\n", MQTT_HOST, MQTT_PORT);
    char clientId[32];
    snprintf(clientId, sizeof(clientId), "esp32_%s", DEVICE_ID);
    if (mqtt.connect(clientId, MQTT_USER, MQTT_PASSWORD)) {
      Serial.println("✓ MQTT tersambung");
      mqtt.subscribe(topicControl);
      Serial.printf("  Subscribed: %s\n", topicControl);
      sendStatus();
    } else {
      Serial.printf("✗ MQTT gagal, code=%d. Coba lagi 3 detik...\n", mqtt.state());
      delay(3000);
    }
  }
}

void onMessage(char* topic, byte* payload, unsigned int length) {
  // Buat null-terminated string
  char buf[256];
  unsigned int len = min(length, sizeof(buf) - 1);
  memcpy(buf, payload, len);
  buf[len] = '\0';

  Serial.printf("📥 Pesan: %s = %s\n", topic, buf);

  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, buf)) {
    Serial.println("✗ JSON parse error");
    return;
  }

  const char* command = doc["command"];
  const char* source = doc["source"] | "manual";
  if (!command) return;

  if (strcmp(command, "open_valve") == 0) {
    drainValveOpen = true;
    digitalWrite(PIN_DRAIN_VALVE, HIGH);
    Serial.printf("💧 Katup pengurasan DIBUKA (source: %s)\n", source);
  } else if (strcmp(command, "close_valve") == 0) {
    drainValveOpen = false;
    digitalWrite(PIN_DRAIN_VALVE, LOW);
    Serial.printf("💧 Katup pengurasan DITUTUP (source: %s)\n", source);
  } else if (strcmp(command, "open_inlet") == 0) {
    inletValveOpen = true;
    digitalWrite(PIN_INLET_VALVE, HIGH);
    Serial.printf("🌊 Katup pengisian DIBUKA (source: %s)\n", source);
  } else if (strcmp(command, "close_inlet") == 0) {
    inletValveOpen = false;
    digitalWrite(PIN_INLET_VALVE, LOW);
    Serial.printf("🌊 Katup pengisian DITUTUP (source: %s)\n", source);
  } else if (strcmp(command, "feed") == 0) {
    float amount = doc["amount"] | 0.0;
    Serial.printf("🍽️  Trigger pakan: %.2f kg (source: %s)\n", amount, source);
    // TODO: aktifkan servo/motor feeder
  }
}

void sendSensorData() {
  // ⚠️ Ganti pembacaan dummy ini dengan pembacaan sensor sesungguhnya
  // Contoh implementasi nyata:
  //   float temp = readTempSensor(); // DS18B20 / RTD
  //   float depth = readUltrasonic();
  //   float doVal = readDOSensor();
  //   ... dst

  // Untuk simulasi/testing tanpa sensor fisik:
  static float baseTemp = 27.5;
  static float baseDepth = 120;
  static float baseDO = 6.5;
  static float baseTurb = 25;
  static float basePh = 7.2;

  float temp = baseTemp + (random(-10, 10) / 10.0);
  float depth = baseDepth + (random(-3, 3));
  float doVal = baseDO + (random(-5, 5) / 10.0);
  float turb = baseTurb + (random(-5, 5));
  float ph = basePh + (random(-2, 2) / 10.0);

  StaticJsonDocument<256> doc;
  doc["temperature"] = temp;
  doc["depth"] = depth;
  doc["dissolved_oxygen"] = doVal;
  doc["turbidity"] = turb;
  doc["ph"] = ph;
  doc["valve_open"] = drainValveOpen;
  doc["inlet_valve_open"] = inletValveOpen;
  doc["timestamp"] = millis();

  char buffer[256];
  size_t n = serializeJson(doc, buffer);
  if (mqtt.publish(topicSensor, buffer, n)) {
    Serial.printf("📤 Sensor terkirim: T=%.1f°C D=%.0fcm DO=%.1f Turb=%.0f pH=%.1f\n",
      temp, depth, doVal, turb, ph);
  }
}

void sendStatus() {
  StaticJsonDocument<200> doc;
  doc["online"] = true;
  doc["device_id"] = DEVICE_ID;
  doc["ip"] = WiFi.localIP().toString();
  doc["rssi"] = WiFi.RSSI();
  doc["firmware"] = "v2.0";
  doc["drain_valve"] = drainValveOpen;
  doc["inlet_valve"] = inletValveOpen;

  char buffer[200];
  size_t n = serializeJson(doc, buffer);
  mqtt.publish(topicStatus, buffer, n);
}
