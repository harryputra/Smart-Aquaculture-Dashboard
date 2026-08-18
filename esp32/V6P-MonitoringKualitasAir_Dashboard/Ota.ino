#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Update.h>
#include "mbedtls/md.h"          // verifikasi sha256 (bukan MD5) — cocok dgn manifest backend
#include <ArduinoJson.h>
#include "Parameter.h"

// Ambil fungsi publish status dari Koneksi.ino supaya bisa dipanggil di sini
extern void publishOtaStatus(const String& state, int progress);
extern MQTTPubSubClient mqttClient2; 

static String otaHashHex(const uint8_t* h) {
  char b[65]; for (int i = 0; i < 32; i++) sprintf(b + i * 2, "%02x", h[i]); b[64] = 0; return String(b);
}

// Unduh .bin via HTTPS, verifikasi SHA256 (mbedtls, bukan MD5), tulis ke slot
// non-aktif, reboot. Gagal verifikasi/putus → firmware lama tetap (rollback).
void performOTA(String url, String expectedSha256) {
  expectedSha256.toLowerCase();
  Serial.println("[OTA] Memulai unduh dari: " + url);
  publishOtaStatus("downloading", 0);

  WiFiClientSecure client;
  client.setInsecure();                       // integritas dijamin sha256 (manifest MQTT)
  client.setTimeout(15000);
  HTTPClient http;
  http.setConnectTimeout(15000);
  http.setTimeout(20000);
  if (!http.begin(client, url)) { publishOtaStatus("fail", 0); return; }

  int httpCode = http.GET();
  if (httpCode != HTTP_CODE_OK) {
    Serial.printf("[OTA] HTTP %d\n", httpCode);
    publishOtaStatus("fail", 0); http.end(); return;
  }
  int total = http.getSize();
  if (total <= 0 || !Update.begin(total)) {
    Serial.println("[OTA] Ukuran/partisi tidak valid (cek Partition Scheme ber-OTA).");
    publishOtaStatus("fail", 0); http.end(); return;
  }

  mbedtls_md_context_t ctx; mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 0);
  mbedtls_md_starts(&ctx);

  WiFiClient* stream = http.getStreamPtr();
  uint8_t buff[1024];
  size_t written = 0; int lastPct = -10;
  unsigned long lastData = millis();
  while (http.connected() && written < (size_t)total) {
    mqttClient2.update();                      // jaga MQTT agar tak putus saat unduh
    size_t size = stream->available();
    if (size) {
      int c = stream->readBytes(buff, size > sizeof(buff) ? sizeof(buff) : size);
      if (c <= 0) break;
      if (Update.write(buff, c) != (size_t)c) { Update.abort(); mbedtls_md_free(&ctx); publishOtaStatus("fail", (int)(written * 100 / total)); http.end(); return; }
      mbedtls_md_update(&ctx, buff, c);
      written += c; lastData = millis();
      int pct = (int)(written * 100 / total);
      if (pct >= lastPct + 5) { lastPct = pct; Serial.printf("[OTA] %d%%\n", pct); publishOtaStatus("downloading", pct); }
    } else {
      if (millis() - lastData > 20000) { Update.abort(); mbedtls_md_free(&ctx); publishOtaStatus("fail", (int)(written * 100 / total)); http.end(); return; }
      delay(3);
    }
  }
  http.end();

  if (written != (size_t)total) { Update.abort(); mbedtls_md_free(&ctx); publishOtaStatus("fail", 0); return; }

  uint8_t hash[32]; mbedtls_md_finish(&ctx, hash); mbedtls_md_free(&ctx);
  String got = otaHashHex(hash);
  if (expectedSha256.length() == 64 && got != expectedSha256) {
    Update.abort();
    Serial.printf("[OTA] sha256 MISMATCH got=%s want=%s\n", got.c_str(), expectedSha256.c_str());
    publishOtaStatus("fail", 100); return;
  }
  if (!Update.end(true)) { Serial.printf("[OTA] Update.end: %s\n", Update.errorString()); publishOtaStatus("fail", 100); return; }

  Serial.println("[OTA] Sukses! Reboot ke firmware baru...");
  publishOtaStatus("success", 100);
  delay(900);
  ESP.restart();
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