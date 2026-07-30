// ═══════════════════════════════════════════════════════════════
// Screen: Lele Feeder
// ═══════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/status_chip.dart';

final leleDevicesProvider = FutureProvider<List<LeleDevice>>((ref) async {
  return ref.read(apiClientProvider).getLeleDevices();
});

class FeederScreen extends ConsumerWidget {
  const FeederScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final devicesAsync = ref.watch(leleDevicesProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Pemberi Pakan Lele'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () => ref.invalidate(leleDevicesProvider),
          ),
          IconButton(
            icon: const Icon(Icons.add_rounded),
            onPressed: () => _showAddDeviceDialog(context, ref),
          ),
        ],
      ),
      body: devicesAsync.when(
        data: (devices) => devices.isEmpty
            ? Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.set_meal_rounded, size: 64, color: AppTheme.textMuted),
                    const SizedBox(height: 12),
                    const Text('Belum ada perangkat pakan',
                        style: TextStyle(color: AppTheme.textSecondary)),
                    const SizedBox(height: 16),
                    ElevatedButton.icon(
                      onPressed: () => _showAddDeviceDialog(context, ref),
                      icon: const Icon(Icons.add_rounded),
                      label: const Text('Tambah Perangkat'),
                    ),
                  ],
                ),
              )
            : RefreshIndicator(
                color: AppTheme.primary,
                onRefresh: () async => ref.invalidate(leleDevicesProvider),
                child: ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: devices.length,
                  itemBuilder: (_, i) => _FeederDeviceCard(device: devices[i], ref: ref),
                ),
              ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }

  void _showAddDeviceDialog(BuildContext context, WidgetRef ref) {
    final deviceIdCtrl = TextEditingController();
    final nameCtrl = TextEditingController();

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Tambah Perangkat Pakan'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: deviceIdCtrl,
                decoration: const InputDecoration(labelText: 'Device ID (MQTT)')),
            const SizedBox(height: 12),
            TextField(controller: nameCtrl,
                decoration: const InputDecoration(labelText: 'Nama Perangkat')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Batal')),
          ElevatedButton(
            onPressed: () async {
              try {
                await ref.read(apiClientProvider).createLeleDevice({
                  'device_id': deviceIdCtrl.text,
                  'name': nameCtrl.text,
                });
                ref.invalidate(leleDevicesProvider);
                if (ctx.mounted) Navigator.pop(ctx);
              } catch (e) {
                if (ctx.mounted) ScaffoldMessenger.of(ctx).showSnackBar(
                    SnackBar(content: Text('Error: $e'), backgroundColor: AppTheme.danger));
              }
            },
            child: const Text('Simpan'),
          ),
        ],
      ),
    );
  }
}

class _FeederDeviceCard extends ConsumerWidget {
  final LeleDevice device;
  final WidgetRef ref;
  const _FeederDeviceCard({required this.device, required this.ref});

  @override
  Widget build(BuildContext context, WidgetRef innerRef) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: (device.isOnline ? AppTheme.success : AppTheme.textMuted).withOpacity(0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(Icons.set_meal_rounded,
                      color: device.isOnline ? AppTheme.success : AppTheme.textMuted, size: 26),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(device.name ?? device.deviceId,
                          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                      Text(device.deviceId, style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
                    ],
                  ),
                ),
                StatusChip.online(device.isOnline),
              ],
            ),

            if (device.feedLevelCm != null) ...[
              const SizedBox(height: 14),
              Row(
                children: [
                  const Text('Level Pakan: ', style: TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
                  Text('${device.feedLevelCm!.toStringAsFixed(1)} cm',
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                ],
              ),
              const SizedBox(height: 8),
              LinearProgressIndicator(
                value: (device.feedLevelCm! / 30).clamp(0, 1),
                backgroundColor: AppTheme.bgInput,
                valueColor: AlwaysStoppedAnimation<Color>(
                  device.feedLevelCm! < 5 ? AppTheme.danger :
                  device.feedLevelCm! < 10 ? AppTheme.warning : AppTheme.success,
                ),
                minHeight: 8,
                borderRadius: BorderRadius.circular(4),
              ),
            ],

            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: device.isOnline
                        ? () => _sendCommand(context, 'feed', device.deviceId)
                        : null,
                    icon: const Icon(Icons.play_circle_rounded, size: 18, color: AppTheme.success),
                    label: const Text('Beri Pakan', style: TextStyle(color: AppTheme.success)),
                    style: OutlinedButton.styleFrom(
                        side: BorderSide(color: AppTheme.success.withOpacity(0.5))),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: device.isOnline
                        ? () => _sendCommand(context, 'status', device.deviceId)
                        : null,
                    icon: const Icon(Icons.info_rounded, size: 18, color: AppTheme.primary),
                    label: const Text('Cek Status', style: TextStyle(color: AppTheme.primary)),
                    style: OutlinedButton.styleFrom(
                        side: BorderSide(color: AppTheme.primary.withOpacity(0.5))),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _sendCommand(BuildContext context, String cmd, String deviceId) async {
    try {
      await ref.read(apiClientProvider).leleCommand(deviceId, cmd);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Perintah "$cmd" dikirim'), backgroundColor: AppTheme.success),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: AppTheme.danger),
        );
      }
    }
  }
}
