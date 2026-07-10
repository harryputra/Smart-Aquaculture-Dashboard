// --- Alokasi Pin Sensor 1 ---
const int TRIG_1 = 6;
const int ECHO_1 = 7;

// --- Alokasi Pin Sensor 2 ---
const int TRIG_2 = 15;
const int ECHO_2 = 16;

// --- Alokasi Pin LED RGB Bawaan ESP32-S3 ---
const int RGB_PIN = RGB_BUILTIN; 

void setup() {
  Serial.begin(115200);
  
  // Setup pin sensor
  pinMode(TRIG_1, OUTPUT);
  pinMode(ECHO_1, INPUT);
  digitalWrite(TRIG_1, LOW);
  
  pinMode(TRIG_2, OUTPUT);
  pinMode(ECHO_2, INPUT);
  digitalWrite(TRIG_2, LOW);
  
  // Tes nyala LED saat booting (Merah -> Hijau -> Biru -> Mati)
  Serial.println("Memulai sistem & menguji LED RGB...");
  neopixelWrite(RGB_PIN, 50, 0, 0); delay(300); // Merah
  neopixelWrite(RGB_PIN, 0, 50, 0); delay(300); // Hijau
  neopixelWrite(RGB_PIN, 0, 0, 50); delay(300); // Biru
  neopixelWrite(RGB_PIN, 0, 0, 0);  delay(300); // Mati
}

// Fungsi untuk membaca jarak dari sensor (dalam cm)
float bacaJarak(int pinTrig, int pinEcho) {
  digitalWrite(pinTrig, LOW);
  delayMicroseconds(2);
  digitalWrite(pinTrig, HIGH);
  delayMicroseconds(10);
  digitalWrite(pinTrig, LOW);
  
  long durasi = pulseIn(pinEcho, HIGH, 30000); // Timeout 30ms
  if (durasi == 0) return -1.0;                // Return -1 jika eror/RTO
  
  return (durasi * 0.0343) / 2;
}

// Fungsi praktis untuk mengatur warna LED RGB (Nilai maksimal 255)
void aturWarnaLED(int merah, int hijau, int biru) {
  neopixelWrite(RGB_PIN, merah, hijau, biru);
}

void loop() {
  // Baca Sensor 1 & 2 secara bergantian
  float jarak1 = bacaJarak(TRIG_1, ECHO_1);
  delay(30); // Mencegah interferensi gelombang suara antar-sensor
  float jarak2 = bacaJarak(TRIG_2, ECHO_2);
  
  // Tentukan jarak terdekat dari kedua sensor untuk acuan LED
  float jarakTerdekat = 999.0;
  
  if (jarak1 > 0 && jarak2 > 0) {
    // Jika kedua sensor normal, ambil jarak yang paling dekat dengan objek
    jarakTerdekat = min(jarak1, jarak2);
  } else if (jarak1 > 0) {
    jarakTerdekat = jarak1;
  } else if (jarak2 > 0) {
    jarakTerdekat = jarak2;
  } else {
    jarakTerdekat = -1.0; // Kedua sensor eror atau di luar jangkauan
  }

  // Kontrol LED RGB berdasarkan jarak terdekat
  if (jarakTerdekat == -1.0) {
    aturWarnaLED(0, 0, 40); // BIRU (Eror / Di luar jangkauan)
  } else if (jarakTerdekat < 10.0) {
    aturWarnaLED(60, 0, 0); // MERAH (Bahaya / Sangat dekat < 10 cm)
  } else if (jarakTerdekat <= 30.0) {
    aturWarnaLED(50, 30, 0); // KUNING/ORANYE (Waspada 10 cm - 30 cm)
  } else {
    aturWarnaLED(0, 50, 0); // HIJAU (Aman > 30 cm)
  }
  
  // Tampilkan data ke Serial Monitor
  Serial.print("S1: ");
  if (jarak1 >= 0) Serial.print(jarak1, 1); else Serial.print("RTO");
  Serial.print(" cm | S2: ");
  if (jarak2 >= 0) Serial.print(jarak2, 1); else Serial.print("RTO");
  Serial.print(" cm | Status LED: ");
  
  if (jarakTerdekat == -1.0) Serial.println("[BIRU - Out of Range]");
  else if (jarakTerdekat < 10.0) Serial.println("[MERAH - STOP!]");
  else if (jarakTerdekat <= 30.0) Serial.println("[KUNING - Waspada]");
  else Serial.println("[HIJAU - Aman]");
  
  delay(150); // Jeda antar perulangan
}