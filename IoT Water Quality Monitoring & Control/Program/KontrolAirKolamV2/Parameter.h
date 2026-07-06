#ifndef PARAMETER_H
#define PARAMETER_H

// === DEFINISI PIN TOMBOL & VALVE ===
#define PIN_BUTTON_KURAS    3   
#define PIN_BUTTON_ISI      4   
#define PIN_VALVE_KURAS     5
#define PIN_VALVE_ISI       6

// === DEFINISI PIN SENSOR (SIMULASI POTENSIOMETER) ===
#define PIN_SENS_PH         A2  // Potensio 1
#define PIN_SENS_TURBIDITY  A3  // Potensio 2
#define PIN_SENS_OXYGEN     A4  // Potensio 3
#define PIN_SENS_LEVEL      A5  // Potensio 4 (Ultrasonik)

// === VARIABEL MAPPING RANGE FISIK ===
const float PH_MIN        = 0.0;
const float PH_MAX        = 14.0;
const float TURBIDITY_MIN = 0.0;
const float TURBIDITY_MAX = 100.0;
const float OXYGEN_MIN    = 0.0;
const float OXYGEN_MAX    = 20.0;
const float LEVEL_MIN     = 0.0;
const float LEVEL_MAX     = 100.0; // Dalam cm

// === DEFINISI LANGKAH OTOMATIS ===
#define LANGKAH_CEK_KUALITAS  1
#define LANGKAH_KURAS         2
#define LANGKAH_ISI           3
#define LANGKAH_SELESAI       4

// === SETPOINT KUALITAS AIR ===
const float setpointPH        = 8.0;   
const float setpointTurbidity = 50.0;  
const float setpointOxygen    = 3.0;   

// === TARGET LEVEL AIR ===
const float levelDrainTarget = 30.0;  
const float levelFillTarget  = 80.0;  

#endif