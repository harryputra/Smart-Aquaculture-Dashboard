// pin GPIO untuk Relay 
#define RELAY_KURAS 11  // Relay 1 (Solenoid AC220V)
#define RELAY_ISI   12  // Relay 2 (Solenoid DC24V)

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_KURAS, OUTPUT);
  pinMode(RELAY_ISI, OUTPUT);

  // Set kondisi awal relay menjadi MATI (Active-Low, HIGH = Mati)
  digitalWrite(RELAY_KURAS, HIGH);
  digitalWrite(RELAY_ISI, HIGH);

  delay(1000);
  
  Serial.println("\n=== PENGUJIAN RELAY ESP32-S3 ===");
  Serial.println("Ketik '1' untuk ON/OFF Relay Kuras (AC)");
  Serial.println("Ketik '2' untuk ON/OFF Relay Isi (DC)");
  Serial.println("================================\n");
}

void loop() {
  if (Serial.available() > 0) {
    // Baca karakter yang masuk
    char input = Serial.read();

    if (input == '\n' || input == '\r') {
      return; 
    }

    if (input == '1') {
      bool state = digitalRead(RELAY_KURAS);
      digitalWrite(RELAY_KURAS, !state);
      
      Serial.print("Relay Kuras (AC) sekarang: ");
      Serial.println(!state == LOW ? "MENYALA [ON]" : "MATI [OFF]");
    }
    
    else if (input == '2') {
      bool state = digitalRead(RELAY_ISI);
      digitalWrite(RELAY_ISI, !state);
      
      Serial.print("Relay Isi (DC) sekarang: ");
      Serial.println(!state == LOW ? "MENYALA [ON]" : "MATI [OFF]");
    }
    
    else {
      Serial.println("Input tidak valid! Ketik '1' atau '2'.");
    }
  }
}