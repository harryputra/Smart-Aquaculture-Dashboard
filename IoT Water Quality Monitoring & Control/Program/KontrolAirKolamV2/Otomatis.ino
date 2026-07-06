#include "Parameter.h"

unsigned long waktuPrintTerakhir = 0;   
const unsigned long intervalPrint = 1000; // Print data sensor tiap 1 detik

void runAutomaticMode() {
  // 1. Selalu baca nilai semua potensio (Sensor Kualitas & Sensor Level)
  bacaSemuaSensor();

  // 2. Tampilkan nilai pembacaan sensor ke Serial Monitor tiap 1 detik
  if (millis() - waktuPrintTerakhir >= intervalPrint) {
    waktuPrintTerakhir = millis();
    Serial.print("[AUTO-SENS] pH: "); Serial.print(sensorPH, 2);
    Serial.print(" | Turb: "); Serial.print(sensorTurbidity, 1);
    Serial.print(" | DO: "); Serial.print(sensorOxygen, 2);
    Serial.print(" | Level: "); Serial.print(sensorWaterLevel, 1);
    Serial.println(" cm");
  }

  // --- LOGIKA STATE MACHINE OTOMATIS ---
  if (langkahOtomatis == LANGKAH_CEK_KUALITAS) {
    if (kualitasAirBuruk() == true) {
      valveKurasState = true;
      valveIsiState   = false;
      langkahOtomatis = LANGKAH_KURAS;   
      Serial.println("\n[AUTO] Kualitas air melewati batas! -> Mulai KURAS");
    }
  }
  else if (langkahOtomatis == LANGKAH_KURAS) {
    // Aktifkan Relay Kuras (Active-LOW: LOW = ON, HIGH = OFF)
    digitalWrite(PIN_VALVE_KURAS, LOW);
    digitalWrite(PIN_VALVE_ISI,   HIGH);

    // Cek apakah potensio level air sudah diputar ke batas minimum kuras (<= 30 cm)
    if (sensorWaterLevel <= levelDrainTarget) {
      valveKurasState = false;
      valveIsiState   = true;
      langkahOtomatis = LANGKAH_ISI;
      Serial.println("\n[AUTO] Level air minimum tercapai -> Mulai ISI");
    }
  }
  else if (langkahOtomatis == LANGKAH_ISI) {
    // Aktifkan Relay Isi (Active-LOW: HIGH = OFF, LOW = ON)
    digitalWrite(PIN_VALVE_KURAS, HIGH);
    digitalWrite(PIN_VALVE_ISI,   LOW);

    // Cek apakah potensio level air sudah diputar ke batas maksimum isi (>= 80 cm)
    if (sensorWaterLevel >= levelFillTarget) {
      valveKurasState = false;
      valveIsiState   = false;
      langkahOtomatis = LANGKAH_SELESAI;
      Serial.println("\n[AUTO] Level air maksimum tercapai -> SELESAI");
    }
  }
  else if (langkahOtomatis == LANGKAH_SELESAI) {
    // Matikan kedua relay
    digitalWrite(PIN_VALVE_KURAS, HIGH);
    digitalWrite(PIN_VALVE_ISI,   HIGH);
    langkahOtomatis = LANGKAH_CEK_KUALITAS;
  }
}

// === FUNGSI BACA ADC & MAPPING KE VARIABEL FISIK ===
void bacaSemuaSensor() {
  int rawPH        = analogRead(PIN_SENS_PH);
  int rawTurbidity = analogRead(PIN_SENS_TURBIDITY);
  int rawOxygen    = analogRead(PIN_SENS_OXYGEN);
  int rawLevel     = analogRead(PIN_SENS_LEVEL);

  sensorPH         = mapFloat(rawPH, 0, 1023, PH_MIN, PH_MAX);
  sensorTurbidity  = mapFloat(rawTurbidity, 0, 1023, TURBIDITY_MIN, TURBIDITY_MAX);
  sensorOxygen     = mapFloat(rawOxygen, 0, 1023, OXYGEN_MIN, OXYGEN_MAX);
  sensorWaterLevel = mapFloat(rawLevel, 0, 1023, LEVEL_MIN, LEVEL_MAX);
}

// === FUNGSI CEK SETPOINT KUALITAS AIR ===
bool kualitasAirBuruk() {
  if (sensorPH >= setpointPH) return true;               // Jika pH >= 8.0
  if (sensorTurbidity >= setpointTurbidity) return true; // Jika Kekeruhan >= 50.0 NTU
  if (sensorOxygen <= setpointOxygen) return true;       // Jika Oksigen <= 3.0 mg/L
  return false;
}

// === FUNGSI RUMUS INTERPOLASI DESIMAL (FLOAT) ===
float mapFloat(long x, long in_min, long in_max, float out_min, float out_max) {
  return (float)(x - in_min) * (out_max - out_min) / (float)(in_max - in_min) + out_min;
}