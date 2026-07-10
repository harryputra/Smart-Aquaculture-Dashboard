#include "Parameter.h"
// ======================================================================
// Koneksi: WiFi + MQTT over WebSocket Secure (Cloudflare) + publish sensor
// + terima perintah relay dari dashboard.
//   aquaculture/<FARM_ID>/<POND_ID>/sensors  (device → dashboard)
//   aquaculture/<FARM_ID>/<POND_ID>/status   (device → dashboard)
//   aquaculture/<FARM_ID>/<POND_ID>/control   (dashboard → device)
// ======================================================================

static String wqClientId() {
  uint32_t low = (uint32_t)(ESP.getEfuseMac() & 0xFFFFFF);
  return String("air_") + String(low, HEX);
}

void setupWiFiMqtt() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("[WiFi] Menyambung");
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) { delay(300); Serial.print("."); }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) Serial.println("[WiFi] OK: " + WiFi.localIP().toString());
  else Serial.println("[WiFi] GAGAL (akan retry). Sensor & relay lokal tetap jalan.");

  wsClient.beginSSL(MQTT_SERVER, MQTT_PORT, MQTT_PATH, "", MQTT_SUBPROTO);
  wsClient.setReconnectInterval(3000);
  mqttClient.begin(wsClient);
  mqttClient.setKeepAliveTimeout(60);
}

void maintainMqtt() {
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long lastWifi = 0;
    if (millis() - lastWifi > 10000) { lastWifi = millis(); WiFi.begin(WIFI_SSID, WIFI_PASSWORD); }
    return;
  }
  mqttClient.update();

  if (!mqttClient.isConnected() && millis() - lastMqttAttempt > 5000) {
    lastMqttAttempt = millis();
    Serial.println("[MQTT] Menyambung ke broker...");
    if (mqttClient.connect(wqClientId().c_str(), MQTT_USER, MQTT_PASSWORD)) {
      mqttClient.subscribe(topicControl, [](const String& payload, const size_t size) {
        onControl(payload);
      });
      Serial.println("[MQTT] Terhubung. Subscribe: " + topicControl);
      publishStatus();
    } else {
      Serial.println("[MQTT] Gagal, retry...");
    }
  }
}

// Kirim data sensor (format yang dibaca backend saveSensorData()).
void publishSensors() {
  if (!mqttClient.isConnected()) return;
  String p = "{";
  p += "\"temperature\":"   + String(suhuC, 2) + ",";
  p += "\"depth\":"         + (levelAir  >= 0 ? String(levelAir, 1)  : String("null")) + ",";
  p += "\"turbidity\":"     + String(turbidity, 1) + ",";
  p += "\"ph\":"            + String(phVal, 2) + ",";
  p += "\"feed_level_cm\":" + (levelPakan >= 0 ? String(levelPakan, 1) : String("null"));
  p += "}";
  mqttClient.publish(topicSensors, p);
}

void publishStatus() {
  if (!mqttClient.isConnected()) return;
  String p = String("{\"online\":true,\"ip\":\"") + WiFi.localIP().toString()
           + "\",\"rssi\":" + String(WiFi.RSSI()) + "}";
  mqttClient.publish(topicStatus, p);
}

// Perintah relay dari dashboard (kuras = open/close_valve, isi = open/close_inlet).
void onControl(const String& payload) {
  Serial.println("[CTRL] " + payload);
  StaticJsonDocument<200> doc;
  if (deserializeJson(doc, payload)) return;
  const char* cmd = doc["command"] | "";
  if (strcmp(cmd, "open_valve") == 0)        desiredKuras = true;
  else if (strcmp(cmd, "close_valve") == 0)  desiredKuras = false;
  else if (strcmp(cmd, "open_inlet") == 0)   desiredIsi = true;
  else if (strcmp(cmd, "close_inlet") == 0)  desiredIsi = false;
  // set_aerator / set_mode diabaikan (node ini tanpa aerator & tanpa auto lokal)
}
