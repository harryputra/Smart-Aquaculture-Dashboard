#include "Parameter.h"

// === VARIABEL MODE ===
bool modeOtomatis     = false;
bool modeOtomatisLama = false;

// === VARIABEL VALVE & DETEKSI PERUBAHAN ===
bool valveKurasState     = false;
bool valveKurasStateLama = false;
bool valveIsiState       = false;
bool valveIsiStateLama   = false;

// === VARIABEL TOMBOL ===
bool buttonKurasState = false;
bool buttonIsiState   = false;

// === VARIABEL PEMBACAAN SENSOR (HASIL MAPPING POTENSIO) ===
float sensorPH         = 7.0;
float sensorTurbidity  = 5.0;
float sensorOxygen     = 8.0;
float sensorWaterLevel = 50.0;

// === VARIABEL LANGKAH OTOMATIS ===
int langkahOtomatis = LANGKAH_CEK_KUALITAS;

void setup() {
  Serial.begin(9600);

  // Input tombol pull-up
  pinMode(PIN_BUTTON_KURAS, INPUT_PULLUP);
  pinMode(PIN_BUTTON_ISI,   INPUT_PULLUP);

  // Output aktuator valve
  pinMode(PIN_VALVE_KURAS, OUTPUT);
  pinMode(PIN_VALVE_ISI,   OUTPUT);

  // Set Relay Active-LOW ke kondisi MATI di awal (HIGH = OFF)
  digitalWrite(PIN_VALVE_KURAS, HIGH);
  digitalWrite(PIN_VALVE_ISI,   HIGH);

  Serial.println("Sistem Siap! Mode Default: MANUAL");
  Serial.println("Mode Default: MANUAL");
  Serial.println("Ketik 'A' -> AUTOMATIC | 'M' -> MANUAL");
}

void loop() {
  // 1. Baca perintah Serial Monitor
  if (Serial.available() > 0) {
    char perintah = Serial.read();
    if (perintah == 'A' || perintah == 'a') {
      modeOtomatis = true;
    } else if (perintah == 'M' || perintah == 'm') {
      modeOtomatis = false;
    }
  }

  // 2. Deteksi transisi pindah mode
  if (modeOtomatis != modeOtomatisLama) {
    valveKurasState = false;
    valveIsiState   = false;
    digitalWrite(PIN_VALVE_KURAS, HIGH); // Relay Active-LOW mati
    digitalWrite(PIN_VALVE_ISI,   HIGH);
    
    if (modeOtomatis == true) {
      langkahOtomatis = LANGKAH_CEK_KUALITAS;
      Serial.println("\n>> Pindah ke mode: AUTOMATIC");
    } else {
      Serial.println("\n>> Pindah ke mode: MANUAL");
    }
    modeOtomatisLama = modeOtomatis;
  }

  // 3. Jalankan mode yang aktif
  if (modeOtomatis == false) {
    runManualMode();      
  } else {
    runAutomaticMode();   
  }

  // 4. Print status ke Serial Monitor HANYA jika relay berubah
  if (valveKurasState != valveKurasStateLama || valveIsiState != valveIsiStateLama) {
    Serial.print("[VALVE] Kuras: ");
    Serial.print(valveKurasState ? "OPEN (ON) " : "CLOSE (OFF)");
    Serial.print(" | Isi: ");
    Serial.println(valveIsiState ? "OPEN (ON)" : "CLOSE (OFF)");
    
    valveKurasStateLama = valveKurasState;
    valveIsiStateLama   = valveIsiState;
  }
}