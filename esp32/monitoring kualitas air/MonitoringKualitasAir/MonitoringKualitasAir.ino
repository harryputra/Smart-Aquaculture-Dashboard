// ======================================================================
// MonitoringKualitasAir.ino  (ESP32-S3)
// Gabungan 5 sketch uji menjadi SATU program utuh untuk 1 ESP32.
// Sensor: Suhu (DS18B20), pH, Kekeruhan, 2x Ultrasonik (ketinggian AIR &
// ketinggian PAKAN), + LED RGB status + 2 relay (Kuras/Isi).
//
// CATATAN: ESP32 ini KHUSUS monitoring kualitas air — TERPISAH dari ESP32
// sistem pemberi pakan.
//
// Library (Arduino IDE → Library Manager):
//   - OneWire (by Paul Stoffregen)
//   - DallasTemperature (by Miles Burton)
// Board: ESP32S3 Dev Module.  Serial: 115200.
// ======================================================================
#include <OneWire.h>
#include <DallasTemperature.h>

// ---------------------------- PIN --------------------------------------
#define PIN_SUHU_DS18B20   17     // DS18B20 (OneWire, digital)
#define PIN_PH             2      // pH  (analog, ADC1)
#define PIN_KEKERUHAN      1      // kekeruhan (analog, ADC1)
#define TRIG_AIR           6      // ultrasonik ketinggian AIR
#define ECHO_AIR           7
#define TRIG_PAKAN         15     // ultrasonik ketinggian PAKAN
#define ECHO_PAKAN         16
#define RELAY_KURAS        11     // relay kuras / outlet (Active-LOW)
#define RELAY_ISI          12     // relay isi   / inlet  (Active-LOW)

// ------------------------- KALIBRASI -----------------------------------
// pH (dari sketch uji Anda): pH = -5.70 * volt + ph_calibration_value
float ph_kalibrasi          = -0.5;
float ph_calibration_value  = 21.34 + ph_kalibrasi;   // = 20.84

// Kekeruhan → % kejernihan (ADC saat air jernih & keruh)
const int ADC_AIR_JERNIH = 3038;   // → 100 %
const int ADC_AIR_KERUH  = 765;    // →   0 %

// Konversi jarak ultrasonik → tinggi (opsional). Tinggi = TINGGI_WADAH - jarak.
// SESUAIKAN dengan tinggi tabung/wadah nyata (cm).
const float TINGGI_TABUNG_AIR_CM  = 100.0;
const float TINGGI_WADAH_PAKAN_CM = 30.0;

// --------------------------- OBJEK -------------------------------------
OneWire oneWire(PIN_SUHU_DS18B20);
DallasTemperature suhuSensor(&oneWire);

// --------------------------- DATA --------------------------------------
float suhuC = 0, phVal = 0, kejernihanPct = 0;
float jarakAir = -1, jarakPakan = -1, levelAir = -1, levelPakan = -1;
unsigned long lastPrint = 0;

// ======================================================================
void setup() {
  Serial.begin(115200);
  analogReadResolution(12);          // ESP32 ADC 12-bit (0..4095)
  suhuSensor.begin();

  pinMode(TRIG_AIR, OUTPUT);   pinMode(ECHO_AIR, INPUT);   digitalWrite(TRIG_AIR, LOW);
  pinMode(TRIG_PAKAN, OUTPUT); pinMode(ECHO_PAKAN, INPUT); digitalWrite(TRIG_PAKAN, LOW);

  pinMode(RELAY_KURAS, OUTPUT); pinMode(RELAY_ISI, OUTPUT);
  digitalWrite(RELAY_KURAS, HIGH);   // Active-LOW → OFF
  digitalWrite(RELAY_ISI,   HIGH);

#ifdef RGB_BUILTIN
  // Tes LED saat boot: Merah → Hijau → Biru → Mati
  neopixelWrite(RGB_BUILTIN, 50, 0, 0); delay(250);
  neopixelWrite(RGB_BUILTIN, 0, 50, 0); delay(250);
  neopixelWrite(RGB_BUILTIN, 0, 0, 50); delay(250);
  neopixelWrite(RGB_BUILTIN, 0, 0, 0);
#endif

  Serial.println("\n=== MONITORING KUALITAS AIR (ESP32-S3) ===");
  Serial.println("Serial: '1' = toggle Relay Kuras | '2' = toggle Relay Isi");
}

// ---------------------- FUNGSI SENSOR ----------------------------------
// Jarak ultrasonik (cm); -1 bila timeout / di luar jangkauan.
float bacaJarak(int trig, int echo) {
  digitalWrite(trig, LOW);  delayMicroseconds(2);
  digitalWrite(trig, HIGH); delayMicroseconds(10);
  digitalWrite(trig, LOW);
  long durasi = pulseIn(echo, HIGH, 30000);   // timeout 30 ms
  if (durasi == 0) return -1.0;
  return (durasi * 0.0343) / 2.0;
}

// pH: 10 sampel → buang ekstrem → rata-rata → volt → pH (kalibrasi Anda).
float bacaPH() {
  int buf[10], t;
  for (int i = 0; i < 10; i++) { buf[i] = analogRead(PIN_PH); delay(10); }
  for (int i = 0; i < 9; i++)
    for (int j = i + 1; j < 10; j++)
      if (buf[i] > buf[j]) { t = buf[i]; buf[i] = buf[j]; buf[j] = t; }
  long avg = 0;
  for (int i = 2; i < 8; i++) avg += buf[i];
  float volt = (float)avg * 3.3 / 4095.0 / 6.0;
  return -5.70 * volt + ph_calibration_value;
}

// Kekeruhan → % kejernihan (0 = keruh, 100 = jernih).
float bacaKejernihan() {
  int v = analogRead(PIN_KEKERUHAN);
  float k = map(v, ADC_AIR_KERUH, ADC_AIR_JERNIH, 0, 100);
  if (k < 0) k = 0;
  if (k > 100) k = 100;
  return k;
}

// LED RGB indikator dari ketinggian air (jarak sensor → permukaan air).
void statusRGB() {
#ifdef RGB_BUILTIN
  if (jarakAir < 0)        neopixelWrite(RGB_BUILTIN, 0, 0, 40);   // biru : error/RTO
  else if (jarakAir < 10)  neopixelWrite(RGB_BUILTIN, 60, 0, 0);   // merah: sangat dekat
  else if (jarakAir <= 30) neopixelWrite(RGB_BUILTIN, 50, 30, 0);  // kuning: waspada
  else                     neopixelWrite(RGB_BUILTIN, 0, 50, 0);   // hijau: aman
#endif
}

// Kontrol relay via Serial ('1' = Kuras, '2' = Isi).
void handleRelaySerial() {
  if (Serial.available() <= 0) return;
  char c = Serial.read();
  if (c == '1') {
    digitalWrite(RELAY_KURAS, !digitalRead(RELAY_KURAS));
    Serial.print("Relay Kuras: "); Serial.println(digitalRead(RELAY_KURAS) == LOW ? "ON" : "OFF");
  } else if (c == '2') {
    digitalWrite(RELAY_ISI, !digitalRead(RELAY_ISI));
    Serial.print("Relay Isi: "); Serial.println(digitalRead(RELAY_ISI) == LOW ? "ON" : "OFF");
  }
}

// ============================== LOOP ===================================
void loop() {
  handleRelaySerial();

  // --- baca semua sensor ---
  suhuSensor.requestTemperatures();
  suhuC = suhuSensor.getTempCByIndex(0);
  phVal = bacaPH();
  kejernihanPct = bacaKejernihan();
  jarakAir = bacaJarak(TRIG_AIR, ECHO_AIR);
  delay(30);                                   // cegah interferensi antar-ultrasonik
  jarakPakan = bacaJarak(TRIG_PAKAN, ECHO_PAKAN);

  levelAir   = (jarakAir   >= 0) ? max(0.0f, (float)TINGGI_TABUNG_AIR_CM  - jarakAir)   : -1;
  levelPakan = (jarakPakan >= 0) ? max(0.0f, (float)TINGGI_WADAH_PAKAN_CM - jarakPakan) : -1;

  statusRGB();

  // --- tampilkan tiap 1 detik ---
  if (millis() - lastPrint >= 1000) {
    lastPrint = millis();
    Serial.println("----------------------------------------");
    Serial.printf("Suhu       : %s C\n",  (suhuC == DEVICE_DISCONNECTED_C) ? "ERR" : String(suhuC, 2).c_str());
    Serial.printf("pH         : %.2f\n",  phVal);
    Serial.printf("Kejernihan : %.1f %%\n", kejernihanPct);
    Serial.printf("Air        : jarak %s cm  (level ~%s cm)\n",
                  (jarakAir < 0) ? "RTO" : String(jarakAir, 1).c_str(),
                  (levelAir < 0) ? "-"   : String(levelAir, 1).c_str());
    Serial.printf("Pakan      : jarak %s cm  (level ~%s cm)\n",
                  (jarakPakan < 0) ? "RTO" : String(jarakPakan, 1).c_str(),
                  (levelPakan < 0) ? "-"   : String(levelPakan, 1).c_str());
  }

  delay(100);
}
