#include "Parameter.h"

void runManualMode() {
  // 1. Baca kondisi tombol (Karena INPUT_PULLUP: LOW = Ditekan, HIGH = Dilepas)
  buttonKurasState = digitalRead(PIN_BUTTON_KURAS);
  buttonIsiState   = digitalRead(PIN_BUTTON_ISI);

  // 2. Tentukan status valve
  // Jika tombol KURAS ditekan
  if (buttonKurasState == LOW && buttonIsiState == HIGH) {
    valveKurasState = true;
    valveIsiState   = false;  
  }
  // Jika tombol ISI ditekan
  else if (buttonKurasState == HIGH && buttonIsiState == LOW) {
    valveKurasState = false;
    valveIsiState   = true;    
  }
  // Jika kedua tombol dilepas / ditekan bersamaan
  else {
    valveKurasState = false;
    valveIsiState   = false;
  }
  
  if (valveKurasState == true) {
    digitalWrite(PIN_VALVE_KURAS, LOW);   // Nyalakan relay kuras
  } else {
    digitalWrite(PIN_VALVE_KURAS, HIGH);  // Matikan relay kuras
  }

  if (valveIsiState == true) {
    digitalWrite(PIN_VALVE_ISI, LOW);     // Nyalakan relay isi
  } else {
    digitalWrite(PIN_VALVE_ISI, HIGH);    // Matikan relay isi
  }
}