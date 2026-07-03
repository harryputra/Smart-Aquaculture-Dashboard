#include "Parameter.h"
// ======================================================================
// Koneksi: WiFi + MQTT over WebSocket Secure (Cloudflare) + publish sensor
// ke dashboard + terima perintah valve dari dashboard.
// Topik:
//   aquaculture/<FARM_ID>/<POND_ID>/sensors  (device → dashboard)
//   aquaculture/<FARM_ID>/<POND_ID>/status   (device → dashboard)
//   aquaculture/<FARM_ID>/<POND_ID>/control   (dashboard → device)
// ======================================================================

static String wqClientId() {
  uint32_t low = (uint32_t)(ESP.getEfuseMac() & 0xFFFFFF);
  return String("wq_") + String(low, HEX);   // unik per board
}

void setupWiFiMqtt() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("[WiFi] Menyambung");
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) { delay(300); Serial.print("."); }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) Serial.println("[WiFi] OK: " + WiFi.localIP().toString());
  else Serial.println("[WiFi] GAGAL (akan retry). Kontrol lokal tetap jalan.");

  // MQTT over WebSocket Secure (port 443) via Cloudflare. Subprotocol "mqtt" WAJIB.
  wsClient.beginSSL(MQTT_SERVER, MQTT_PORT, MQTT_PATH, "", MQTT_SUBPROTO);
  wsClient.setReconnectInterval(3000);
  mqttClient.begin(wsClient);
  mqttClient.setKeepAliveTimeout(60);   // PING < 100s agar Cloudflare tak putus
}

void maintainMqtt() {
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long lastWifi = 0;
    if (millis() - lastWifi > 10000) { lastWifi = millis(); WiFi.begin(WIFI_SSID, WIFI_PASSWORD); }
    return;
  }
  mqttClient.update();   // WAJIB tiap loop

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

// Kirim data sensor ke dashboard (format yang dibaca backend saveSensorData()).
void publishSensors() {
  if (!mqttClient.isConnected()) return;
  String p = "{";
  p += "\"temperature\":"      + String(sensorTemp, 2)       + ",";
  p += "\"depth\":"            + String(sensorWaterLevel, 1) + ",";
  p += "\"dissolved_oxygen\":" + String(sensorOxygen, 2)     + ",";
  p += "\"turbidity\":"        + String(sensorTurbidity, 1)  + ",";
  p += "\"ph\":"               + String(sensorPH, 2)         + ",";
  p += "\"aerator\":"          + String(aeratorOn ? "true" : "false");
  p += "}";
  mqttClient.publish(topicSensors, p);
}

void publishStatus() {
  if (!mqttClient.isConnected()) return;
  String p = String("{\"online\":true,\"ip\":\"") + WiFi.localIP().toString()
           + "\",\"rssi\":" + String(WiFi.RSSI()) + "}";
  mqttClient.publish(topicStatus, p);
}

// Paksa ke mode MANUAL tanpa memicu reset transisi di loop (agar perintah
// remote yang baru di-set tidak terhapus).
static void forceManual() { modeOtomatis = false; modeOtomatisLama = false; }

// Perintah dari dashboard. Backend mengirim, mis:
//   {"command":"open_valve","source":"auto"}   → buka kuras (drain)
//   {"command":"close_valve"} / open_inlet / close_inlet
//   {"command":"set_mode","mode":"auto"|"manual"}
// Catatan: cek "set_mode" dulu agar kata "auto" pada field source tidak salah tafsir.
void onControl(const String& payload) {
  Serial.println("[CTRL] " + payload);
  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, payload)) return;     // JSON tak valid → abaikan
  const char* cmd = doc["command"] | "";

  if (strcmp(cmd, "set_mode") == 0) {            // {command:set_mode, mode:auto|manual}
    modeOtomatis = (strcmp(doc["mode"] | "", "auto") == 0);
  }
  else if (strcmp(cmd, "open_valve") == 0)  { forceManual(); desiredKuras = true;  desiredIsi = false; }
  else if (strcmp(cmd, "close_valve") == 0) { forceManual(); desiredKuras = false; }
  else if (strcmp(cmd, "open_inlet") == 0)  { forceManual(); desiredIsi = true;  desiredKuras = false; }
  else if (strcmp(cmd, "close_inlet") == 0) { forceManual(); desiredIsi = false; }
  else if (strcmp(cmd, "set_aerator") == 0) {    // config aerator dari dashboard
    const char* m = doc["mode"] | "";
    if      (strcmp(m, "off") == 0)    aeratorMode = 0;
    else if (strcmp(m, "manual") == 0) aeratorMode = 2;
    else if (strcmp(m, "auto") == 0)   aeratorMode = 1;
    if (doc.containsKey("do_on"))     aeratorDoOn     = doc["do_on"];
    if (doc.containsKey("do_off"))    aeratorDoOff    = doc["do_off"];
    if (doc.containsKey("manual_on")) aeratorManualOn = doc["manual_on"];
  }
}
