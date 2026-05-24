# 🔧 Troubleshooting V3.2 — Boot Loop / ESP32 Restart Berulang

Gejala: Serial Monitor print "=== PAKAN LELE V3.2 HYBRID ===" berulang-ulang
tiap beberapa detik. Berarti ESP32 boot → crash → reboot.

## ✅ Versi V3.2 yang sudah diupdate

Firmware sudah ditambah:
- ✅ Debug Serial.println di setiap step setup() — bisa trace mana yang crash
- ✅ MQTT buffer size 2048 (sebelumnya 1024) — handle payload status besar
- ✅ Safety guard di publishDeviceStatus() — tidak crash kalau MQTT belum ready
- ✅ MQTT keepalive 30 detik

## 🔍 Cara Diagnosa

### 1. Upload firmware baru
Buka Serial Monitor (baud **115200**), reset ESP32.

### 2. Lihat output Serial Monitor

Output yang DIHARAPKAN setelah boot sukses:
```
=== PAKAN LELE V3.2 HYBRID ===
[BOOT] Step 1: GPIO init...
[BOOT] Step 2: Servo init...
[BOOT] Step 3: I2C + LCD init...
[BOOT] Step 4: Load Preferences...
  fishCount=1000, feedingPerDay=2, sampleReady=0
[BOOT] Step 5: RTC init...
  RTC OK
[BOOT] Step 6: WiFi + MQTT init...
[MQTT] Connected & subscribed to lele/device/pakan_lele_01/command & ...
[BOOT] Step 7: HX711 init...
  Chamber=1, Sampling=1
[BOOT] Step 8: Tare all...
[BOOT] Step 9: Safety stop actuators...
[BOOT] Step 10: First publish status...
[BOOT] ✓ Setup complete, entering loop
```

Kalau crash di Step X tertentu → langsung tahu masalahnya:

| Crash di Step | Penyebab | Solusi |
|---------------|----------|--------|
| Step 1-2 | GPIO conflict atau Servo PWM channel bentrok | Cek pin tidak dipakai ganda |
| Step 3 | LCD I2C tidak terdeteksi (alamat salah) | Pakai I2C scanner, cek alamat (0x27 atau 0x3F) |
| Step 4 | Preferences corrupt | Erase NVS (lihat bawah) |
| Step 5 | RTC DS3231 wiring putus | Cek SDA=21, SCL=22, VCC, GND |
| Step 6 | Stuck di WiFi.begin (jarang) | Set timeout, atau matikan WiFi sementara |
| Step 7 | HX711 wiring salah | Cek pin DT/SCK, VCC ke 3V3 |
| Step 8 | HX711 tidak ready saat tare | Periksa kabel load cell |
| Step 10 | Publish status crash (buffer kecil) | Sudah dinaikkan ke 2048 |

### 3. Kalau Serial Monitor cuma print 2 kali "=== PAKAN LELE V3.2 HYBRID ==="
Itu berarti **crash di Step 1 atau sebelumnya**, kemungkinan:
- ESP32 power supply kurang (tegangan drop saat servo/stepper aktif)
- Atau ada library version mismatch

## 🛠️ Common Fixes

### Fix 1: Cek Library Arduino sudah ter-install
Arduino IDE → Tools → Manage Libraries, pastikan ada:

| Library | Version |
|---------|---------|
| **PubSubClient** by Nick O'Leary | 2.8.0+ |
| **ArduinoJson** by Benoit Blanchon | 6.21.0+ (jangan v7, syntax beda) |
| **LiquidCrystal_I2C** by Frank de Brabander | latest |
| **HX711** by Bogdan Necula | latest |
| **ESP32Servo** by Kevin Harrington | latest |
| **RTClib** by Adafruit | latest |
| Preferences (built-in ESP32 core) | - |

### Fix 2: Erase NVS Preferences
Kalau crash di Step 4 (load Preferences):

Arduino IDE → Tools → **Erase Flash** → "All Flash Contents"
Lalu upload firmware lagi.

**ATAU** pakai esptool dari command line:
```powershell
python -m esptool --chip esp32 --port COM14 erase_flash
```
(ganti COM14 dengan port Anda)

### Fix 3: Power Supply
Kalau pakai USB laptop saja, kadang tidak cukup untuk servo + stepper + spinner.
**Solusi:**
- Pakai power supply external 5V 3A+ untuk komponen motor
- ESP32 power dari USB saja
- Common ground antara ESP32 dan power motor

### Fix 4: Kalau WiFi/MQTT yang error
Ini paling sering. Set sementara **MQTT_ENABLE = false** dulu di firmware:

```cpp
const bool WIFI_ENABLE = true;
const bool MQTT_ENABLE = false;   // disable dulu
```

Upload, kalau LCD jalan normal artinya masalahnya di MQTT.
Lalu:
1. Pastikan SSID + password WiFi benar (case sensitive!)
2. Pastikan IP MQTT_SERVER benar (sesuai `ipconfig`)
3. Pastikan firewall Windows allow port 1883
4. Test MQTT broker dari command line:
   ```powershell
   docker exec aquaculture_mosquitto mosquitto_sub -h localhost -u aquaculture -P aquaculture123 -t "lele/#" -v
   ```

## 📝 Kirim hasil ke saya

Kalau masih crash, screenshot/copy **Serial Monitor LENGKAP** dari awal sampai crash. Saya bisa pinpoint masalahnya langsung dari log itu.
