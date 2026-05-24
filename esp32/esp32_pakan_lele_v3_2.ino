#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include "HX711.h"
#include <ESP32Servo.h>
#include <RTClib.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <math.h>

// =====================================================
// PAKAN LELE OTOMATIS - V3.2 HYBRID DUAL CONTROL
// =====================================================
// Turunan langsung dari V3.1 + tambahan:
// - MQTT bidirectional (dashboard <-> ESP32)
// - Web bisa kontrol: feed manual, tare, edit jadwal, dll
// - LCD navigation bisa dari web (virtual buttons)
// - Preferences tetap dipakai (data tidak hilang saat restart)
// - Semua menu LCD V3.1 tetap berfungsi normal
// =====================================================

// =====================================================
// WIFI + MQTT CONFIG
// IP laptop Anda (ipconfig): 192.168.100.91
// =====================================================
const bool WIFI_ENABLE = true;
const bool MQTT_ENABLE = true;  // set false kalau ingin pakai standalone seperti V3.1

// PENTING: ESP32 dan laptop harus konek ke SSID yang sama!
// Ganti ke SSID & password WiFi rumah Anda
const char* WIFI_SSID = "GANTI_SSID_ANDA";        // <-- WAJIB GANTI ke SSID WiFi rumah
const char* WIFI_PASSWORD = "GANTI_PASSWORD_WIFI"; // <-- WAJIB GANTI ke password WiFi

// IP laptop Anda dari ipconfig (Wi-Fi adapter)
const char* MQTT_SERVER = "192.168.100.91";
const uint16_t MQTT_PORT = 1883;
const char* MQTT_USER = "aquaculture";
const char* MQTT_PASSWORD = "aquaculture123";

const char* DEVICE_ID = "pakan_lele_01";

unsigned long lastWifiAttempt = 0;
unsigned long lastMqttAttempt = 0;
unsigned long lastStatusPublish = 0;
const unsigned long WIFI_RECONNECT_MS = 10000;
const unsigned long MQTT_RECONNECT_MS = 5000;
const unsigned long STATUS_PUBLISH_MS = 3000;

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

// MQTT topics
const char* TOPIC_STATUS          = "lele/device/status";
const char* TOPIC_BIOMASS_SAMPLE  = "lele/biomass/sample";
const char* TOPIC_BIOMASS_SUMMARY = "lele/biomass/summary";
const char* TOPIC_FEED_SESSION    = "lele/feed/session";
const char* TOPIC_FEED_BATCH      = "lele/feed/batch";
const char* TOPIC_FEED_SUMMARY    = "lele/feed/summary";
const char* TOPIC_ERROR           = "lele/device/error";
const char* TOPIC_ACK             = "lele/device/ack";

String topicCommand;
String topicConfig;

// =====================================================
// LCD I2C 16x2 + RTC DS3231
// =====================================================
#define SDA_PIN 21
#define SCL_PIN 22

LiquidCrystal_I2C lcd(0x27, 16, 2);
RTC_DS3231 rtc;
Preferences prefs;

bool rtcReady = false;
bool autoFeedEnabled = true;
bool feedingInProgress = false;

// =====================================================
// HX711 PIN
// =====================================================
#define HX_CHAMBER_DT    32
#define HX_CHAMBER_SCK   33
#define HX_SAMPLING_DT   25
#define HX_SAMPLING_SCK  26

HX711 scaleChamber;
HX711 scaleSampling;

// =====================================================
// PUSH BUTTON PIN
// =====================================================
#define BTN_UP     4
#define BTN_DOWN   16
#define BTN_OK     17
#define BTN_BACK   27

// =====================================================
// SERVO CHAMBER DOOR 180 DEGREE
// =====================================================
#define SERVO_PIN 13
Servo doorServo;

const int SERVO_CLOSE_ANGLE = 0;
const int SERVO_OPEN_ANGLE  = 45;
int servoCommandAngle = SERVO_CLOSE_ANGLE;

// =====================================================
// TB6600 STEPPER PIN
// =====================================================
#define STEPPER_PUL_PIN 18
#define STEPPER_DIR_PIN 19
#define STEPPER_ENA_PIN 5

#define STEPPER_PULSE_ACTIVE HIGH
#define STEPPER_PULSE_IDLE   LOW
#define STEPPER_DIR_CW  LOW
#define STEPPER_DIR_CCW HIGH
#define STEPPER_ENABLE_LEVEL  LOW
#define STEPPER_DISABLE_LEVEL HIGH
bool stepperEnabledState = false;

#define AUGER_FILL_DIR STEPPER_DIR_CW

const int STEPPER_PULSE_WIDTH_US = 800;
const int AUGER_FAST_DELAY_US = 1800;
const int AUGER_SLOW_DELAY_US = 5500;

// =====================================================
// BTS7960 SPINNER MOTOR DC
// =====================================================
#define BTS_RPWM 14
#define BTS_LPWM 23
int spinnerState = 0;

// =====================================================
// CALIBRATION FACTOR
// =====================================================
float chamberCalFactor  = 1000.0;
float samplingCalFactor = -1000.0;

// =====================================================
// PARAMETER SISTEM ADAPTIF
// =====================================================
int fishCount = 1000;
float feedingRatePercent = 0.0;
int feedingPerDay = 2;

const int DEFAULT_SAMPLE_COUNT = 10;
const int MIN_SAMPLE_COUNT = 3;
const int MAX_SAMPLE_COUNT = 30;
int targetSampleCount = DEFAULT_SAMPLE_COUNT;

float fishSamples[MAX_SAMPLE_COUNT];
int currentSampleIndex = 0;
int savedSampleCount = 0;
float sampleAverageGram = 0.0;
bool sampleReady = false;
bool waitingFishRemove = false;
unsigned long samplingZeroStartMs = 0;
const unsigned long SAMPLING_ZERO_STABLE_MS = 1200;

// =====================================================
// RANGE DAN FILTER
// =====================================================
const float MAX_CAPACITY_G = 1000.0;
const float FILTER_ALPHA = 0.25;

float chamberFiltered = 0.0;
float samplingFiltered = 0.0;

const float EMPTY_THRESHOLD_G = 5.0;
const float MIN_FISH_SAVE_G = 5.0;

// =====================================================
// FEEDING PARAMETER
// =====================================================
const float MAX_BATCH_GRAM = 100.0;
const float MIN_STABLE_BATCH_GRAM = 30.0;

const int MAX_BATCH_COUNT = 80;
float batchTargets[MAX_BATCH_COUNT];
int batchTargetCount = 0;

const float FEED_SLOW_ZONE_G = 10.0;
const float FEED_STOP_MARGIN_G = 2.0;

const unsigned long FEED_FILL_TIMEOUT_MS = 60000;
const unsigned long FEED_SETTLING_MS = 800;
const unsigned long SPINNER_PRESTART_MS = 800;
const unsigned long SPINNER_POSTCLOSE_MS = 500;
const unsigned long DISPENSE_TIMEOUT_MS = 20000;

// =====================================================
// JADWAL PAKAN
// =====================================================
const int SCHEDULE_COUNT = 6;
const int FEED_START_MINUTE_OF_DAY = 7 * 60;
const int FEED_END_MINUTE_OF_DAY   = 17 * 60;

int scheduleHour[SCHEDULE_COUNT] = {7, 17, 0, 0, 0, 0};
int scheduleMinute[SCHEDULE_COUNT] = {0, 0, 0, 0, 0, 0};
bool scheduleEnabled[SCHEDULE_COUNT] = {true, true, false, false, false, false};
bool scheduleTriggeredToday[SCHEDULE_COUNT] = {false, false, false, false, false, false};
int lastScheduleDay = -1;

// =====================================================
// HISTORY
// =====================================================
bool lastFeedSuccess = false;
float lastFeedTargetGram = 0.0;
float lastFeedActualGram = 0.0;
int lastFeedBatchCount = 0;
String lastFeedTime = "-";

float lastSampleAverageGram = 0.0;
int lastSampleCount = 0;
String lastSampleTime = "-";

String lastErrorCode = "NONE";
String lastErrorMsg = "Tidak ada error";
String lastErrorTime = "-";

// =====================================================
// V3.2: REMOTE COMMAND QUEUE
// =====================================================
enum RemoteCmd {
  CMD_NONE = 0,
  CMD_MANUAL_FEED_ADAPTIVE,
  CMD_MANUAL_FEED_GRAM,
  CMD_TARE_CHAMBER,
  CMD_TARE_SAMPLING,
  CMD_TARE_ALL,
  CMD_RESET_SAMPLES,
  CMD_START_SAMPLING,
  CMD_AUTO_GEN_SCHEDULE,
  CMD_BTN_UP,
  CMD_BTN_DOWN,
  CMD_BTN_OK,
  CMD_BTN_BACK,
  CMD_GOTO_SCREEN,
  CMD_OPEN_VALVE,
  CMD_CLOSE_VALVE
};

struct PendingCommand {
  RemoteCmd cmd;
  float floatArg;
  int intArg;
  String stringArg;
  unsigned long timestamp;
};

PendingCommand pendingCmd = { CMD_NONE, 0, 0, "", 0 };
bool virtualBtnPressed[4] = { false, false, false, false };

// =====================================================
// MENU STATE
// =====================================================
enum ScreenState {
  SCREEN_MAIN_MENU,
  SCREEN_STATUS,
  SCREEN_FEED_MENU,
  SCREEN_FEED_TARGET_INFO,
  SCREEN_BIOMASS_MENU,
  SCREEN_SAMPLE_ACTIVE,
  SCREEN_SAMPLE_SUMMARY,
  SCREEN_EDIT_SAMPLE_COUNT,
  SCREEN_DATA_KOLAM_MENU,
  SCREEN_EDIT_FISH_COUNT,
  SCREEN_EDIT_FEEDING_RATE,
  SCREEN_EDIT_FEEDING_PER_DAY,
  SCREEN_DATA_FEED_INFO,
  SCREEN_SCHEDULE_MENU,
  SCREEN_EDIT_SCHEDULE,
  SCREEN_TARE_MENU,
  SCREEN_HISTORY_MENU,
  SCREEN_SETTINGS_MENU,
  SCREEN_WIFI_STATUS,
  SCREEN_RTC_STATUS,
  SCREEN_DEVICE_INFO,
  SCREEN_ACTUATOR_STATUS
};

ScreenState currentScreen = SCREEN_MAIN_MENU;

const int MAIN_MENU_COUNT = 8;
String mainMenu[MAIN_MENU_COUNT] = {
  "Status Sistem", "Pakan Otomatis", "Timbang Biomassa", "Data Kolam",
  "Jadwal Pakan", "Kalibrasi/Tare", "Riwayat Akhir", "Pengaturan"
};

const int FEED_MENU_COUNT = 3;
String feedMenu[FEED_MENU_COUNT] = { "Auto Feed ON/OFF", "Mulai Feed Manual", "Lihat Target" };

const int BIOMASS_MENU_COUNT = 4;
String biomassMenu[BIOMASS_MENU_COUNT] = { "Mulai Sampling", "Lihat Rata2", "Set Jml Sample", "Reset Sampling" };

const int DATA_KOLAM_MENU_COUNT = 3;
String dataKolamMenu[DATA_KOLAM_MENU_COUNT] = { "Jumlah Ikan", "Frekuensi/Hari", "Feed Info" };

const int TARE_MENU_COUNT = 3;
String tareMenu[TARE_MENU_COUNT] = { "Tare Pakan", "Tare Biomassa", "Tare Semua" };

const int HISTORY_MENU_COUNT = 3;
String historyMenu[HISTORY_MENU_COUNT] = { "Feed Terakhir", "Sampling Akhir", "Error Terakhir" };

const int SETTINGS_MENU_COUNT = 3;
String settingsMenu[SETTINGS_MENU_COUNT] = { "WiFi Status", "RTC Status", "Device Info" };

int mainMenuIndex = 0;
int feedMenuIndex = 0;
int biomassMenuIndex = 0;
int dataKolamMenuIndex = 0;
int scheduleMenuIndex = 0;
int tareMenuIndex = 0;
int historyMenuIndex = 0;
int settingsMenuIndex = 0;
int statusPage = 0;
int dataFeedInfoPage = 0;
int actuatorStatusPage = 0;

int editingScheduleIndex = 0;
int editingScheduleStage = 0;

// =====================================================
// BUTTON DEBOUNCE
// =====================================================
struct Button {
  uint8_t pin;
  bool lastRaw;
  bool stable;
  unsigned long lastChange;
};

Button buttons[4] = {
  {BTN_UP, HIGH, HIGH, 0}, {BTN_DOWN, HIGH, HIGH, 0},
  {BTN_OK, HIGH, HIGH, 0}, {BTN_BACK, HIGH, HIGH, 0}
};

const unsigned long DEBOUNCE_MS = 40;

enum ButtonID { B_UP = 0, B_DOWN = 1, B_OK = 2, B_BACK = 3 };

unsigned long lastDisplayUpdate = 0;
const unsigned long DISPLAY_UPDATE_MS = 300;

// =====================================================
// FORWARD DECLARATION
// =====================================================
void maintainNetwork();
void saveSettings();
void saveSampleSummaryToPrefs();
void clearSamplePrefs();
float recommendedFeedingRatePercent(float averageFishGram);
float calculateBiomassKg();
float calculateDailyFeedGram();
float calculateFeedPerScheduleGram();
long secondsToNextSchedule();
String nextScheduleHHMM();
String timestampString();
bool runFeedingSession(float totalFeedGram, String sessionName);
void onMqttMessage(char* topic, byte* payload, unsigned int length);
void processPendingCommand();
void publishAck(String cmdName, bool success, String reason);
void publishDeviceStatus(bool force);
void publishBiomassSample(int fishNo, float weightGram);
void publishBiomassSummary();
void publishFeedSessionStart(String sid, String sname, float total, int batches);
void publishFeedBatch(String sid, int bn, int tb, float tg, float ag, bool ok);
void publishFeedSummary(String sid, String sname, float total, float actual, int batches, bool ok);
void publishError(String code, String msg);
void autoGenerateSchedulesFromFeedingPerDay();
void tareChamber();
void tareSampling();
void tareAll();
void resetSamples();
void servoOpen();
void servoClose();
void startSamplingSession();
String screenName();

// =====================================================
// LCD HELPER
// =====================================================
void lcdLine(byte row, String text) {
  if (text.length() > 16) text = text.substring(0, 16);
  while (text.length() < 16) text += " ";
  lcd.setCursor(0, row);
  lcd.print(text);
}

float clampWeight(float v) {
  if (v < 0.0) return 0.0;
  if (v > MAX_CAPACITY_G) return MAX_CAPACITY_G;
  return v;
}

String formatGram(float v) {
  int g = round(v);
  if (g < 0) g = 0;
  if (g > 9999) g = 9999;
  if (g < 10) return "000" + String(g);
  if (g < 100) return "00" + String(g);
  if (g < 1000) return "0" + String(g);
  return String(g);
}

String twoDigit(int v) {
  if (v < 10) return "0" + String(v);
  return String(v);
}

String hhmm(int h, int m) {
  return twoDigit(h) + ":" + twoDigit(m);
}

String timestampString() {
  if (!rtcReady) return String("millis_") + String(millis());
  DateTime now = rtc.now();
  char buf[25];
  snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02d",
    now.year(), now.month(), now.day(), now.hour(), now.minute(), now.second());
  return String(buf);
}

String screenName() {
  switch (currentScreen) {
    case SCREEN_MAIN_MENU: return "main_menu";
    case SCREEN_STATUS: return "status";
    case SCREEN_FEED_MENU: return "feed_menu";
    case SCREEN_FEED_TARGET_INFO: return "feed_target_info";
    case SCREEN_BIOMASS_MENU: return "biomass_menu";
    case SCREEN_SAMPLE_ACTIVE: return "sample_active";
    case SCREEN_SAMPLE_SUMMARY: return "sample_summary";
    case SCREEN_EDIT_SAMPLE_COUNT: return "edit_sample_count";
    case SCREEN_DATA_KOLAM_MENU: return "data_kolam_menu";
    case SCREEN_EDIT_FISH_COUNT: return "edit_fish_count";
    case SCREEN_EDIT_FEEDING_RATE: return "edit_feeding_rate";
    case SCREEN_EDIT_FEEDING_PER_DAY: return "edit_feeding_per_day";
    case SCREEN_DATA_FEED_INFO: return "data_feed_info";
    case SCREEN_SCHEDULE_MENU: return "schedule_menu";
    case SCREEN_EDIT_SCHEDULE: return "edit_schedule";
    case SCREEN_TARE_MENU: return "tare_menu";
    case SCREEN_HISTORY_MENU: return "history_menu";
    case SCREEN_SETTINGS_MENU: return "settings_menu";
    case SCREEN_WIFI_STATUS: return "wifi_status";
    case SCREEN_RTC_STATUS: return "rtc_status";
    case SCREEN_DEVICE_INFO: return "device_info";
    case SCREEN_ACTUATOR_STATUS: return "actuator_status";
  }
  return "unknown";
}

// =====================================================
// ERROR LOG
// =====================================================
void setError(String code, String message) {
  lastErrorCode = code;
  lastErrorMsg = message;
  lastErrorTime = timestampString();
  publishError(code, message);
}

// =====================================================
// PREFERENCES (sama dengan V3.1)
// =====================================================
void loadSettings() {
  prefs.begin("pakan", false);

  fishCount = prefs.getInt("fishCnt", 1000);
  feedingRatePercent = 0.0;
  feedingPerDay = prefs.getInt("feedDay", 2);

  targetSampleCount = prefs.getInt("sampleTarget", DEFAULT_SAMPLE_COUNT);
  if (targetSampleCount < MIN_SAMPLE_COUNT) targetSampleCount = MIN_SAMPLE_COUNT;
  if (targetSampleCount > MAX_SAMPLE_COUNT) targetSampleCount = MAX_SAMPLE_COUNT;

  autoFeedEnabled = prefs.getBool("autoFeed", true);

  for (int i = 0; i < SCHEDULE_COUNT; i++) {
    char keyH[8], keyM[8], keyE[8];
    snprintf(keyH, sizeof(keyH), "s%dh", i);
    snprintf(keyM, sizeof(keyM), "s%dm", i);
    snprintf(keyE, sizeof(keyE), "s%den", i);
    scheduleHour[i] = prefs.getInt(keyH, scheduleHour[i]);
    scheduleMinute[i] = prefs.getInt(keyM, scheduleMinute[i]);
    scheduleEnabled[i] = prefs.getBool(keyE, i < feedingPerDay);
  }

  for (int i = feedingPerDay; i < SCHEDULE_COUNT; i++) scheduleEnabled[i] = false;

  sampleAverageGram = prefs.getFloat("avgFish", 0.0);
  savedSampleCount = prefs.getInt("sampCnt", 0);
  sampleReady = (sampleAverageGram > 0.0 && savedSampleCount >= MIN_SAMPLE_COUNT);

  if (sampleReady) {
    feedingRatePercent = recommendedFeedingRatePercent(sampleAverageGram);
    lastSampleAverageGram = sampleAverageGram;
    lastSampleCount = savedSampleCount;
    lastSampleTime = prefs.getString("sampTime", "tersimpan");
  }
}

void saveSettings() {
  prefs.putInt("fishCnt", fishCount);
  prefs.putInt("feedDay", feedingPerDay);
  prefs.putInt("sampleTarget", targetSampleCount);
  prefs.putBool("autoFeed", autoFeedEnabled);

  for (int i = 0; i < SCHEDULE_COUNT; i++) {
    char keyH[8], keyM[8], keyE[8];
    snprintf(keyH, sizeof(keyH), "s%dh", i);
    snprintf(keyM, sizeof(keyM), "s%dm", i);
    snprintf(keyE, sizeof(keyE), "s%den", i);
    prefs.putInt(keyH, scheduleHour[i]);
    prefs.putInt(keyM, scheduleMinute[i]);
    prefs.putBool(keyE, scheduleEnabled[i]);
  }
}

void saveSampleSummaryToPrefs() {
  prefs.putFloat("avgFish", sampleAverageGram);
  prefs.putInt("sampCnt", savedSampleCount);
  prefs.putString("sampTime", timestampString());
}

void clearSamplePrefs() {
  prefs.remove("avgFish");
  prefs.remove("sampCnt");
  prefs.remove("sampTime");
}

// =====================================================
// WIFI + MQTT
// =====================================================
bool mqttReady() {
  return MQTT_ENABLE && WiFi.status() == WL_CONNECTED && mqttClient.connected();
}

bool mqttPublish(const char* topic, String payload) {
  if (!mqttReady()) return false;
  return mqttClient.publish(topic, payload.c_str(), false);
}

void setupWiFi() {
  if (!WIFI_ENABLE) return;

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  topicCommand = String("lele/device/") + DEVICE_ID + "/command";
  topicConfig  = String("lele/device/") + DEVICE_ID + "/config";

  if (MQTT_ENABLE) {
    mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
    mqttClient.setBufferSize(2048);   // V3.2: buffer besar untuk status payload + schedules array
    mqttClient.setCallback(onMqttMessage);
    mqttClient.setKeepAlive(30);
  }

  lcd.clear();
  lcdLine(0, "WiFi Connect");
  lcdLine(1, "Tunggu...");

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 8000) delay(250);

  lcd.clear();
  if (WiFi.status() == WL_CONNECTED) {
    lcdLine(0, "WiFi OK");
    lcdLine(1, WiFi.localIP().toString());
  } else {
    lcdLine(0, "WiFi OFFLINE");
    lcdLine(1, "Lokal tetap OK");
  }
  delay(1200);
  lcd.clear();
}

void reconnectMqttIfNeeded() {
  if (!MQTT_ENABLE) return;
  if (WiFi.status() != WL_CONNECTED) return;
  if (mqttClient.connected()) return;
  if (millis() - lastMqttAttempt < MQTT_RECONNECT_MS) return;

  lastMqttAttempt = millis();

  uint32_t chipLow = (uint32_t)(ESP.getEfuseMac() & 0xFFFFFFFF);
  String clientId = String(DEVICE_ID) + "_" + String(chipLow, HEX);

  bool connected;
  if (String(MQTT_USER).length() > 0) {
    connected = mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASSWORD);
  } else {
    connected = mqttClient.connect(clientId.c_str());
  }

  if (connected) {
    mqttClient.subscribe(topicCommand.c_str());
    mqttClient.subscribe(topicConfig.c_str());
    Serial.printf("[MQTT] Connected, subscribed to %s & %s\n", topicCommand.c_str(), topicConfig.c_str());
    publishDeviceStatus(true);
  }
}

void maintainNetwork() {
  if (!WIFI_ENABLE) return;

  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastWifiAttempt >= WIFI_RECONNECT_MS) {
      lastWifiAttempt = millis();
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
  }

  if (MQTT_ENABLE) {
    reconnectMqttIfNeeded();
    if (mqttClient.connected()) mqttClient.loop();
  }
}

// =====================================================
// MQTT CALLBACK
// =====================================================
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  String topicStr = String(topic);
  String message = "";
  for (unsigned int i = 0; i < length; i++) message += (char)payload[i];

  Serial.printf("[MQTT IN] %s: %s\n", topic, message.c_str());

  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, message)) {
    publishAck("unknown", false, "Invalid JSON");
    return;
  }

  if (topicStr == topicCommand) {
    const char* command = doc["command"] | "";

    if (strcmp(command, "manual_feed_adaptive") == 0) {
      if (feedingInProgress) { publishAck(command, false, "Sedang feeding"); return; }
      if (!sampleReady) { publishAck(command, false, "Sampling belum dilakukan"); return; }
      pendingCmd.cmd = CMD_MANUAL_FEED_ADAPTIVE;
      publishAck(command, true, "Queued");
    }
    else if (strcmp(command, "manual_feed_gram") == 0) {
      if (feedingInProgress) { publishAck(command, false, "Sedang feeding"); return; }
      float g = doc["target_g"] | 0.0;
      if (g < 10 || g > 5000) { publishAck(command, false, "Range 10-5000g"); return; }
      pendingCmd.cmd = CMD_MANUAL_FEED_GRAM;
      pendingCmd.floatArg = g;
      publishAck(command, true, "Queued");
    }
    else if (strcmp(command, "set_auto_feed") == 0) {
      bool enabled = doc["enabled"] | false;
      autoFeedEnabled = enabled;
      saveSettings();
      publishDeviceStatus(true);
      publishAck(command, true, enabled ? "Auto feed ON" : "Auto feed OFF");
    }
    else if (strcmp(command, "tare") == 0) {
      const char* st = doc["scale_type"] | "all";
      if (strcmp(st, "chamber") == 0) pendingCmd.cmd = CMD_TARE_CHAMBER;
      else if (strcmp(st, "sampling") == 0) pendingCmd.cmd = CMD_TARE_SAMPLING;
      else pendingCmd.cmd = CMD_TARE_ALL;
      publishAck(command, true, String("Tare ") + st);
    }
    else if (strcmp(command, "reset_samples") == 0) {
      pendingCmd.cmd = CMD_RESET_SAMPLES;
      publishAck(command, true, "Reset queued");
    }
    else if (strcmp(command, "start_sampling") == 0) {
      pendingCmd.cmd = CMD_START_SAMPLING;
      publishAck(command, true, "Sampling started");
    }
    else if (strcmp(command, "auto_gen_schedule") == 0) {
      pendingCmd.cmd = CMD_AUTO_GEN_SCHEDULE;
      publishAck(command, true, "Schedule auto-gen queued");
    }
    else if (strcmp(command, "open_valve") == 0) {
      pendingCmd.cmd = CMD_OPEN_VALVE;
      publishAck(command, true, "Servo open");
    }
    else if (strcmp(command, "close_valve") == 0) {
      pendingCmd.cmd = CMD_CLOSE_VALVE;
      publishAck(command, true, "Servo close");
    }
    else if (strcmp(command, "btn") == 0) {
      const char* btn = doc["button"] | "";
      if (strcmp(btn, "up") == 0) virtualBtnPressed[B_UP] = true;
      else if (strcmp(btn, "down") == 0) virtualBtnPressed[B_DOWN] = true;
      else if (strcmp(btn, "ok") == 0) virtualBtnPressed[B_OK] = true;
      else if (strcmp(btn, "back") == 0) virtualBtnPressed[B_BACK] = true;
      else { publishAck(command, false, "Unknown button"); return; }
      publishAck(command, true, String("Button ") + btn);
    }
    else {
      publishAck(command, false, "Unknown command");
    }
  }
  else if (topicStr == topicConfig) {
    bool changed = false;
    if (doc.containsKey("fish_count")) {
      fishCount = doc["fish_count"];
      changed = true;
    }
    if (doc.containsKey("feeding_per_day")) {
      feedingPerDay = doc["feeding_per_day"];
      if (feedingPerDay < 1) feedingPerDay = 1;
      if (feedingPerDay > SCHEDULE_COUNT) feedingPerDay = SCHEDULE_COUNT;
      autoGenerateSchedulesFromFeedingPerDay();
      changed = true;
    }
    if (doc.containsKey("target_sample_count")) {
      targetSampleCount = doc["target_sample_count"];
      if (targetSampleCount < MIN_SAMPLE_COUNT) targetSampleCount = MIN_SAMPLE_COUNT;
      if (targetSampleCount > MAX_SAMPLE_COUNT) targetSampleCount = MAX_SAMPLE_COUNT;
      changed = true;
    }
    // Edit jadwal individual
    if (doc.containsKey("schedule_index")) {
      int idx = doc["schedule_index"];
      if (idx >= 0 && idx < SCHEDULE_COUNT) {
        if (doc.containsKey("hour")) scheduleHour[idx] = doc["hour"];
        if (doc.containsKey("minute")) scheduleMinute[idx] = doc["minute"];
        if (doc.containsKey("enabled")) scheduleEnabled[idx] = doc["enabled"];
        scheduleTriggeredToday[idx] = false;
        changed = true;
      }
    }
    if (changed) {
      saveSettings();
      publishDeviceStatus(true);
      publishAck("config_update", true, "Config applied");
    }
  }
}

void publishAck(String cmdName, bool success, String reason) {
  String payload = "{\"device_id\":\"" + String(DEVICE_ID) + "\",\"timestamp\":\"" + timestampString() + "\",\"command\":\"" + cmdName + "\",\"success\":" + String(success ? "true" : "false") + ",\"reason\":\"" + reason + "\"}";
  mqttPublish(TOPIC_ACK, payload);
}

// =====================================================
// V3.2: PROCESS PENDING COMMAND
// =====================================================
void processPendingCommand() {
  if (pendingCmd.cmd == CMD_NONE) return;

  RemoteCmd cmd = pendingCmd.cmd;
  pendingCmd.cmd = CMD_NONE;

  Serial.printf("[CMD EXEC] %d\n", cmd);

  switch (cmd) {
    case CMD_MANUAL_FEED_ADAPTIVE: {
      float g = calculateFeedPerScheduleGram();
      if (g > 0) {
        lcd.clear(); lcdLine(0,"WEB: ADAPTIF"); lcdLine(1, String(g,0) + "g"); delay(1200);
        runFeedingSession(g, "WEB ADAPTIF");
        currentScreen = SCREEN_MAIN_MENU; lcd.clear();
      }
      break;
    }
    case CMD_MANUAL_FEED_GRAM:
      lcd.clear(); lcdLine(0,"WEB: CUSTOM"); lcdLine(1, String(pendingCmd.floatArg,0) + "g"); delay(1200);
      runFeedingSession(pendingCmd.floatArg, "WEB CUSTOM");
      currentScreen = SCREEN_MAIN_MENU; lcd.clear();
      break;
    case CMD_TARE_CHAMBER: tareChamber(); break;
    case CMD_TARE_SAMPLING: tareSampling(); break;
    case CMD_TARE_ALL: tareAll(); break;
    case CMD_RESET_SAMPLES:
      resetSamples();
      clearSamplePrefs();
      lcd.clear(); lcdLine(0,"WEB: RESET"); lcdLine(1,"Sample dihapus"); delay(1000); lcd.clear();
      break;
    case CMD_START_SAMPLING:
      startSamplingSession();
      break;
    case CMD_AUTO_GEN_SCHEDULE:
      autoGenerateSchedulesFromFeedingPerDay();
      saveSettings();
      lcd.clear(); lcdLine(0,"WEB: SCHEDULE"); lcdLine(1,"Auto-generated"); delay(1000); lcd.clear();
      break;
    case CMD_OPEN_VALVE:
      servoOpen();
      lcd.clear(); lcdLine(0,"WEB: VALVE"); lcdLine(1,"OPEN"); delay(1000); lcd.clear();
      break;
    case CMD_CLOSE_VALVE:
      servoClose();
      lcd.clear(); lcdLine(0,"WEB: VALVE"); lcdLine(1,"CLOSE"); delay(1000); lcd.clear();
      break;
    default: break;
  }
}

// =====================================================
// PUBLISH FUNCTIONS
// =====================================================
void publishDeviceStatus(bool forcePublish) {
  if (!forcePublish && millis() - lastStatusPublish < STATUS_PUBLISH_MS) return;
  lastStatusPublish = millis();

  // V3.2: skip kalau MQTT belum siap (cegah crash di setup)
  if (!MQTT_ENABLE) return;
  if (!mqttReady()) return;

  bool chReady = scaleChamber.is_ready();
  bool smReady = scaleSampling.is_ready();
  long secLeft = secondsToNextSchedule();

  // Build schedules array
  String schedulesJson = "[";
  for (int i = 0; i < SCHEDULE_COUNT; i++) {
    if (i > 0) schedulesJson += ",";
    schedulesJson += "{\"index\":" + String(i);
    schedulesJson += ",\"hour\":" + String(scheduleHour[i]);
    schedulesJson += ",\"minute\":" + String(scheduleMinute[i]);
    schedulesJson += ",\"enabled\":" + String(scheduleEnabled[i] ? "true" : "false");
    schedulesJson += "}";
  }
  schedulesJson += "]";

  String payload = "{";
  payload += "\"device_id\":\"" + String(DEVICE_ID) + "\",";
  payload += "\"timestamp\":\"" + timestampString() + "\",";
  payload += "\"wifi_connected\":" + String(WiFi.status() == WL_CONNECTED ? "true" : "false") + ",";
  payload += "\"mqtt_connected\":" + String(mqttReady() ? "true" : "false") + ",";
  payload += "\"rtc_ok\":" + String(rtcReady ? "true" : "false") + ",";
  payload += "\"auto_feed_enabled\":" + String(autoFeedEnabled ? "true" : "false") + ",";
  payload += "\"feeding_in_progress\":" + String(feedingInProgress ? "true" : "false") + ",";
  payload += "\"screen\":\"" + screenName() + "\",";
  payload += "\"main_menu_index\":" + String(mainMenuIndex) + ",";
  payload += "\"hx_chamber_ok\":" + String(chReady ? "true" : "false") + ",";
  payload += "\"hx_sampling_ok\":" + String(smReady ? "true" : "false") + ",";
  payload += "\"chamber_g\":" + String(chamberFiltered, 2) + ",";
  payload += "\"sampling_g\":" + String(samplingFiltered, 2) + ",";
  payload += "\"fish_count\":" + String(fishCount) + ",";
  payload += "\"feeding_rate_percent\":" + String(feedingRatePercent, 2) + ",";
  payload += "\"feeding_per_day\":" + String(feedingPerDay) + ",";
  payload += "\"target_sample_count\":" + String(targetSampleCount) + ",";
  payload += "\"sample_ready\":" + String(sampleReady ? "true" : "false") + ",";
  payload += "\"saved_sample_count\":" + String(savedSampleCount) + ",";
  payload += "\"current_sample_index\":" + String(currentSampleIndex) + ",";
  payload += "\"avg_fish_g\":" + String(sampleAverageGram, 2) + ",";
  payload += "\"servo_angle\":" + String(servoCommandAngle) + ",";
  payload += "\"stepper_enabled\":" + String(stepperEnabledState ? "true" : "false") + ",";
  payload += "\"spinner_state\":" + String(spinnerState) + ",";
  payload += "\"next_schedule_hhmm\":\"" + nextScheduleHHMM() + "\",";
  payload += "\"seconds_to_next_feed\":" + String(secLeft) + ",";
  payload += "\"last_feed_success\":" + String(lastFeedSuccess ? "true" : "false") + ",";
  payload += "\"last_feed_target_g\":" + String(lastFeedTargetGram, 2) + ",";
  payload += "\"last_feed_actual_g\":" + String(lastFeedActualGram, 2) + ",";
  payload += "\"last_feed_batch_count\":" + String(lastFeedBatchCount) + ",";
  payload += "\"last_feed_time\":\"" + lastFeedTime + "\",";
  payload += "\"last_error_code\":\"" + lastErrorCode + "\",";
  payload += "\"last_error_msg\":\"" + lastErrorMsg + "\",";
  payload += "\"last_error_time\":\"" + lastErrorTime + "\",";
  payload += "\"schedules\":" + schedulesJson;
  payload += "}";

  mqttPublish(TOPIC_STATUS, payload);
}

void publishError(String code, String message) {
  if (!mqttReady()) return;
  String p = "{\"device_id\":\"" + String(DEVICE_ID) + "\",\"timestamp\":\"" + timestampString() + "\",\"code\":\"" + code + "\",\"message\":\"" + message + "\"}";
  mqttPublish(TOPIC_ERROR, p);
}

void publishBiomassSample(int fishNo, float weightGram) {
  if (!mqttReady()) return;
  String p = "{\"device_id\":\"" + String(DEVICE_ID) + "\",\"timestamp\":\"" + timestampString() + "\",\"fish_no\":" + String(fishNo) + ",\"fish_weight_g\":" + String(weightGram, 2) + "}";
  mqttPublish(TOPIC_BIOMASS_SAMPLE, p);
}

void publishBiomassSummary() {
  if (!mqttReady()) return;
  float bk = calculateBiomassKg();
  float df = calculateDailyFeedGram();
  float ps = calculateFeedPerScheduleGram();
  String p = "{";
  p += "\"device_id\":\"" + String(DEVICE_ID) + "\",";
  p += "\"timestamp\":\"" + timestampString() + "\",";
  p += "\"sample_count\":" + String(savedSampleCount) + ",";
  p += "\"average_fish_weight_g\":" + String(sampleAverageGram, 2) + ",";
  p += "\"fish_count\":" + String(fishCount) + ",";
  p += "\"estimated_biomass_kg\":" + String(bk, 3) + ",";
  p += "\"feeding_rate_percent\":" + String(feedingRatePercent, 2) + ",";
  p += "\"feeding_per_day\":" + String(feedingPerDay) + ",";
  p += "\"estimated_daily_feed_g\":" + String(df, 2) + ",";
  p += "\"estimated_feed_per_schedule_g\":" + String(ps, 2);
  p += "}";
  mqttPublish(TOPIC_BIOMASS_SUMMARY, p);
}

void publishFeedSessionStart(String sid, String sname, float total, int batches) {
  if (!mqttReady()) return;
  String p = "{";
  p += "\"device_id\":\"" + String(DEVICE_ID) + "\",";
  p += "\"timestamp\":\"" + timestampString() + "\",";
  p += "\"feed_session_id\":\"" + sid + "\",";
  p += "\"session_name\":\"" + sname + "\",";
  p += "\"event\":\"start\",";
  p += "\"target_total_g\":" + String(total, 2) + ",";
  p += "\"planned_batch_count\":" + String(batches) + ",";
  p += "\"max_batch_g\":" + String(MAX_BATCH_GRAM, 2);
  p += "}";
  mqttPublish(TOPIC_FEED_SESSION, p);
}

void publishFeedBatch(String sid, int bn, int tb, float tg, float ag, bool ok) {
  if (!mqttReady()) return;
  String dir = ((bn - 1) % 2 == 0) ? "CW" : "CCW";
  String p = "{";
  p += "\"device_id\":\"" + String(DEVICE_ID) + "\",";
  p += "\"timestamp\":\"" + timestampString() + "\",";
  p += "\"feed_session_id\":\"" + sid + "\",";
  p += "\"batch_no\":" + String(bn) + ",";
  p += "\"total_batches\":" + String(tb) + ",";
  p += "\"target_g\":" + String(tg, 2) + ",";
  p += "\"actual_g\":" + String(ag, 2) + ",";
  p += "\"spinner_direction\":\"" + dir + "\",";
  p += "\"success\":" + String(ok ? "true" : "false");
  p += "}";
  mqttPublish(TOPIC_FEED_BATCH, p);
}

void publishFeedSummary(String sid, String sname, float total, float actual, int batches, bool ok) {
  if (!mqttReady()) return;
  String p = "{";
  p += "\"device_id\":\"" + String(DEVICE_ID) + "\",";
  p += "\"timestamp\":\"" + timestampString() + "\",";
  p += "\"feed_session_id\":\"" + sid + "\",";
  p += "\"session_name\":\"" + sname + "\",";
  p += "\"event\":\"summary\",";
  p += "\"target_total_g\":" + String(total, 2) + ",";
  p += "\"actual_total_g\":" + String(actual, 2) + ",";
  p += "\"batch_count\":" + String(batches) + ",";
  p += "\"success\":" + String(ok ? "true" : "false");
  p += "}";
  mqttPublish(TOPIC_FEED_SUMMARY, p);
}

// =====================================================
// BUTTON FUNCTION - dengan virtual button check
// =====================================================
bool buttonPressed(ButtonID id) {
  if (virtualBtnPressed[id]) {
    virtualBtnPressed[id] = false;
    Serial.printf("[VBTN] %d virtual\n", id);
    return true;
  }

  Button &b = buttons[id];
  bool raw = digitalRead(b.pin);

  if (raw != b.lastRaw) {
    b.lastRaw = raw;
    b.lastChange = millis();
  }

  if ((millis() - b.lastChange) > DEBOUNCE_MS) {
    if (raw != b.stable) {
      b.stable = raw;
      if (b.stable == LOW) return true;
    }
  }
  return false;
}

bool nextPressed() { return buttonPressed(B_UP); }
bool prevPressed() { return buttonPressed(B_DOWN); }
bool okPressed()   { return buttonPressed(B_OK); }
bool backPressed() { return buttonPressed(B_BACK); }

// =====================================================
// RTC SCHEDULE
// =====================================================
void autoGenerateSchedulesFromFeedingPerDay() {
  if (feedingPerDay < 1) feedingPerDay = 1;
  if (feedingPerDay > SCHEDULE_COUNT) feedingPerDay = SCHEDULE_COUNT;

  int activeCount = feedingPerDay;
  int span = FEED_END_MINUTE_OF_DAY - FEED_START_MINUTE_OF_DAY;

  for (int i = 0; i < SCHEDULE_COUNT; i++) {
    if (i < activeCount) {
      int minuteOfDay = FEED_START_MINUTE_OF_DAY;
      if (activeCount > 1) {
        float rawMinute = FEED_START_MINUTE_OF_DAY + ((float)span * i / (activeCount - 1));
        minuteOfDay = (int)(round(rawMinute / 5.0) * 5.0);
      }
      if (minuteOfDay < 0) minuteOfDay = 0;
      if (minuteOfDay > 1435) minuteOfDay = 1435;
      scheduleHour[i] = minuteOfDay / 60;
      scheduleMinute[i] = minuteOfDay % 60;
      scheduleEnabled[i] = true;
      scheduleTriggeredToday[i] = false;
    } else {
      scheduleEnabled[i] = false;
      scheduleTriggeredToday[i] = false;
    }
  }
}

int getScheduleMenuCount() { return feedingPerDay + 1; }

void resetScheduleDailyFlagsIfNeeded() {
  if (!rtcReady) return;
  DateTime now = rtc.now();
  if (lastScheduleDay != now.day()) {
    lastScheduleDay = now.day();
    for (int i = 0; i < SCHEDULE_COUNT; i++) scheduleTriggeredToday[i] = false;
  }
}

long secondsToNextSchedule() {
  if (!rtcReady) return -1;
  DateTime now = rtc.now();
  uint32_t nowUnix = now.unixtime();
  long best = -1;

  for (int i = 0; i < SCHEDULE_COUNT; i++) {
    if (!scheduleEnabled[i]) continue;
    DateTime candidate(now.year(), now.month(), now.day(), scheduleHour[i], scheduleMinute[i], 0);
    uint32_t cu = candidate.unixtime();
    if (cu <= nowUnix) cu += 86400UL;
    long diff = (long)(cu - nowUnix);
    if (best < 0 || diff < best) best = diff;
  }
  return best;
}

String nextScheduleHHMM() {
  if (!rtcReady) return "RTC ERR";
  long best = -1;
  int bestIndex = -1;
  DateTime now = rtc.now();
  uint32_t nowUnix = now.unixtime();

  for (int i = 0; i < SCHEDULE_COUNT; i++) {
    if (!scheduleEnabled[i]) continue;
    DateTime candidate(now.year(), now.month(), now.day(), scheduleHour[i], scheduleMinute[i], 0);
    uint32_t cu = candidate.unixtime();
    if (cu <= nowUnix) cu += 86400UL;
    long diff = (long)(cu - nowUnix);
    if (best < 0 || diff < best) { best = diff; bestIndex = i; }
  }
  if (bestIndex < 0) return "OFF";
  return hhmm(scheduleHour[bestIndex], scheduleMinute[bestIndex]);
}

bool isSafeToAutoFeedNow() {
  if (feedingInProgress) return false;
  if (currentScreen == SCREEN_SAMPLE_ACTIVE) return false;
  if (currentScreen == SCREEN_TARE_MENU) return false;
  if (currentScreen == SCREEN_EDIT_FISH_COUNT) return false;
  if (currentScreen == SCREEN_EDIT_FEEDING_RATE) return false;
  if (currentScreen == SCREEN_EDIT_FEEDING_PER_DAY) return false;
  if (currentScreen == SCREEN_EDIT_SAMPLE_COUNT) return false;
  if (currentScreen == SCREEN_EDIT_SCHEDULE) return false;
  return true;
}

void checkAutoSchedule() {
  if (!rtcReady) return;
  if (!autoFeedEnabled) return;
  if (!isSafeToAutoFeedNow()) return;

  resetScheduleDailyFlagsIfNeeded();
  DateTime now = rtc.now();

  for (int i = 0; i < SCHEDULE_COUNT; i++) {
    if (!scheduleEnabled[i]) continue;
    if (scheduleTriggeredToday[i]) continue;

    if (now.hour() == scheduleHour[i] && now.minute() == scheduleMinute[i]) {
      scheduleTriggeredToday[i] = true;

      if (!sampleReady) {
        setError("NO_SAMPLE", "Auto feed batal: belum ada sampling valid");
        lcd.clear(); lcdLine(0,"AUTO FEED BATAL"); lcdLine(1,"Belum sampling");
        delay(1500); lcd.clear();
        return;
      }

      float target = calculateFeedPerScheduleGram();
      if (target <= 0.0) {
        setError("TARGET_ZERO", "Auto feed batal: target nol");
        return;
      }

      lcd.clear(); lcdLine(0,"AUTO FEED"); lcdLine(1,"Target:" + String(target, 0) + "g");
      delay(1200);

      runFeedingSession(target, "AUTO FEED");
      currentScreen = SCREEN_MAIN_MENU;
      lcd.clear();
      return;
    }
  }
}

// =====================================================
// HX711 + LOAD CELL
// =====================================================
bool waitHX711Ready(HX711 &scale, unsigned long timeoutMs) {
  unsigned long start = millis();
  while (!scale.is_ready()) {
    if (millis() - start > timeoutMs) return false;
    delay(10);
  }
  return true;
}

float readChamberGram() {
  if (!scaleChamber.is_ready()) return chamberFiltered;
  float raw = scaleChamber.get_units(5);
  if (fabs(raw) < 1.0) raw = 0.0;
  chamberFiltered = (FILTER_ALPHA * raw) + ((1.0 - FILTER_ALPHA) * chamberFiltered);
  return clampWeight(chamberFiltered);
}

float readSamplingGram() {
  if (!scaleSampling.is_ready()) return samplingFiltered;
  float raw = scaleSampling.get_units(5);
  if (fabs(raw) < 1.0) raw = 0.0;
  samplingFiltered = (FILTER_ALPHA * raw) + ((1.0 - FILTER_ALPHA) * samplingFiltered);
  return clampWeight(samplingFiltered);
}

float readChamberInstantGram() {
  if (!scaleChamber.is_ready()) return chamberFiltered;
  float raw = scaleChamber.get_units(3);
  if (fabs(raw) < 1.0) raw = 0.0;
  if (raw < 0.0) raw = 0.0;
  if (raw > MAX_CAPACITY_G) raw = MAX_CAPACITY_G;
  chamberFiltered = raw;
  return raw;
}

// =====================================================
// ADAPTIVE CALCULATION
// =====================================================
void calculateAverageSample() {
  if (savedSampleCount <= 0) {
    sampleAverageGram = 0.0;
    sampleReady = false;
    return;
  }
  float total = 0.0;
  for (int i = 0; i < savedSampleCount; i++) total += fishSamples[i];
  sampleAverageGram = total / savedSampleCount;
  sampleReady = (savedSampleCount >= MIN_SAMPLE_COUNT && sampleAverageGram > 0.0);
}

float interpolateFeedingRate(float w, float wL, float rL, float wH, float rH) {
  if (wH <= wL) return rL;
  float r = (w - wL) / (wH - wL);
  if (r < 0.0) r = 0.0;
  if (r > 1.0) r = 1.0;
  return rL + r * (rH - rL);
}

float recommendedFeedingRatePercent(float g) {
  if (g <= 20.0) return 7.0;
  if (g <= 50.0) return interpolateFeedingRate(g, 20.0, 7.0, 50.0, 5.0);
  if (g <= 100.0) return interpolateFeedingRate(g, 50.0, 5.0, 100.0, 3.5);
  if (g <= 300.0) return interpolateFeedingRate(g, 100.0, 3.5, 300.0, 2.8);
  if (g <= 700.0) return interpolateFeedingRate(g, 300.0, 2.8, 700.0, 2.0);
  if (g <= 1000.0) return interpolateFeedingRate(g, 700.0, 2.0, 1000.0, 1.5);
  return 1.5;
}

void updateFeedingRateFromSampling() {
  if (!sampleReady) return;
  feedingRatePercent = recommendedFeedingRatePercent(sampleAverageGram);
  saveSettings();
}

float calculateBiomassKg() {
  if (!sampleReady) return 0.0;
  return (sampleAverageGram * fishCount) / 1000.0;
}

float calculateDailyFeedGram() {
  return calculateBiomassKg() * (feedingRatePercent / 100.0) * 1000.0;
}

float calculateFeedPerScheduleGram() {
  if (feedingPerDay <= 0) return 0.0;
  return calculateDailyFeedGram() / feedingPerDay;
}

void resetSamples() {
  for (int i = 0; i < MAX_SAMPLE_COUNT; i++) fishSamples[i] = 0.0;
  currentSampleIndex = 0;
  savedSampleCount = 0;
  sampleAverageGram = 0.0;
  sampleReady = false;
  waitingFishRemove = false;
  samplingZeroStartMs = 0;
}

// =====================================================
// SERVO + STEPPER + SPINNER
// =====================================================
void servoInitClose() {
  doorServo.setPeriodHertz(50);
  doorServo.attach(SERVO_PIN, 500, 2500);
  doorServo.write(SERVO_CLOSE_ANGLE);
  servoCommandAngle = SERVO_CLOSE_ANGLE;
  delay(800);
}

void servoOpen() {
  doorServo.write(SERVO_OPEN_ANGLE);
  servoCommandAngle = SERVO_OPEN_ANGLE;
}

void servoClose() {
  doorServo.write(SERVO_CLOSE_ANGLE);
  servoCommandAngle = SERVO_CLOSE_ANGLE;
}

void stepperEnable() {
  digitalWrite(STEPPER_ENA_PIN, STEPPER_ENABLE_LEVEL);
  stepperEnabledState = true;
  delay(300);
}

void stepperDisable() {
  digitalWrite(STEPPER_PUL_PIN, STEPPER_PULSE_IDLE);
  digitalWrite(STEPPER_ENA_PIN, STEPPER_DISABLE_LEVEL);
  stepperEnabledState = false;
  delay(300);
}

void stepperStepOnce(int stepDelayUs) {
  digitalWrite(STEPPER_PUL_PIN, STEPPER_PULSE_ACTIVE);
  delayMicroseconds(STEPPER_PULSE_WIDTH_US);
  digitalWrite(STEPPER_PUL_PIN, STEPPER_PULSE_IDLE);
  delayMicroseconds(stepDelayUs);
}

void stepperRunBlock(int dirLevel, int steps, int stepDelayUs) {
  digitalWrite(STEPPER_DIR_PIN, dirLevel);
  delayMicroseconds(100);
  for (int i = 0; i < steps; i++) stepperStepOnce(stepDelayUs);
}

void spinnerStop() { digitalWrite(BTS_RPWM, LOW); digitalWrite(BTS_LPWM, LOW); spinnerState = 0; }
void spinnerCW()   { digitalWrite(BTS_RPWM, HIGH); digitalWrite(BTS_LPWM, LOW); spinnerState = 1; }
void spinnerCCW()  { digitalWrite(BTS_RPWM, LOW); digitalWrite(BTS_LPWM, HIGH); spinnerState = 2; }
void spinnerRunByBatch(int idx) { (idx % 2 == 0) ? spinnerCW() : spinnerCCW(); }

void stopAllActuators() {
  stepperDisable();
  spinnerStop();
  servoClose();
}

// =====================================================
// TARE
// =====================================================
void tareChamber() {
  lcd.clear(); lcdLine(0,"Tare Pakan"); lcdLine(1,"Kosongkan..."); delay(1800);
  if (scaleChamber.is_ready()) { scaleChamber.tare(25); chamberFiltered = 0.0; }
  else setError("HX_CH_ERR", "HX711 chamber tidak ready");
  lcd.clear(); lcdLine(0,"Tare Pakan"); lcdLine(1,"Selesai"); delay(900); lcd.clear();
}

void tareSampling() {
  lcd.clear(); lcdLine(0,"Tare Biomassa"); lcdLine(1,"Kosongkan..."); delay(1800);
  if (scaleSampling.is_ready()) { scaleSampling.tare(25); samplingFiltered = 0.0; }
  else setError("HX_SM_ERR", "HX711 sampling tidak ready");
  lcd.clear(); lcdLine(0,"Tare Biomassa"); lcdLine(1,"Selesai"); delay(900); lcd.clear();
}

void tareAll() {
  lcd.clear(); lcdLine(0,"Tare Semua"); lcdLine(1,"Kosongkan..."); delay(2000);
  if (scaleChamber.is_ready()) { scaleChamber.tare(25); chamberFiltered = 0.0; }
  if (scaleSampling.is_ready()) { scaleSampling.tare(25); samplingFiltered = 0.0; }
  lcd.clear(); lcdLine(0,"Tare Semua"); lcdLine(1,"Selesai"); delay(900); lcd.clear();
}

// =====================================================
// BATCH BUILDER + CONFIRM (sama V3.1)
// =====================================================
bool buildBatchTargets(float totalFeedGram) {
  batchTargetCount = 0;
  if (totalFeedGram <= 0.0) return false;

  if (totalFeedGram <= MAX_BATCH_GRAM) {
    batchTargets[0] = totalFeedGram;
    batchTargetCount = 1;
    return true;
  }

  int fullBatchCount = (int)(totalFeedGram / MAX_BATCH_GRAM);
  float remainder = totalFeedGram - (fullBatchCount * MAX_BATCH_GRAM);

  if (remainder < 0.1) {
    if (fullBatchCount > MAX_BATCH_COUNT) return false;
    for (int i = 0; i < fullBatchCount; i++) batchTargets[i] = MAX_BATCH_GRAM;
    batchTargetCount = fullBatchCount;
    return true;
  }

  if (remainder >= MIN_STABLE_BATCH_GRAM) {
    int count = fullBatchCount + 1;
    if (count > MAX_BATCH_COUNT) return false;
    for (int i = 0; i < fullBatchCount; i++) batchTargets[i] = MAX_BATCH_GRAM;
    batchTargets[fullBatchCount] = remainder;
    batchTargetCount = count;
    return true;
  }

  int redistributedCount = (int)ceil(totalFeedGram / MAX_BATCH_GRAM);
  float equalBatchGram = totalFeedGram / redistributedCount;
  if (redistributedCount > MAX_BATCH_COUNT) return false;
  for (int i = 0; i < redistributedCount; i++) batchTargets[i] = equalBatchGram;
  batchTargetCount = redistributedCount;
  return true;
}

bool confirmStartFeeding(String title, float totalGram) {
  lcd.clear(); lcdLine(0, title); lcdLine(1, "Total:" + String(totalGram, 0) + "g"); delay(1200);
  lcd.clear(); lcdLine(0, "OK=Start Feed"); lcdLine(1, "BACK=Batal");

  while (true) {
    maintainNetwork();
    if (okPressed()) { lcd.clear(); return true; }
    if (backPressed()) {
      lcd.clear(); lcdLine(0,"Feeding batal"); lcdLine(1,"Kembali menu");
      delay(1000); lcd.clear(); return false;
    }
    delay(30);
  }
}

// =====================================================
// FEEDING SESSION (sama V3.1 + MQTT publish)
// =====================================================
bool runSingleBatch(float targetGram, int batchIndex, int batchNo, int totalBatches, float &actualGram) {
  actualGram = 0.0;
  lcd.clear(); lcdLine(0,"FEED BATCH"); lcdLine(1,"B:" + String(batchNo) + "/" + String(totalBatches)); delay(900);
  lcd.clear(); lcdLine(0,"Target Batch"); lcdLine(1, String(targetGram, 1) + "g"); delay(900);

  servoClose(); spinnerStop(); stepperDisable();

  lcd.clear(); lcdLine(0,"Tare Chamber"); lcdLine(1,"Pastikan kosong"); delay(1000);
  if (scaleChamber.is_ready()) { scaleChamber.tare(25); chamberFiltered = 0.0; }
  else {
    lcd.clear(); lcdLine(0,"ERROR HX711"); lcdLine(1,"Chamber ERR"); delay(1500);
    stopAllActuators(); setError("HX_CH_ERR", "Chamber HX711 not ready during feeding");
    return false;
  }

  float dynamicStopMargin = FEED_STOP_MARGIN_G;
  if (targetGram < 80.0) dynamicStopMargin = 1.5;
  if (targetGram < 40.0) dynamicStopMargin = 1.0;
  float stopAtGram = targetGram - dynamicStopMargin;
  if (stopAtGram < 1.0) stopAtGram = targetGram;
  float slowStartGram = targetGram - FEED_SLOW_ZONE_G;
  if (slowStartGram < 0.0) slowStartGram = targetGram * 0.70;

  lcd.clear(); lcdLine(0,"FILL CHAMBER"); lcdLine(1,"Stepper ON"); delay(700);
  stepperEnable();

  unsigned long fillStart = millis();
  unsigned long lastLCD = 0;
  float gram = 0.0;

  while (true) {
    maintainNetwork();
    if (backPressed()) {
      lcd.clear(); lcdLine(0,"FEED ABORT"); lcdLine(1,"BACK pressed");
      stopAllActuators(); delay(1500); lcd.clear();
      setError("FEED_ABORT", "User membatalkan saat fill");
      return false;
    }
    gram = readChamberInstantGram();
    if (gram >= stopAtGram) break;
    if (millis() - fillStart > FEED_FILL_TIMEOUT_MS) {
      lcd.clear(); lcdLine(0,"FILL TIMEOUT"); lcdLine(1,"Batch gagal");
      stopAllActuators(); delay(2000); lcd.clear();
      setError("FILL_TIMEOUT", "Auger fill timeout");
      return false;
    }
    int stepDelay = (gram >= slowStartGram) ? AUGER_SLOW_DELAY_US : AUGER_FAST_DELAY_US;
    int blockSteps = (gram >= slowStartGram) ? 3 : 10;
    stepperRunBlock(AUGER_FILL_DIR, blockSteps, stepDelay);
    if (millis() - lastLCD >= 300) {
      lastLCD = millis();
      lcdLine(0, "FILL B:" + String(batchNo) + "/" + String(totalBatches));
      lcdLine(1, formatGram(gram) + "g T:" + String(targetGram, 0));
    }
  }

  stepperDisable();
  lcd.clear(); lcdLine(0,"STEPPER STOP"); lcdLine(1,"Settling...");
  delay(FEED_SETTLING_MS);

  float finalGram = readChamberInstantGram();
  actualGram = finalGram;

  lcd.clear(); lcdLine(0,"TARGET REACHED"); lcdLine(1,"CH:" + String(finalGram, 1) + "g"); delay(1000);

  String dirText = (batchIndex % 2 == 0) ? "CW" : "CCW";
  lcd.clear(); lcdLine(0,"SPINNER ON"); lcdLine(1,"Dir:" + dirText);
  spinnerRunByBatch(batchIndex);
  delay(SPINNER_PRESTART_MS);

  lcd.clear(); lcdLine(0,"SERVO OPEN"); lcdLine(1,"Dispensing...");
  servoOpen();

  unsigned long dispenseStart = millis();
  lastLCD = 0;

  while (true) {
    maintainNetwork();
    if (backPressed()) {
      lcd.clear(); lcdLine(0,"FEED ABORT"); lcdLine(1,"Closing...");
      stopAllActuators(); delay(1500); lcd.clear();
      setError("FEED_ABORT", "User membatalkan saat dispense");
      return false;
    }
    gram = readChamberInstantGram();
    if (gram <= EMPTY_THRESHOLD_G) break;
    if (millis() - dispenseStart > DISPENSE_TIMEOUT_MS) {
      lcd.clear(); lcdLine(0,"DISP TIMEOUT"); lcdLine(1,"Cek chamber");
      servoClose(); delay(500); spinnerStop(); stepperDisable();
      delay(2000); lcd.clear();
      setError("DISP_TIMEOUT", "Chamber tidak kosong");
      return false;
    }
    if (millis() - lastLCD >= 300) {
      lastLCD = millis();
      lcdLine(0, "DISP B:" + String(batchNo) + "/" + String(totalBatches));
      lcdLine(1, "CH:" + formatGram(gram) + "g");
    }
  }

  lcd.clear(); lcdLine(0,"CHAMBER EMPTY"); lcdLine(1,"Closing door");
  servoClose(); delay(700);
  delay(SPINNER_POSTCLOSE_MS); spinnerStop();

  lcd.clear(); lcdLine(0,"BATCH DONE"); lcdLine(1,"Actual:" + String(finalGram, 1) + "g");
  delay(1200); lcd.clear();
  return true;
}

String makeSessionId() {
  return "feed_" + String(millis());
}

bool runFeedingSession(float totalFeedGram, String sessionName) {
  if (feedingInProgress) return false;
  feedingInProgress = true;
  publishDeviceStatus(true);

  if (!buildBatchTargets(totalFeedGram)) {
    lcd.clear(); lcdLine(0,"BATCH ERROR"); lcdLine(1,"Target invalid"); delay(1500); lcd.clear();
    setError("BATCH_ERROR", "Gagal membuat target batch");
    feedingInProgress = false;
    publishDeviceStatus(true);
    return false;
  }

  String sessionId = makeSessionId();
  publishFeedSessionStart(sessionId, sessionName, totalFeedGram, batchTargetCount);

  lcd.clear(); lcdLine(0, sessionName); lcdLine(1, String(batchTargetCount) + " batch"); delay(1200);

  float totalActualGram = 0.0;
  for (int i = 0; i < batchTargetCount; i++) {
    maintainNetwork();
    float actualGram = 0.0;
    bool ok = runSingleBatch(batchTargets[i], i, i + 1, batchTargetCount, actualGram);
    publishFeedBatch(sessionId, i + 1, batchTargetCount, batchTargets[i], actualGram, ok);

    if (!ok) {
      lcd.clear(); lcdLine(0,"SESSION FAIL"); lcdLine(1,"Batch:" + String(i + 1));
      stopAllActuators(); delay(2000); lcd.clear();

      lastFeedSuccess = false;
      lastFeedTargetGram = totalFeedGram;
      lastFeedActualGram = totalActualGram;
      lastFeedBatchCount = i + 1;
      lastFeedTime = timestampString();

      publishFeedSummary(sessionId, sessionName, totalFeedGram, totalActualGram, i + 1, false);
      feedingInProgress = false;
      publishDeviceStatus(true);
      return false;
    }

    totalActualGram += actualGram;
    if (i < batchTargetCount - 1) {
      lcd.clear(); lcdLine(0,"Next Batch"); lcdLine(1, String(i + 2) + "/" + String(batchTargetCount));
      delay(1000);
    }
  }

  stopAllActuators();

  lastFeedSuccess = true;
  lastFeedTargetGram = totalFeedGram;
  lastFeedActualGram = totalActualGram;
  lastFeedBatchCount = batchTargetCount;
  lastFeedTime = timestampString();

  lcd.clear(); lcdLine(0,"FEEDING DONE"); lcdLine(1,"Total:" + String(totalActualGram, 1) + "g");
  delay(2500); lcd.clear();

  publishFeedSummary(sessionId, sessionName, totalFeedGram, totalActualGram, batchTargetCount, true);

  feedingInProgress = false;
  publishDeviceStatus(true);
  return true;
}

// =====================================================
// DISPLAY FUNCTIONS (sama V3.1)
// =====================================================
void showMainMenu() {
  lcdLine(0, "MENU UTAMA");
  lcdLine(1, ">" + mainMenu[mainMenuIndex]);
}

void showStatus() {
  if (statusPage == 0) {
    if (feedingInProgress) lcdLine(0, "MODE: FEEDING");
    else lcdLine(0, "MODE: STANDBY");
    lcdLine(1, "Next: " + nextScheduleHHMM());
  } else if (statusPage == 1) {
    lcdLine(0, "WiFi:" + String(WiFi.status() == WL_CONNECTED ? "OK" : "OFF"));
    lcdLine(1, "MQTT:" + String(mqttReady() ? "OK" : "OFF"));
  } else {
    bool chReady = scaleChamber.is_ready();
    bool smReady = scaleSampling.is_ready();
    lcdLine(0, "HX CH:" + String(chReady ? "OK" : "ERR"));
    lcdLine(1, "HX SM:" + String(smReady ? "OK" : "ERR"));
  }
}

void showFeedMenu() {
  lcdLine(0, "PAKAN OTOMATIS");
  lcdLine(1, ">" + feedMenu[feedMenuIndex]);
}

void showFeedTargetInfo() {
  if (!sampleReady) {
    lcdLine(0, "Target: INVALID");
    lcdLine(1, "Sampling dulu");
    return;
  }
  float target = calculateFeedPerScheduleGram();
  lcdLine(0, "Target/Jadwal");
  lcdLine(1, String(target, 0) + " g");
}

void showBiomassMenu() {
  lcdLine(0, "TIMBANG BIOMASS");
  lcdLine(1, ">" + biomassMenu[biomassMenuIndex]);
}

void showSampleSummary() {
  if (!sampleReady) {
    lcdLine(0, "Belum Valid");
    lcdLine(1, "Min " + String(MIN_SAMPLE_COUNT) + " ikan");
    return;
  }
  lcdLine(0, "AVG:" + String(sampleAverageGram, 1) + "g");
  lcdLine(1, "N:" + String(savedSampleCount) + " Ikan:" + String(fishCount));
}

void showEditSampleCount() {
  lcdLine(0, "Jumlah Sample");
  lcdLine(1, String(targetSampleCount) + " ikan");
}

void showDataKolamMenu() {
  lcdLine(0, "DATA KOLAM");
  lcdLine(1, ">" + dataKolamMenu[dataKolamMenuIndex]);
}

void showEditFishCount() {
  lcdLine(0, "Jumlah Ikan");
  lcdLine(1, String(fishCount) + " ekor");
}

void showEditFeedingRate() {
  lcdLine(0, "Feeding Rate");
  lcdLine(1, String(feedingRatePercent, 1) + " %/hari");
}

void showEditFeedingPerDay() {
  lcdLine(0, "Frekuensi");
  lcdLine(1, String(feedingPerDay) + " kali/hari");
}

void showDataFeedInfo() {
  if (!sampleReady) {
    lcdLine(0, "Feed Info ERR");
    lcdLine(1, "Sampling dulu");
    return;
  }
  float biomassKg = calculateBiomassKg();
  float dailyFeedGram = calculateDailyFeedGram();
  float perScheduleGram = calculateFeedPerScheduleGram();
  if (dataFeedInfoPage == 0) {
    lcdLine(0, "Avg:" + String(sampleAverageGram, 1) + "g");
    lcdLine(1, "Ikan:" + String(fishCount));
  } else if (dataFeedInfoPage == 1) {
    lcdLine(0, "Biomassa");
    lcdLine(1, String(biomassKg, 1) + " kg");
  } else if (dataFeedInfoPage == 2) {
    lcdLine(0, "Rate Auto:" + String(feedingRatePercent, 1) + "%");
    lcdLine(1, "Hari:" + String(dailyFeedGram, 0) + "g");
  } else {
    lcdLine(0, "Per Jadwal");
    lcdLine(1, String(perScheduleGram, 0) + "g x" + String(feedingPerDay));
  }
}

void showScheduleMenu() {
  if (scheduleMenuIndex < feedingPerDay) {
    int i = scheduleMenuIndex;
    String s = scheduleEnabled[i] ? " ON" : " OFF";
    lcdLine(0, "JADWAL " + String(i + 1) + s);
    lcdLine(1, ">Set " + hhmm(scheduleHour[i], scheduleMinute[i]));
  } else {
    lcdLine(0, "JADWAL PAKAN");
    lcdLine(1, ">Auto Generate");
  }
}

void showEditSchedule() {
  int h = scheduleHour[editingScheduleIndex];
  int m = scheduleMinute[editingScheduleIndex];
  if (editingScheduleStage == 0) {
    lcdLine(0, "J" + String(editingScheduleIndex + 1) + " Jam: " + twoDigit(h));
    lcdLine(1, "OK=Menit");
  } else {
    lcdLine(0, "J" + String(editingScheduleIndex + 1) + " Menit:" + twoDigit(m));
    lcdLine(1, "OK=Simpan");
  }
}

void showTareMenu() {
  lcdLine(0, "KALIBRASI/TARE");
  lcdLine(1, ">" + tareMenu[tareMenuIndex]);
}

void showHistoryMenu() {
  lcdLine(0, "RIWAYAT AKHIR");
  lcdLine(1, ">" + historyMenu[historyMenuIndex]);
}

void showSettingsMenu() {
  lcdLine(0, "PENGATURAN");
  lcdLine(1, ">" + settingsMenu[settingsMenuIndex]);
}

void showWiFiStatus() {
  if (!WIFI_ENABLE) { lcdLine(0, "WiFi Disabled"); lcdLine(1, "BACK kembali"); }
  else if (WiFi.status() == WL_CONNECTED) {
    lcdLine(0, "WiFi: OK");
    lcdLine(1, WiFi.localIP().toString());
  } else {
    lcdLine(0, "WiFi: OFFLINE");
    lcdLine(1, "OK reconnect");
  }
}

void showRtcStatus() {
  if (!rtcReady) { lcdLine(0, "RTC: ERROR"); lcdLine(1, "Cek wiring"); return; }
  DateTime now = rtc.now();
  lcdLine(0, "RTC: OK");
  lcdLine(1, hhmm(now.hour(), now.minute()));
}

void showDeviceInfo() {
  lcdLine(0, "Pakan Lele");
  lcdLine(1, "V3.2 Hybrid");
}

// =====================================================
// SAMPLE BIOMASS CONTROL (sama V3.1 + MQTT publish)
// =====================================================
void startSamplingSession() {
  resetSamples();
  lcd.clear();
  lcdLine(0, "Mulai Sampling");
  lcdLine(1, String(targetSampleCount) + " ikan final");
  delay(1200);
  tareSampling();
  currentScreen = SCREEN_SAMPLE_ACTIVE;
  lcd.clear();
}

void handleSampleActive() {
  maintainNetwork();

  if (backPressed()) {
    lcd.clear(); lcdLine(0,"Sampling Batal"); lcdLine(1,"Data dihapus"); delay(900);
    resetSamples();
    currentScreen = SCREEN_BIOMASS_MENU; lcd.clear();
    return;
  }

  float gram = readSamplingGram();

  if (waitingFishRemove) {
    lcdLine(0, "Nolkan Timbang");
    lcdLine(1, "SM:" + formatGram(gram) + "g");

    if (gram <= EMPTY_THRESHOLD_G) {
      if (samplingZeroStartMs == 0) samplingZeroStartMs = millis();
      if (millis() - samplingZeroStartMs >= SAMPLING_ZERO_STABLE_MS) {
        waitingFishRemove = false;
        samplingZeroStartMs = 0;
        currentSampleIndex++;
        lcd.clear();
        if (currentSampleIndex < targetSampleCount) {
          lcdLine(0, "Siap Ikan " + String(currentSampleIndex + 1));
          lcdLine(1, "Letakkan ikan");
          delay(1000);
        }
        lcd.clear();
      }
    } else {
      samplingZeroStartMs = 0;
    }
    return;
  }

  if (currentSampleIndex >= targetSampleCount) {
    calculateAverageSample();
    if (sampleReady) {
      updateFeedingRateFromSampling();
      lastSampleAverageGram = sampleAverageGram;
      lastSampleCount = savedSampleCount;
      lastSampleTime = timestampString();
      saveSampleSummaryToPrefs();
      publishBiomassSummary();
    } else {
      setError("SAMPLE_LOW", "Jumlah sampel kurang dari minimal valid");
    }
    currentScreen = SCREEN_SAMPLE_SUMMARY;
    lcd.clear();
    return;
  }

  if (millis() - lastDisplayUpdate >= DISPLAY_UPDATE_MS) {
    lastDisplayUpdate = millis();
    lcdLine(0, "Ikan " + String(currentSampleIndex + 1) + "/" + String(targetSampleCount));
    lcdLine(1, formatGram(gram) + "g OK=Simpan");
  }

  if (okPressed()) {
    if (gram < MIN_FISH_SAVE_G) {
      lcd.clear(); lcdLine(0,"Berat terlalu"); lcdLine(1,"kecil/kosong");
      delay(900); lcd.clear(); return;
    }
    fishSamples[currentSampleIndex] = gram;
    savedSampleCount++;
    publishBiomassSample(currentSampleIndex + 1, gram);

    lcd.clear(); lcdLine(0,"Data Tersimpan");
    lcdLine(1, "Ikan:" + String(currentSampleIndex + 1) + " " + String(gram, 1) + "g");
    delay(1200);

    if (currentSampleIndex >= targetSampleCount - 1) {
      calculateAverageSample();
      if (sampleReady) {
        updateFeedingRateFromSampling();
        lastSampleAverageGram = sampleAverageGram;
        lastSampleCount = savedSampleCount;
        lastSampleTime = timestampString();
        saveSampleSummaryToPrefs();
        publishBiomassSummary();
      }
      lcd.clear(); lcdLine(0,"Sampling Done"); lcdLine(1,"AVG:" + String(sampleAverageGram, 1) + "g");
      delay(1500);
      currentScreen = SCREEN_SAMPLE_SUMMARY; lcd.clear();
    } else {
      waitingFishRemove = true;
      samplingZeroStartMs = 0;
      lcd.clear();
    }
  }
}

// =====================================================
// MENU HANDLERS (sama V3.1)
// =====================================================
void handleMainMenu() {
  if (prevPressed()) { mainMenuIndex = (mainMenuIndex - 1 + MAIN_MENU_COUNT) % MAIN_MENU_COUNT; lcd.clear(); publishDeviceStatus(true); }
  if (nextPressed()) { mainMenuIndex = (mainMenuIndex + 1) % MAIN_MENU_COUNT; lcd.clear(); publishDeviceStatus(true); }
  if (okPressed()) {
    lcd.clear();
    if (mainMenuIndex == 0) currentScreen = SCREEN_STATUS;
    else if (mainMenuIndex == 1) currentScreen = SCREEN_FEED_MENU;
    else if (mainMenuIndex == 2) currentScreen = SCREEN_BIOMASS_MENU;
    else if (mainMenuIndex == 3) currentScreen = SCREEN_DATA_KOLAM_MENU;
    else if (mainMenuIndex == 4) currentScreen = SCREEN_SCHEDULE_MENU;
    else if (mainMenuIndex == 5) currentScreen = SCREEN_TARE_MENU;
    else if (mainMenuIndex == 6) currentScreen = SCREEN_HISTORY_MENU;
    else if (mainMenuIndex == 7) currentScreen = SCREEN_SETTINGS_MENU;
    publishDeviceStatus(true);
  }
  showMainMenu();
}

void handleStatus() {
  if (prevPressed()) { statusPage = (statusPage - 1 + 3) % 3; lcd.clear(); }
  if (nextPressed()) { statusPage = (statusPage + 1) % 3; lcd.clear(); }
  if (backPressed()) { currentScreen = SCREEN_MAIN_MENU; lcd.clear(); publishDeviceStatus(true); return; }
  if (millis() - lastDisplayUpdate >= 500) { lastDisplayUpdate = millis(); showStatus(); }
}

void handleFeedMenu() {
  if (prevPressed()) { feedMenuIndex = (feedMenuIndex - 1 + FEED_MENU_COUNT) % FEED_MENU_COUNT; lcd.clear(); }
  if (nextPressed()) { feedMenuIndex = (feedMenuIndex + 1) % FEED_MENU_COUNT; lcd.clear(); }
  if (backPressed()) { currentScreen = SCREEN_MAIN_MENU; lcd.clear(); publishDeviceStatus(true); return; }
  if (okPressed()) {
    if (feedMenuIndex == 0) {
      autoFeedEnabled = !autoFeedEnabled;
      saveSettings();
      lcd.clear(); lcdLine(0,"Auto Feed"); lcdLine(1, autoFeedEnabled ? "ON" : "OFF");
      delay(900); lcd.clear();
      publishDeviceStatus(true);
    } else if (feedMenuIndex == 1) {
      if (!sampleReady) {
        lcd.clear(); lcdLine(0,"Manual gagal"); lcdLine(1,"Sampling dulu");
        delay(1200); lcd.clear();
        setError("NO_SAMPLE", "Manual feed gagal: belum ada sampling valid");
      } else {
        float target = calculateFeedPerScheduleGram();
        if (target <= 0.0) {
          lcd.clear(); lcdLine(0,"Target invalid"); lcdLine(1,"Cek data kolam");
          delay(1200); lcd.clear();
          setError("TARGET_ZERO", "Manual feed gagal: target nol");
        } else if (confirmStartFeeding("FEED MANUAL", target)) {
          runFeedingSession(target, "MANUAL FEED");
        }
      }
    } else if (feedMenuIndex == 2) {
      currentScreen = SCREEN_FEED_TARGET_INFO; lcd.clear();
      return;
    }
  }
  showFeedMenu();
}

void handleFeedTargetInfo() {
  if (backPressed()) { currentScreen = SCREEN_FEED_MENU; lcd.clear(); return; }
  if (millis() - lastDisplayUpdate >= 500) { lastDisplayUpdate = millis(); showFeedTargetInfo(); }
}

void handleBiomassMenu() {
  if (prevPressed()) { biomassMenuIndex = (biomassMenuIndex - 1 + BIOMASS_MENU_COUNT) % BIOMASS_MENU_COUNT; lcd.clear(); }
  if (nextPressed()) { biomassMenuIndex = (biomassMenuIndex + 1) % BIOMASS_MENU_COUNT; lcd.clear(); }
  if (backPressed()) { currentScreen = SCREEN_MAIN_MENU; lcd.clear(); publishDeviceStatus(true); return; }
  if (okPressed()) {
    if (biomassMenuIndex == 0) startSamplingSession();
    else if (biomassMenuIndex == 1) { currentScreen = SCREEN_SAMPLE_SUMMARY; lcd.clear(); return; }
    else if (biomassMenuIndex == 2) { currentScreen = SCREEN_EDIT_SAMPLE_COUNT; lcd.clear(); return; }
    else if (biomassMenuIndex == 3) {
      resetSamples(); clearSamplePrefs();
      lcd.clear(); lcdLine(0,"Sampling Reset"); lcdLine(1,"Data dihapus");
      delay(1000); lcd.clear();
      publishDeviceStatus(true);
    }
  }
  showBiomassMenu();
}

void handleSampleSummary() {
  if (backPressed()) { currentScreen = SCREEN_BIOMASS_MENU; lcd.clear(); return; }
  if (millis() - lastDisplayUpdate >= 500) { lastDisplayUpdate = millis(); showSampleSummary(); }
}

void handleEditSampleCount() {
  if (nextPressed()) { targetSampleCount++; if (targetSampleCount > MAX_SAMPLE_COUNT) targetSampleCount = MAX_SAMPLE_COUNT; lcd.clear(); }
  if (prevPressed()) { targetSampleCount--; if (targetSampleCount < MIN_SAMPLE_COUNT) targetSampleCount = MIN_SAMPLE_COUNT; lcd.clear(); }
  if (okPressed()) {
    saveSettings();
    lcd.clear(); lcdLine(0,"Jml Sample"); lcdLine(1,"Tersimpan");
    delay(900);
    currentScreen = SCREEN_BIOMASS_MENU; lcd.clear();
    publishDeviceStatus(true);
    return;
  }
  if (backPressed()) { currentScreen = SCREEN_BIOMASS_MENU; lcd.clear(); return; }
  showEditSampleCount();
}

void handleDataKolamMenu() {
  if (prevPressed()) { dataKolamMenuIndex = (dataKolamMenuIndex - 1 + DATA_KOLAM_MENU_COUNT) % DATA_KOLAM_MENU_COUNT; lcd.clear(); }
  if (nextPressed()) { dataKolamMenuIndex = (dataKolamMenuIndex + 1) % DATA_KOLAM_MENU_COUNT; lcd.clear(); }
  if (backPressed()) { currentScreen = SCREEN_MAIN_MENU; lcd.clear(); publishDeviceStatus(true); return; }
  if (okPressed()) {
    if (dataKolamMenuIndex == 0) currentScreen = SCREEN_EDIT_FISH_COUNT;
    else if (dataKolamMenuIndex == 1) currentScreen = SCREEN_EDIT_FEEDING_PER_DAY;
    else if (dataKolamMenuIndex == 2) currentScreen = SCREEN_DATA_FEED_INFO;
    lcd.clear();
    return;
  }
  showDataKolamMenu();
}

void handleEditFishCount() {
  if (nextPressed()) { fishCount += 500; lcd.clear(); }
  if (prevPressed()) { fishCount -= 500; if (fishCount < 1) fishCount = 1; lcd.clear(); }
  if (okPressed()) {
    saveSettings();
    lcd.clear(); lcdLine(0,"Jumlah Ikan"); lcdLine(1,"Tersimpan");
    delay(900);
    currentScreen = SCREEN_DATA_KOLAM_MENU; lcd.clear();
    publishDeviceStatus(true);
    return;
  }
  if (backPressed()) { currentScreen = SCREEN_DATA_KOLAM_MENU; lcd.clear(); return; }
  showEditFishCount();
}

void handleEditFeedingRate() {
  if (nextPressed()) { feedingRatePercent += 0.1; if (feedingRatePercent > 10.0) feedingRatePercent = 10.0; lcd.clear(); }
  if (prevPressed()) { feedingRatePercent -= 0.1; if (feedingRatePercent < 0.5) feedingRatePercent = 0.5; lcd.clear(); }
  if (okPressed()) {
    saveSettings();
    lcd.clear(); lcdLine(0,"Feeding Rate"); lcdLine(1,"Tersimpan");
    delay(900);
    currentScreen = SCREEN_DATA_KOLAM_MENU; lcd.clear();
    return;
  }
  if (backPressed()) { currentScreen = SCREEN_DATA_KOLAM_MENU; lcd.clear(); return; }
  showEditFeedingRate();
}

void handleEditFeedingPerDay() {
  if (nextPressed()) { feedingPerDay++; if (feedingPerDay > SCHEDULE_COUNT) feedingPerDay = SCHEDULE_COUNT; lcd.clear(); }
  if (prevPressed()) { feedingPerDay--; if (feedingPerDay < 1) feedingPerDay = 1; lcd.clear(); }
  if (okPressed()) {
    autoGenerateSchedulesFromFeedingPerDay();
    saveSettings();
    scheduleMenuIndex = 0;
    lcd.clear(); lcdLine(0,"Frekuensi OK"); lcdLine(1,"Jadwal auto");
    delay(900);
    currentScreen = SCREEN_DATA_KOLAM_MENU; lcd.clear();
    publishDeviceStatus(true);
    return;
  }
  if (backPressed()) { currentScreen = SCREEN_DATA_KOLAM_MENU; lcd.clear(); return; }
  showEditFeedingPerDay();
}

void handleDataFeedInfo() {
  if (prevPressed()) { dataFeedInfoPage = (dataFeedInfoPage - 1 + 4) % 4; lcd.clear(); }
  if (nextPressed()) { dataFeedInfoPage = (dataFeedInfoPage + 1) % 4; lcd.clear(); }
  if (backPressed()) { currentScreen = SCREEN_DATA_KOLAM_MENU; lcd.clear(); return; }
  if (millis() - lastDisplayUpdate >= 500) { lastDisplayUpdate = millis(); showDataFeedInfo(); }
}

void handleScheduleMenu() {
  int menuCount = getScheduleMenuCount();
  if (prevPressed()) { scheduleMenuIndex = (scheduleMenuIndex - 1 + menuCount) % menuCount; lcd.clear(); }
  if (nextPressed()) { scheduleMenuIndex = (scheduleMenuIndex + 1) % menuCount; lcd.clear(); }
  if (backPressed()) { currentScreen = SCREEN_MAIN_MENU; lcd.clear(); publishDeviceStatus(true); return; }
  if (okPressed()) {
    if (scheduleMenuIndex < feedingPerDay) {
      editingScheduleIndex = scheduleMenuIndex;
      editingScheduleStage = 0;
      currentScreen = SCREEN_EDIT_SCHEDULE;
      lcd.clear();
      return;
    } else {
      autoGenerateSchedulesFromFeedingPerDay();
      saveSettings();
      lcd.clear(); lcdLine(0,"Jadwal dibuat"); lcdLine(1, String(feedingPerDay) + "x per hari");
      delay(1000); lcd.clear();
      publishDeviceStatus(true);
    }
  }
  showScheduleMenu();
}

void handleEditSchedule() {
  int i = editingScheduleIndex;
  if (nextPressed()) {
    if (editingScheduleStage == 0) { scheduleHour[i]++; if (scheduleHour[i] > 23) scheduleHour[i] = 0; }
    else { scheduleMinute[i] += 5; if (scheduleMinute[i] > 55) scheduleMinute[i] = 0; }
    lcd.clear();
  }
  if (prevPressed()) {
    if (editingScheduleStage == 0) { scheduleHour[i]--; if (scheduleHour[i] < 0) scheduleHour[i] = 23; }
    else { scheduleMinute[i] -= 5; if (scheduleMinute[i] < 0) scheduleMinute[i] = 55; }
    lcd.clear();
  }
  if (okPressed()) {
    if (editingScheduleStage == 0) { editingScheduleStage = 1; lcd.clear(); }
    else {
      saveSettings();
      scheduleTriggeredToday[i] = false;
      lcd.clear(); lcdLine(0,"Jadwal Simpan"); lcdLine(1,"J" + String(i + 1) + " " + hhmm(scheduleHour[i], scheduleMinute[i]));
      delay(1000);
      currentScreen = SCREEN_SCHEDULE_MENU; lcd.clear();
      publishDeviceStatus(true);
      return;
    }
  }
  if (backPressed()) { currentScreen = SCREEN_SCHEDULE_MENU; lcd.clear(); return; }
  showEditSchedule();
}

void handleTareMenu() {
  if (prevPressed()) { tareMenuIndex = (tareMenuIndex - 1 + TARE_MENU_COUNT) % TARE_MENU_COUNT; lcd.clear(); }
  if (nextPressed()) { tareMenuIndex = (tareMenuIndex + 1) % TARE_MENU_COUNT; lcd.clear(); }
  if (backPressed()) { currentScreen = SCREEN_MAIN_MENU; lcd.clear(); publishDeviceStatus(true); return; }
  if (okPressed()) {
    if (tareMenuIndex == 0) tareChamber();
    else if (tareMenuIndex == 1) tareSampling();
    else if (tareMenuIndex == 2) tareAll();
    lcd.clear();
  }
  showTareMenu();
}

void showHistorySelected() {
  lcd.clear();
  if (historyMenuIndex == 0) {
    lcdLine(0, lastFeedSuccess ? "LAST FEED OK" : "LAST FEED FAIL");
    lcdLine(1, "Act:" + String(lastFeedActualGram, 0) + "g");
  } else if (historyMenuIndex == 1) {
    lcdLine(0, "LAST SAMPLE");
    lcdLine(1, "AVG:" + String(lastSampleAverageGram, 1) + "g N:" + String(lastSampleCount));
  } else {
    lcdLine(0, lastErrorCode);
    lcdLine(1, lastErrorMsg);
  }
  delay(2500);
  lcd.clear();
}

void handleHistoryMenu() {
  if (prevPressed()) { historyMenuIndex = (historyMenuIndex - 1 + HISTORY_MENU_COUNT) % HISTORY_MENU_COUNT; lcd.clear(); }
  if (nextPressed()) { historyMenuIndex = (historyMenuIndex + 1) % HISTORY_MENU_COUNT; lcd.clear(); }
  if (backPressed()) { currentScreen = SCREEN_MAIN_MENU; lcd.clear(); publishDeviceStatus(true); return; }
  if (okPressed()) showHistorySelected();
  showHistoryMenu();
}

void handleSettingsMenu() {
  if (prevPressed()) { settingsMenuIndex = (settingsMenuIndex - 1 + SETTINGS_MENU_COUNT) % SETTINGS_MENU_COUNT; lcd.clear(); }
  if (nextPressed()) { settingsMenuIndex = (settingsMenuIndex + 1) % SETTINGS_MENU_COUNT; lcd.clear(); }
  if (backPressed()) { currentScreen = SCREEN_MAIN_MENU; lcd.clear(); publishDeviceStatus(true); return; }
  if (okPressed()) {
    if (settingsMenuIndex == 0) currentScreen = SCREEN_WIFI_STATUS;
    else if (settingsMenuIndex == 1) currentScreen = SCREEN_RTC_STATUS;
    else if (settingsMenuIndex == 2) currentScreen = SCREEN_DEVICE_INFO;
    lcd.clear();
    return;
  }
  showSettingsMenu();
}

void handleWiFiStatus() {
  if (backPressed()) { currentScreen = SCREEN_SETTINGS_MENU; lcd.clear(); return; }
  if (okPressed() && WiFi.status() != WL_CONNECTED) setupWiFi();
  if (millis() - lastDisplayUpdate >= 500) { lastDisplayUpdate = millis(); showWiFiStatus(); }
}

void handleRtcStatus() {
  if (backPressed()) { currentScreen = SCREEN_SETTINGS_MENU; lcd.clear(); return; }
  if (millis() - lastDisplayUpdate >= 500) { lastDisplayUpdate = millis(); showRtcStatus(); }
}

void handleDeviceInfo() {
  if (backPressed()) { currentScreen = SCREEN_SETTINGS_MENU; lcd.clear(); return; }
  showDeviceInfo();
}

// =====================================================
// SETUP
// =====================================================
void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println("\n=== PAKAN LELE V3.2 HYBRID ===");
  Serial.println("[BOOT] Step 1: GPIO init...");

  for (int i = 0; i < 4; i++) pinMode(buttons[i].pin, INPUT_PULLUP);

  pinMode(STEPPER_PUL_PIN, OUTPUT);
  pinMode(STEPPER_DIR_PIN, OUTPUT);
  pinMode(STEPPER_ENA_PIN, OUTPUT);
  digitalWrite(STEPPER_PUL_PIN, STEPPER_PULSE_IDLE);
  digitalWrite(STEPPER_DIR_PIN, STEPPER_DIR_CW);
  digitalWrite(STEPPER_ENA_PIN, STEPPER_DISABLE_LEVEL);
  stepperEnabledState = false;

  pinMode(BTS_RPWM, OUTPUT);
  pinMode(BTS_LPWM, OUTPUT);
  spinnerStop();

  Serial.println("[BOOT] Step 2: Servo init...");
  servoInitClose();

  Serial.println("[BOOT] Step 3: I2C + LCD init...");
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(50000);

  lcd.init();
  lcd.backlight();
  lcd.clear();
  delay(500);

  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcdLine(0,"PAKAN LELE");
  lcdLine(1,"V3.2 Hybrid");
  delay(1500);

  Serial.println("[BOOT] Step 4: Load Preferences...");
  loadSettings();
  Serial.printf("  fishCount=%d, feedingPerDay=%d, sampleReady=%d\n",
    fishCount, feedingPerDay, sampleReady);

  Serial.println("[BOOT] Step 5: RTC init...");
  if (rtc.begin()) {
    rtcReady = true;
    if (rtc.lostPower()) rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
    resetScheduleDailyFlagsIfNeeded();
    Serial.println("  RTC OK");
  } else {
    rtcReady = false;
    setError("RTC_ERROR", "RTC DS3231 tidak terbaca");
    Serial.println("  RTC FAILED");
  }

  Serial.println("[BOOT] Step 6: WiFi + MQTT init...");
  setupWiFi();

  Serial.println("[BOOT] Step 7: HX711 init...");
  scaleChamber.begin(HX_CHAMBER_DT, HX_CHAMBER_SCK);
  scaleSampling.begin(HX_SAMPLING_DT, HX_SAMPLING_SCK);
  scaleChamber.set_scale(chamberCalFactor);
  scaleSampling.set_scale(samplingCalFactor);

  bool chamberReady = waitHX711Ready(scaleChamber, 3000);
  bool samplingReady = waitHX711Ready(scaleSampling, 3000);
  Serial.printf("  Chamber=%d, Sampling=%d\n", chamberReady, samplingReady);

  lcd.clear();
  if (!chamberReady || !samplingReady || !rtcReady) {
    lcdLine(0, chamberReady ? "CH:OK " : "CH:ERR");
    lcdLine(1, samplingReady ? "SM:OK " : "SM:ERR");
    delay(2000);
    lcd.clear();
    lcdLine(0, rtcReady ? "RTC:OK" : "RTC:ERROR");
    lcdLine(1, "Cek wiring");
    delay(2000);
  }

  Serial.println("[BOOT] Step 8: Tare all...");
  tareAll();

  Serial.println("[BOOT] Step 9: Safety stop actuators...");
  servoClose();
  stepperDisable();
  spinnerStop();

  Serial.println("[BOOT] Step 10: First publish status...");
  publishDeviceStatus(true);

  lcd.clear();
  lcdLine(0,"SYSTEM READY");
  lcdLine(1,"Next:" + nextScheduleHHMM());
  delay(1200);
  lcd.clear();

  Serial.println("[BOOT] ✓ Setup complete, entering loop");
}

// =====================================================
// LOOP
// =====================================================
void loop() {
  maintainNetwork();
  publishDeviceStatus(false);

  // V3.2: process command dari MQTT
  processPendingCommand();

  checkAutoSchedule();

  switch (currentScreen) {
    case SCREEN_MAIN_MENU:           handleMainMenu(); break;
    case SCREEN_STATUS:              handleStatus(); break;
    case SCREEN_FEED_MENU:           handleFeedMenu(); break;
    case SCREEN_FEED_TARGET_INFO:    handleFeedTargetInfo(); break;
    case SCREEN_BIOMASS_MENU:        handleBiomassMenu(); break;
    case SCREEN_SAMPLE_ACTIVE:       handleSampleActive(); break;
    case SCREEN_SAMPLE_SUMMARY:      handleSampleSummary(); break;
    case SCREEN_EDIT_SAMPLE_COUNT:   handleEditSampleCount(); break;
    case SCREEN_DATA_KOLAM_MENU:     handleDataKolamMenu(); break;
    case SCREEN_EDIT_FISH_COUNT:     handleEditFishCount(); break;
    case SCREEN_EDIT_FEEDING_RATE:   handleEditFeedingRate(); break;
    case SCREEN_EDIT_FEEDING_PER_DAY: handleEditFeedingPerDay(); break;
    case SCREEN_DATA_FEED_INFO:      handleDataFeedInfo(); break;
    case SCREEN_SCHEDULE_MENU:       handleScheduleMenu(); break;
    case SCREEN_EDIT_SCHEDULE:       handleEditSchedule(); break;
    case SCREEN_TARE_MENU:           handleTareMenu(); break;
    case SCREEN_HISTORY_MENU:        handleHistoryMenu(); break;
    case SCREEN_SETTINGS_MENU:       handleSettingsMenu(); break;
    case SCREEN_WIFI_STATUS:         handleWiFiStatus(); break;
    case SCREEN_RTC_STATUS:          handleRtcStatus(); break;
    case SCREEN_DEVICE_INFO:         handleDeviceInfo(); break;
    default: break;
  }

  delay(30);
}
