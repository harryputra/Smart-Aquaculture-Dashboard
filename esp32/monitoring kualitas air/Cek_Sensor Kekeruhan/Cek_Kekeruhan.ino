#include <Arduino.h>

const int pin_kejernihan = 1; 

// Nilai mentah ADC saat dicelup ke air paling jernih (Target: 100%)
const int ADC_AIR_JERNIH = 3038; 

// Nilai mentah ADC saat dicelup ke air paling keruh/pekat (Target: 0%)
const int ADC_AIR_KERUH = 765;  
// ====================================================================

float konversi_kejernihan(int sensorValue) {
  // Memetakan nilai dari rentang ADC kalibrasi ke rentang 0% - 100%
  // nilai KERUH (rendah) -> 0%, nilai JERNIH (tinggi) -> 100%
  float kejernihan = map(sensorValue, ADC_AIR_KERUH, ADC_AIR_JERNIH, 0, 100); 
  
  // Memastikan nilai persentase tidak tembus di bawah 0% atau di atas 100%
  if (kejernihan < 0) kejernihan = 0;
  if (kejernihan > 100) kejernihan = 100;
  
  return kejernihan;
}

void setup() {
  Serial.begin(9600);
  analogReadResolution(12);
  pinMode(pin_kejernihan, INPUT);
  
  Serial.println("=== SISTEM MONITORING KEJERNIHAN AIR (TERKALIBRASI) ===");
  delay(1000);
}

void loop() {
  int value_kejernihan = analogRead(pin_kejernihan);
  float kejernihan = konversi_kejernihan(value_kejernihan);
  
  Serial.print("Nilai Mentah ADC: ");
  Serial.print(value_kejernihan);
  Serial.print(" | Kejernihan: ");
  Serial.print(kejernihan);
  Serial.println(" %");
  
  delay(1000); 
}