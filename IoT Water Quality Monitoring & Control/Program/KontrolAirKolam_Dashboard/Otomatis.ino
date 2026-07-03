#include "Parameter.h"
// ======================================================================
// Mode OTOMATIS — state machine kuras→isi berdasarkan kualitas air.
// (Logika asli mahasiswa, disesuaikan: ADC 12-bit + sensor suhu +
//  ambang berupa RENTANG ideal.)
// ======================================================================

void runAutomaticMode() {
  if (langkahOtomatis == LANGKAH_CEK_KUALITAS) {
    if (kualitasAirBuruk()) {
      valveKurasState = true;
      valveIsiState   = false;
      langkahOtomatis = LANGKAH_KURAS;
      Serial.println("[AUTO] Kualitas air di luar batas → mulai KURAS");
    }
  }
  else if (langkahOtomatis == LANGKAH_KURAS) {
    digitalWrite(PIN_VALVE_KURAS, LOW);    // ON
    digitalWrite(PIN_VALVE_ISI,   HIGH);   // OFF
    if (sensorWaterLevel <= levelDrainTarget) {
      valveKurasState = false;
      valveIsiState   = true;
      langkahOtomatis = LANGKAH_ISI;
      Serial.println("[AUTO] Level minimum tercapai → mulai ISI");
    }
  }
  else if (langkahOtomatis == LANGKAH_ISI) {
    digitalWrite(PIN_VALVE_KURAS, HIGH);   // OFF
    digitalWrite(PIN_VALVE_ISI,   LOW);    // ON
    if (sensorWaterLevel >= levelFillTarget) {
      valveKurasState = false;
      valveIsiState   = false;
      langkahOtomatis = LANGKAH_SELESAI;
      Serial.println("[AUTO] Level maksimum tercapai → SELESAI");
    }
  }
  else if (langkahOtomatis == LANGKAH_SELESAI) {
    digitalWrite(PIN_VALVE_KURAS, HIGH);
    digitalWrite(PIN_VALVE_ISI,   HIGH);
    langkahOtomatis = LANGKAH_CEK_KUALITAS;
  }
}

// Baca 5 potensio → nilai fisik. Dipanggil di loop (kedua mode).
void bacaSemuaSensor() {
  sensorPH         = mapFloat(analogRead(PIN_SENS_PH),        0, ADC_MAX, PH_MIN,        PH_MAX);
  sensorTurbidity  = mapFloat(analogRead(PIN_SENS_TURBIDITY), 0, ADC_MAX, TURBIDITY_MIN, TURBIDITY_MAX);
  sensorOxygen     = mapFloat(analogRead(PIN_SENS_OXYGEN),    0, ADC_MAX, OXYGEN_MIN,    OXYGEN_MAX);
  sensorTemp       = mapFloat(analogRead(PIN_SENS_TEMP),      0, ADC_MAX, TEMP_MIN,      TEMP_MAX);
  sensorWaterLevel = mapFloat(analogRead(PIN_SENS_LEVEL),     0, ADC_MAX, LEVEL_MIN,     LEVEL_MAX);
}

// Air BURUK bila salah satu parameter keluar dari rentang ideal budidaya lele.
bool kualitasAirBuruk() {
  if (sensorPH < PH_IDEAL_MIN || sensorPH > PH_IDEAL_MAX)          return true;
  if (sensorTurbidity >= TURBIDITY_MAX_OK)                         return true;
  if (sensorOxygen <= OXYGEN_MIN_OK)                              return true;
  if (sensorTemp < TEMP_IDEAL_MIN || sensorTemp > TEMP_IDEAL_MAX)  return true;
  return false;
}

// Interpolasi float (map() versi desimal).
float mapFloat(long x, long in_min, long in_max, float out_min, float out_max) {
  return (float)(x - in_min) * (out_max - out_min) / (float)(in_max - in_min) + out_min;
}

// ======================================================================
// AERATOR — kendali oksigen (DO). Berjalan di device (aman walau internet
// putus). Mode: 0=off, 1=auto (histeresis DO), 2=manual.
// ======================================================================
void updateAerator() {
  if (aeratorMode == 0) {
    aeratorOn = false;
  } else if (aeratorMode == 2) {
    aeratorOn = aeratorManualOn;
  } else {
    // AUTO histeresis: nyala bila DO ≤ do_on, mati bila DO ≥ do_off,
    // di antara keduanya → pertahankan status (cegah relay klik-klik).
    if (sensorOxygen <= aeratorDoOn)      aeratorOn = true;
    else if (sensorOxygen >= aeratorDoOff) aeratorOn = false;
  }
  digitalWrite(PIN_AERATOR, aeratorOn ? LOW : HIGH);   // relay Active-LOW
}
