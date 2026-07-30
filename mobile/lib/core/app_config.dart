// ═══════════════════════════════════════════════════════════════
// App Constants & Configuration
// ═══════════════════════════════════════════════════════════════

class AppConfig {
  // Base URL backend – bisa di-override via environment
  static const String baseUrl = String.fromEnvironment(
    'BASE_URL',
    defaultValue: 'https://lele.um-km.id/api',
  );

  static const String appName = 'AquaSmart';
  static const String appVersion = '1.0.0';

  // MQTT config (broker sama yang dipakai ESP32)
  static const String mqttHost = String.fromEnvironment(
    'MQTT_HOST',
    defaultValue: 'lele.um-km.id',
  );
  static const int mqttPort = int.fromEnvironment('MQTT_PORT', defaultValue: 443);
  static const String mqttPath = String.fromEnvironment('MQTT_PATH', defaultValue: '/mqtt');
  static const String mqttUser = String.fromEnvironment('MQTT_USER', defaultValue: 'aquaculture');
  static const String mqttPassword =
      String.fromEnvironment('MQTT_PASSWORD', defaultValue: 'aquaculture123');

  // Grafana embedded URL
  static const String grafanaUrl = String.fromEnvironment(
    'GRAFANA_URL',
    defaultValue: 'https://lele.um-km.id/grafana',
  );

  // Polling intervals
  static const Duration sensorPollingInterval = Duration(seconds: 10);
  static const Duration notificationPollingInterval = Duration(seconds: 15);
}
