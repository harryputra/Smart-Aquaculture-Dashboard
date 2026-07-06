// === DEFINISI PIN INPUT POTENSIOMETER ===
#define S1_PIN     A2  // Simulator Sensor pH
#define S2_PIN     A3  // Simulator Sensor Turbidity (Kekeruhan)
#define S3_PIN     A4  // Simulator Sensor Oksigen Terlarut (DO)
#define Ultra_PIN  A5  // Simulator Sensor Ultrasonik (Level Air)

// === VARIABEL MAPPING RANGE FISIK (MINIMUN & MAKSIMUM) ===
// 1. Sensor pH (Range umum: 0.0 - 14.0 pH)
const float PH_MIN = 0.0;
const float PH_MAX = 14.0;

// 2. Sensor Turbidity (Range simulasi: 0.0 - 100.0 NTU / %)
const float TURBIDITY_MIN = 0.0;
const float TURBIDITY_MAX = 100.0;

// 3. Sensor Oksigen / DO (Range umum: 0.0 - 20.0 mg/L)
const float OXYGEN_MIN = 0.0;
const float OXYGEN_MAX = 20.0;

// 4. Sensor Ultrasonik / Level Air (Range simulasi: 0.0 - 100.0 cm)
const float LEVEL_MIN = 0.0;
const float LEVEL_MAX = 100.0;


void setup() {
  Serial.begin(9600);
  Serial.println("=== PROGRAM TEST & MAPPING POTENSIOMETER ===");
  Serial.println("Putar potensio untuk melihat perubahan nilai fisik...\n");
}


void loop() {
  // 1. Baca nilai mentah ADC dari potensio (0 - 1023)
  int rawPH        = analogRead(S1_PIN);
  int rawTurbidity = analogRead(S2_PIN);
  int rawOxygen    = analogRead(S3_PIN);
  int rawLevel     = analogRead(Ultra_PIN);

  // 2. Konversi (Mapping) nilai ADC ke nilai fisik (Float)
  float nilaiPH        = mapFloat(rawPH, 0, 1023, PH_MIN, PH_MAX);
  float nilaiTurbidity = mapFloat(rawTurbidity, 0, 1023, TURBIDITY_MIN, TURBIDITY_MAX);
  float nilaiOxygen    = mapFloat(rawOxygen, 0, 1023, OXYGEN_MIN, OXYGEN_MAX);
  float nilaiLevel     = mapFloat(rawLevel, 0, 1023, LEVEL_MIN, LEVEL_MAX);

  // 3. Tampilkan hasil ke Serial Monitor 
  Serial.print("pH: "); 
  Serial.print(nilaiPH, 2);          // Print dengan 2 angka di belakang koma
  Serial.print(" | Turbidity: "); 
  Serial.print(nilaiTurbidity, 1);   // Print dengan 1 angka di belakang koma
  Serial.print(" | Oksigen: "); 
  Serial.print(nilaiOxygen, 2);
  Serial.print(" | Level Air: "); 
  Serial.print(nilaiLevel, 1);
  Serial.println(" cm");

  // Jeda 1 detik agar mudah 
  delay(2000);
}


// === FUNGSI KHUSUS MAPPING BILANGAN DESIMAL (FLOAT) ===
float mapFloat(long x, long in_min, long in_max, float out_min, float out_max) {
  return (float)(x - in_min) * (out_max - out_min) / (float)(in_max - in_min) + out_min;
}