#include "Parameter.h"
// ======================================================================
// Mode MANUAL — dua sumber kendali:
//   1) Tombol lokal (jog, aktif selama ditekan)  → prioritas saat ditekan
//   2) Perintah dari DASHBOARD (latch: desiredKuras/desiredIsi) → saat tak ada
//      tombol ditekan. Diisi oleh perintah MQTT open_valve/close_valve/…
// ======================================================================

void runManualMode() {
  bool kurasBtn = (digitalRead(PIN_BUTTON_KURAS) == LOW);  // INPUT_PULLUP: LOW = ditekan
  bool isiBtn   = (digitalRead(PIN_BUTTON_ISI)   == LOW);

  if (kurasBtn || isiBtn) {
    // Tombol lokal memegang kendali selama ditekan (kedua ditekan = stop)
    valveKurasState = kurasBtn && !isiBtn;
    valveIsiState   = isiBtn   && !kurasBtn;
  } else {
    // Tidak ada tombol → ikuti perintah remote (dari dashboard)
    valveKurasState = desiredKuras;
    valveIsiState   = desiredIsi;
  }

  digitalWrite(PIN_VALVE_KURAS, valveKurasState ? LOW : HIGH);  // relay Active-LOW
  digitalWrite(PIN_VALVE_ISI,   valveIsiState   ? LOW : HIGH);
}
