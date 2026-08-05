#include "Parameter.h"
#include <esp_ota_ops.h> 

// Ambil nilai DO dari Main
extern float nilaiDO;

static String wqClientId(const char* suffix) {
  uint32_t low = (uint32_t)(ESP.getEfuseMac() & 0xFFFFFF);
  return String("air_") + String(low, HEX) + suffix;
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

  if (MQTT_V1_ENABLED) {
    wsClient.beginSSL(MQTT_SERVER, MQTT_PORT, MQTT_PATH, "", MQTT_SUBPROTO);
    wsClient.setReconnectInterval(3000);
    mqttClient.begin(wsClient);
    mqttClient.setKeepAliveTimeout(60);
  }

  wsClient2.beginSSL(MQTT_SERVER_V2, MQTT_PORT_V2, MQTT_PATH_V2, "", MQTT_SUBPROTO_V2);
  wsClient2.setReconnectInterval(3000);
  mqttClient2.begin(wsClient2);
  mqttClient2.setKeepAliveTimeout(60);
}

void maintainMqttV1() {
  if (!MQTT_V1_ENABLED) return;
  mqttClient.update();
  if (!mqttClient.isConnected() && millis() - lastMqttAttempt > 5000) {
    lastMqttAttempt = millis();
    Serial.println("[MQTT-v1] Menyambung ke broker (mirror sensor-only)...");
    if (mqttClient.connect(wqClientId("_v1").c_str(), MQTT_USER, MQTT_PASSWORD)) {
      Serial.println("[MQTT-v1] Terhubung.");
      publishStatus();
    } else {
      Serial.println("[MQTT-v1] Gagal, retry...");
    }
  }
}

void maintainMqttV2() {
  mqttClient2.update();
  if (!mqttClient2.isConnected() && millis() - lastMqttAttempt2 > 5000) {
    lastMqttAttempt2 = millis();
    Serial.println("[MQTT-v2] Menyambung ke broker (kontrol utama)...");
    if (mqttClient2.connect(wqClientId("_v2").c_str(), MQTT_USER_V2, MQTT_PASSWORD_V2)) {
      esp_ota_mark_app_valid_cancel_rollback();
      mqttClient2.subscribe(topicControl2, [](const String& payload, const size_t size) {
        onControl(payload);
      });
      Serial.println("[MQTT-v2] Terhubung. Subscribe: " + topicControl2);
      mqttClient2.subscribe(topicOta2, [](const String& payload, const size_t size) {
        extern void onOtaManifest(const String& payload);
        onOtaManifest(payload);
      });
      Serial.println("[MQTT-v2] Subscribe OTA: " + topicOta2);
      publishStatus();
    } else {
      Serial.println("[MQTT-v2] Gagal, retry...");
    }
  }
}

void maintainMqtt() {
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long lastWifi = 0;
    if (millis() - lastWifi > 10000) { lastWifi = millis(); WiFi.begin(WIFI_SSID, WIFI_PASSWORD); }
    return;
  }
  maintainMqttV1();
  maintainMqttV2();
}

void publishSensors() {
  String p = "{";
  p += "\"temperature\":"   + String(suhuC, 2) + ",";
  p += "\"depth\":"         + (levelAir  >= 0 ? String(levelAir, 1)  : String("null")) + ",";
  p += "\"turbidity\":"     + String(turbidity, 1) + ",";
  p += "\"ph\":"            + String(phVal, 2) + ",";
  p += "\"do\":"            + String(nilaiDO, 2) + ","; // <--- TAMBAHAN DO DISINI
  p += "\"feed_level_cm\":" + (levelPakan >= 0 ? String(levelPakan, 1) : String("null"));
  p += "}";
  if (MQTT_V1_ENABLED && mqttClient.isConnected()) mqttClient.publish(topicSensors, p);
  if (mqttClient2.isConnected())                   mqttClient2.publish(topicSensors2, p);
}

void publishStatus() {
  String p = String("{\"online\":true,\"ip\":\"") + WiFi.localIP().toString()
           + "\",\"rssi\":" + String(WiFi.RSSI()) + "}";
  if (MQTT_V1_ENABLED && mqttClient.isConnected()) mqttClient.publish(topicStatus, p);
  if (mqttClient2.isConnected())                   mqttClient2.publish(topicStatus2, p);
}

void onControl(const String& payload) {
  Serial.println("[CTRL] " + payload);
  StaticJsonDocument<200> doc;
  if (deserializeJson(doc, payload)) return;
  const char* cmd = doc["command"] | "";
  if (strcmp(cmd, "open_valve") == 0)        desiredKuras = true;
  else if (strcmp(cmd, "close_valve") == 0)  desiredKuras = false;
  else if (strcmp(cmd, "open_inlet") == 0)   desiredIsi = true;
  else if (strcmp(cmd, "close_inlet") == 0)  desiredIsi = false;
}

void publishOtaStatus(const String& state, int progress = 0) {
  String p = "{\"state\":\"" + state + "\",\"progress\":" + String(progress) + "}";
  if (mqttClient2.isConnected()) {
    mqttClient2.publish(topicOtaStatus2, p);
  }
}