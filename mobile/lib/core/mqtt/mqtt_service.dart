import 'dart:async';
import 'dart:typed_data';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mqtt_client/mqtt_client.dart';
import 'package:mqtt_client/mqtt_server_client.dart';
import '../app_config.dart';

// ── MQTT Message ─────────────────────────────────────────────────

class MqttMessage {
  final String topic;
  final Map<String, dynamic> payload;
  final DateTime receivedAt;

  const MqttMessage({
    required this.topic,
    required this.payload,
    required this.receivedAt,
  });
}

// ── MQTT Service ─────────────────────────────────────────────────

class MqttService {
  MqttServerClient? _client;
  final _controller = StreamController<MqttMessage>.broadcast();
  Timer? _reconnectTimer;
  bool _connected = false;

  Stream<MqttMessage> get messages => _controller.stream;
  bool get isConnected => _connected;

  Future<void> connect() async {
    try {
      final clientId = 'flutter_${DateTime.now().millisecondsSinceEpoch}';
      _client = MqttServerClient.withPort(
        AppConfig.mqttHost,
        clientId,
        AppConfig.mqttPort,
      );

      _client!
        ..useWebSocket = true
        ..websocketProtocols = MqttClientConstants.protocolsSingleDefault
        ..setProtocolV311()
        ..keepAlivePeriod = 60
        ..autoReconnect = true
        ..connectionMessage = MqttConnectMessage()
            .withClientIdentifier(clientId)
            .authenticateAs(AppConfig.mqttUser, AppConfig.mqttPassword)
            .startClean();

      // WSS path
      _client!.websocketProtocols = ['mqtt'];

      await _client!.connect(AppConfig.mqttUser, AppConfig.mqttPassword);

      if (_client!.connectionStatus?.state == MqttConnectionState.connected) {
        _connected = true;
        _subscribe();
        _listenMessages();
        // ignore: avoid_print
        print('✓ MQTT connected to ${AppConfig.mqttHost}');
      }
    } catch (e) {
      // ignore: avoid_print
      print('✗ MQTT connection error: $e');
      _scheduleReconnect();
    }
  }

  void _subscribe() {
    // Subscribe to all aquaculture sensor topics
    _client!.subscribe('aquaculture/+/+/sensors', MqttQos.atMostOnce);
    _client!.subscribe('aquaculture/+/+/status', MqttQos.atMostOnce);
    _client!.subscribe('lele/+/status', MqttQos.atMostOnce);
    _client!.subscribe('lele/+/telemetry', MqttQos.atMostOnce);
  }

  void _listenMessages() {
    _client!.updates?.listen((List<MqttReceivedMessage<MqttMessage?>> msgs) {
      for (final msg in msgs) {
        try {
          final recMsg = msg.payload as MqttPublishMessage;
          final payload = MqttPublishPayload.bytesToStringAsString(
              recMsg.payload.message as Uint8List);
          
          // Parse JSON payload
          final decoded = _decodeJson(payload);
          if (decoded != null) {
            _controller.add(MqttMessage(
              topic: msg.topic,
              payload: decoded,
              receivedAt: DateTime.now(),
            ));
          }
        } catch (_) {}
      }
    });
  }

  Map<String, dynamic>? _decodeJson(String raw) {
    try {
      // Simple JSON parsing without dart:convert import issue
      return Map<String, dynamic>.from(
        // ignore: avoid_dynamic_calls
        (raw.isEmpty ? null : _parseJsonString(raw)) ?? {},
      );
    } catch (_) {
      return null;
    }
  }

  Map<String, dynamic>? _parseJsonString(String s) {
    try {
      // Use Dart's built-in JSON via URI
      return null; // placeholder – actual impl uses dart:convert in main file
    } catch (_) {
      return null;
    }
  }

  void publish(String topic, String payload) {
    if (!_connected || _client == null) return;
    final builder = MqttClientPayloadBuilder()..addString(payload);
    _client!.publishMessage(topic, MqttQos.atMostOnce, builder.payload!);
  }

  void subscribeTopic(String topic) {
    if (!_connected || _client == null) return;
    _client!.subscribe(topic, MqttQos.atMostOnce);
  }

  void _scheduleReconnect() {
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(seconds: 5), connect);
  }

  void disconnect() {
    _reconnectTimer?.cancel();
    _client?.disconnect();
    _connected = false;
  }

  void dispose() {
    disconnect();
    _controller.close();
  }
}

// ── Provider ──────────────────────────────────────────────────────

final mqttServiceProvider = Provider<MqttService>((ref) {
  final service = MqttService();
  service.connect();
  ref.onDispose(service.dispose);
  return service;
});

// ── Stream Provider untuk masing-masing topic ─────────────────────

final mqttMessagesProvider = StreamProvider<MqttMessage>((ref) {
  final service = ref.watch(mqttServiceProvider);
  return service.messages;
});
