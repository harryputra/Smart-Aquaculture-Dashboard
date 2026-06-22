/* ======================================================================
 *  CONTOH: MQTT over WebSocket Secure (WSS) untuk ESP32
 *  Smart Aquaculture — uji koneksi ke broker lewat Cloudflare Tunnel
 * ----------------------------------------------------------------------
 *  Upload sketch INI dulu (sebelum mengubah sketch besar pakan lele) untuk
 *  memastikan jalur wss://mqtt.<domain> sudah benar. Jika di Serial Monitor
 *  muncul "MQTT (WSS) terhubung!" dan device tampil di dashboard, berarti
 *  pipeline siap.
 *
 *  LIBRARY YANG HARUS DIINSTALL (Arduino IDE > Tools > Manage Libraries):
 *    1. "WebSockets"        by Markus Sattler   (a.k.a. arduinoWebSockets)
 *    2. "MQTTPubSubClient"  by hideakitai
 *    3. "ArduinoJson"       by Benoit Blanchon
 *
 *  Board: ESP32 (Tools > Board > ESP32 Dev Module). Baud Serial: 115200.
 * ====================================================================== */

#include <WiFi.h>
#include <WebSocketsClient.h>   // WAJIB di-include SEBELUM MQTTPubSubClient.h
#include <MQTTPubSubClient.h>
#include <ArduinoJson.h>

// ============ UBAH BAGIAN INI SESUAI PUNYA ANDA ============
const char* WIFI_SSID     = "NAMA_WIFI_ANDA";
const char* WIFI_PASSWORD = "PASSWORD_WIFI_ANDA";

const char*    MQTT_HOST = "mqtt.trin-polman.id";  // subdomain Cloudflare (WSS)
const uint16_t MQTT_PORT = 443;                     // WSS via Cloudflare = 443
const char*    MQTT_PATH = "/";                     // mosquitto WebSocket = "/"
const char*    MQTT_USER = "aquaculture";           // sama dgn .env server
const char*    MQTT_PASS = "PASSWORD_MQTT_ANDA";    // sama dgn .env server
const char*    DEVICE_ID = "pakan_lele_01";
// ==========================================================

WebSocketsClient ws;
MQTTPubSubClient mqtt;
unsigned long lastStatus = 0;

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("WiFi connecting");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.print("\nWiFi OK, IP: ");
  Serial.println(WiFi.localIP());
}

void connectMQTT() {
  Serial.printf("Konek broker  wss://%s:%u%s ...\n", MQTT_HOST, MQTT_PORT, MQTT_PATH);

  // PENTING: argumen ke-5 "mqtt" = WebSocket subprotocol. WAJIB diisi "mqtt"
  // agar mosquitto menerima koneksi (default library "arduino" akan DITOLAK).
  ws.beginSSL(MQTT_HOST, MQTT_PORT, MQTT_PATH, "", "mqtt");
  ws.setReconnectInterval(3000);

  mqtt.begin(ws);
  // Kirim PING sebelum 100 dtk agar Cloudflare tak memutus koneksi idle.
  mqtt.setKeepAliveTimeout(60);

  // Terima perintah dari dashboard: lele/device/<DEVICE_ID>/command
  String cmdTopic = String("lele/device/") + DEVICE_ID + "/command";
  mqtt.subscribe(cmdTopic, [](const String& payload, const size_t size) {
    Serial.print("[CMD] "); Serial.println(payload);
    // TODO: di sketch asli, proses perintah pakan di sini.
  });

  Serial.print("MQTT connect");
  while (!mqtt.connect(DEVICE_ID, MQTT_USER, MQTT_PASS)) {
    Serial.print(".");
    delay(1000);
    mqtt.update();
  }
  Serial.println("\n>>> MQTT (WSS) terhubung! <<<");
}

void publishStatus() {
  StaticJsonDocument<256> doc;
  doc["device_id"]      = DEVICE_ID;
  doc["wifi_connected"] = true;
  doc["mqtt_connected"] = true;
  doc["rtc_ok"]         = true;
  doc["fish_count"]     = 1000;
  doc["avg_fish_g"]     = 120;
  doc["feeding_per_day"] = 2;
  String out;
  serializeJson(doc, out);
  mqtt.publish("lele/device/status", out);
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== Contoh MQTT over WebSocket (ESP32) ===");
  connectWiFi();
  connectMQTT();
}

void loop() {
  mqtt.update();   // WAJIB dipanggil terus-menerus

  if (!mqtt.isConnected()) {
    Serial.println("MQTT putus — mencoba sambung ulang...");
    connectMQTT();
    return;
  }

  if (millis() - lastStatus > 3000) {
    lastStatus = millis();
    publishStatus();
    Serial.println("status terkirim → lele/device/status");
  }
}
