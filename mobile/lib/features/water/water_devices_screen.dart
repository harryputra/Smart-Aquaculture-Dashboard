// ═══════════════════════════════════════════════════════════════
// Screen: Water Devices
// ═══════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/status_chip.dart';

final waterDevicesProvider = FutureProvider<List<WaterDevice>>((ref) async {
  return ref.read(apiClientProvider).getWaterDevices();
});

class WaterDevicesScreen extends ConsumerWidget {
  const WaterDevicesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final devicesAsync = ref.watch(waterDevicesProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Perangkat Air'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () => ref.invalidate(waterDevicesProvider),
          ),
        ],
      ),
      body: devicesAsync.when(
        data: (devices) => RefreshIndicator(
          color: AppTheme.primary,
          onRefresh: () async => ref.invalidate(waterDevicesProvider),
          child: ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: devices.length,
            itemBuilder: (_, i) => _WaterDeviceCard(device: devices[i]),
          ),
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }
}

class _WaterDeviceCard extends StatelessWidget {
  final WaterDevice device;
  const _WaterDeviceCard({required this.device});

  @override
  Widget build(BuildContext context) {
    final sensor = device.latest;
    final connected = device.isConnected ?? false;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => context.push('/ponds/${device.pondId}'),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: (connected ? AppTheme.success : AppTheme.textMuted).withOpacity(0.12),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(Icons.sensors_rounded,
                        color: connected ? AppTheme.success : AppTheme.textMuted, size: 24),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(device.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                        Text(device.farmName ?? '', style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      StatusChip.connected(connected),
                      const SizedBox(height: 4),
                      StatusChip.deviceMode(device.deviceMode),
                    ],
                  ),
                ],
              ),

              if (sensor != null) ...[
                const SizedBox(height: 12),
                const Divider(height: 1),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 12,
                  runSpacing: 6,
                  children: [
                    if (sensor.temperature != null)
                      _SensorChip('🌡', '${sensor.temperature!.toStringAsFixed(1)}°C'),
                    if (sensor.dissolvedOxygen != null)
                      _SensorChip('💧', '${sensor.dissolvedOxygen!.toStringAsFixed(1)} mg/L'),
                    if (sensor.ph != null)
                      _SensorChip('⚗️', 'pH ${sensor.ph!.toStringAsFixed(1)}'),
                    if (sensor.turbidity != null)
                      _SensorChip('🌊', '${sensor.turbidity!.toStringAsFixed(0)} NTU'),
                    if (sensor.depth != null)
                      _SensorChip('📏', '${sensor.depth!.toStringAsFixed(0)} cm'),
                  ],
                ),
              ],

              if (device.ipAddress != null) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    const Icon(Icons.lan_rounded, size: 12, color: AppTheme.textMuted),
                    const SizedBox(width: 4),
                    Text('IP: ${device.ipAddress}',
                        style: const TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                    if (device.rssi != null) ...[
                      const SizedBox(width: 12),
                      const Icon(Icons.signal_wifi_4_bar, size: 12, color: AppTheme.textMuted),
                      const SizedBox(width: 4),
                      Text('RSSI: ${device.rssi} dBm',
                          style: const TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                    ],
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _SensorChip extends StatelessWidget {
  final String emoji;
  final String value;
  const _SensorChip(this.emoji, this.value);

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: AppTheme.bgInput,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppTheme.borderPrimary),
        ),
        child: Text('$emoji $value', style: const TextStyle(fontSize: 11, color: AppTheme.textPrimary)),
      );
}
