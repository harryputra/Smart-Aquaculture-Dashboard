#include <OneWire.h>
#include <DallasTemperature.h>

// Data wire terhubung ke GPIO 17
const int oneWireBus = 17;          

// Setup oneWire instance untuk berkomunikasi dengan perangkat OneWire apa pun
OneWire oneWire(oneWireBus);

// referensi oneWire ke sensor Dallas Temperature
DallasTemperature sensors(&oneWire);

void setup() {
  Serial.begin(115200);
  
  
  sensors.begin();
  Serial.println("Pencarian Sensor DS18B20...");
}

void loop() {
  // Perintah untuk mengambil suhu
  sensors.requestTemperatures(); 
  
  // Membaca suhu dalam Celcius (index 0 karena hanya pakai 1 sensor)
  float temperatureC = sensors.getTempCByIndex(0);

  // Cek apakah pembacaan berhasil
  if(temperatureC != DEVICE_DISCONNECTED_C) {
    Serial.print("Suhu: ");
    Serial.print(temperatureC);
    Serial.println(" °C");
  } else {
    Serial.println("Error: Sensor tidak terdeteksi!");
  }

  delay(100); // Update setiap 0.1 detik
}