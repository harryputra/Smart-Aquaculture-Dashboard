#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Update.h>
#include <ArduinoJson.h>
#include "Parameter.h"

// Ambil fungsi publish status dari Koneksi.ino supaya bisa dipanggil di sini
extern void publishOtaStatus(const String& state, int progress);
extern MQTTPubSubClient mqttClient2; 

void performOTA(String url, String expectedSha256) {
  Serial.println("[OTA] Memulai unduh dari: " + url);
  publishOtaStatus("progress", 0); // Lapor ke dashboard: mulai download

  WiFiClientSecure client;
  // Melewati validasi sertifikat SSL/HTTPS sesuai aturan dashboard v2
  client.setInsecure(); 

  HTTPClient http;
  http.begin(client, url);

  int httpCode = http.GET();
  if (httpCode != HTTP_CODE_OK) {
    Serial.printf("[OTA] Gagal download, HTTP Code: %d\n", httpCode);
    publishOtaStatus("fail", 0);
    http.end();
    return;
  }

  int contentLength = http.getSize();
  bool canBegin = Update.begin(contentLength);
  if (!canBegin) {
    Serial.println("[OTA] Partisi flash tidak muat! Cek Partition Scheme di Arduino IDE.");
    publishOtaStatus("fail", 0);
    http.end();
    return;
  }

  // Set pengecekan sidik jari digital (SHA256) untuk keamanan
  if (expectedSha256 != "") {
    Update.setMD5(expectedSha256.c_str()); 
  }

  WiFiClient* stream = http.getStreamPtr();
  size_t written = 0;
  uint8_t buff[1024] = { 0 };
  int progress = 0;
  int lastProgress = 0;

  while (http.connected() && (written < contentLength)) {
    // Jaga koneksi MQTT agar tidak timeout dan sistem tidak restart paksa
    mqttClient2.update(); 
    
    size_t size = stream->available();
    if (size) {
      int c = stream->readBytes(buff, ((size > sizeof(buff)) ? sizeof(buff) : size));
      Update.write(buff, c);
      written += c;
      
      progress = (written * 100) / contentLength;
      if (progress - lastProgress >= 5) { // Lapor progress tiap naik 5% supaya tidak spam server
        Serial.printf("[OTA] Progress: %d%%\n", progress);
        publishOtaStatus("progress", progress);
        lastProgress = progress;
      }
    }
    delay(1);
  }

  if (written == contentLength) {
    Serial.println("[OTA] Download selesai.");
  } else {
    Serial.println("[OTA] Download terputus.");
    Update.abort();
    publishOtaStatus("fail", 0);
    http.end();
    return;
  }

  if (Update.end()) {
    if (Update.isFinished()) {
      Serial.println("[OTA] Update sukses! Rebooting...");
      publishOtaStatus("success", 100);
      delay(1000);
      ESP.restart(); // Restart alat otomatis dengan otak baru!
    } else {
      Serial.println("[OTA] Update tidak sempurna.");
      publishOtaStatus("fail", 0);
    }
  } else {
    Serial.printf("[OTA] Error: %s\n", Update.errorString());
    publishOtaStatus("fail", 0);
  }
  http.end();
}

// Terpicu saat dashboard mengirim payload manifest ke topik OTA
void onOtaManifest(const String& payload) {
  Serial.println("[OTA] Manifest diterima: " + payload);
  
  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, payload);
  
  if (err) {
    Serial.println("[OTA] Gagal parsing JSON.");
    return;
  }
  
  String url = doc["url"] | "";
  String sha256 = doc["sha256"] | ""; 
  
  if (url != "") {
     // Eksekusi proses unduh firmware
     performOTA(url, sha256);
  }
}