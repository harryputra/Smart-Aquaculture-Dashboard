import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/status_chip.dart';

final farmDetailProvider = FutureProvider.family<FarmModel, String>((ref, farmId) async {
  return ref.read(apiClientProvider).getFarm(farmId);
});

final farmPondsProvider = FutureProvider.family<List<PondModel>, String>((ref, farmId) async {
  return ref.read(apiClientProvider).getPonds(farmId: farmId);
});

class FarmDetailScreen extends ConsumerWidget {
  final String farmId;
  const FarmDetailScreen({super.key, required this.farmId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final farmAsync = ref.watch(farmDetailProvider(farmId));
    final pondsAsync = ref.watch(farmPondsProvider(farmId));

    return Scaffold(
      appBar: AppBar(
        title: farmAsync.when(
          data: (f) => Text(f.name),
          loading: () => const Text('Memuat...'),
          error: (_, __) => const Text('Peternakan'),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () {
              ref.invalidate(farmDetailProvider(farmId));
              ref.invalidate(farmPondsProvider(farmId));
            },
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showAddPondDialog(context, ref),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Tambah Kolam'),
      ),
      body: farmAsync.when(
        data: (farm) => RefreshIndicator(
          color: AppTheme.primary,
          onRefresh: () async {
            ref.invalidate(farmDetailProvider(farmId));
            ref.invalidate(farmPondsProvider(farmId));
          },
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // ── Farm Info Card ────────────────────────────────
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              width: 52,
                              height: 52,
                              decoration: BoxDecoration(
                                gradient: AppTheme.primaryGradient,
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: const Icon(Icons.water_rounded, color: Colors.white, size: 26),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(farm.name,
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w700, fontSize: 18)),
                                  if (farm.location != null)
                                    Text(farm.location!,
                                        style: const TextStyle(
                                            color: AppTheme.textSecondary, fontSize: 13)),
                                ],
                              ),
                            ),
                          ],
                        ),
                        if (farm.owner != null) ...[
                          const Divider(height: 24),
                          Row(
                            children: [
                              const Icon(Icons.person_rounded,
                                  size: 16, color: AppTheme.textSecondary),
                              const SizedBox(width: 6),
                              Text('Pemilik: ${farm.owner}',
                                  style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
                            ],
                          ),
                        ],
                        if (farm.description != null) ...[
                          const SizedBox(height: 8),
                          Text(farm.description!,
                              style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
                        ],
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 24),

                // ── Ponds ─────────────────────────────────────────
                Row(
                  children: [
                    const Expanded(
                      child: Text('Kolam',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                    ),
                    Text(
                      '${farm.pondCount} kolam',
                      style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                pondsAsync.when(
                  data: (ponds) => ponds.isEmpty
                      ? const Center(
                          child: Padding(
                            padding: EdgeInsets.all(32),
                            child: Text('Belum ada kolam',
                                style: TextStyle(color: AppTheme.textSecondary)),
                          ),
                        )
                      : Column(
                          children: ponds.map((p) => _PondCard(pond: p)).toList(),
                        ),
                  loading: () => const Center(child: CircularProgressIndicator()),
                  error: (e, _) => Text('Error: $e',
                      style: const TextStyle(color: AppTheme.danger)),
                ),
              ],
            ),
          ),
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Text('Error: $e', style: const TextStyle(color: AppTheme.danger)),
        ),
      ),
    );
  }

  void _showAddPondDialog(BuildContext context, WidgetRef ref) {
    final nameCtrl = TextEditingController();
    final fishTypeCtrl = TextEditingController(text: 'Lele');
    final fishCountCtrl = TextEditingController(text: '1000');
    final sizeCtrl = TextEditingController(text: '10');
    final depthCtrl = TextEditingController(text: '100');

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Tambah Kolam'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: nameCtrl,
                  decoration: const InputDecoration(labelText: 'Nama Kolam *')),
              const SizedBox(height: 12),
              TextField(controller: fishTypeCtrl,
                  decoration: const InputDecoration(labelText: 'Jenis Ikan')),
              const SizedBox(height: 12),
              TextField(controller: fishCountCtrl,
                  decoration: const InputDecoration(labelText: 'Jumlah Ikan'),
                  keyboardType: TextInputType.number),
              const SizedBox(height: 12),
              TextField(controller: sizeCtrl,
                  decoration: const InputDecoration(labelText: 'Luas (m²)'),
                  keyboardType: TextInputType.number),
              const SizedBox(height: 12),
              TextField(controller: depthCtrl,
                  decoration: const InputDecoration(labelText: 'Kedalaman Maks (cm)'),
                  keyboardType: TextInputType.number),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Batal')),
          ElevatedButton(
            onPressed: () async {
              if (nameCtrl.text.isEmpty) return;
              try {
                await ref.read(apiClientProvider).createPond({
                  'farm_id': farmId,
                  'name': nameCtrl.text,
                  'fish_type': fishTypeCtrl.text,
                  'fish_count': int.tryParse(fishCountCtrl.text) ?? 0,
                  'size_m2': double.tryParse(sizeCtrl.text) ?? 10,
                  'max_depth': double.tryParse(depthCtrl.text) ?? 100,
                });
                ref.invalidate(farmPondsProvider(farmId));
                ref.invalidate(farmDetailProvider(farmId));
                if (ctx.mounted) Navigator.pop(ctx);
              } catch (e) {
                if (ctx.mounted) {
                  ScaffoldMessenger.of(ctx).showSnackBar(
                    SnackBar(content: Text('Error: $e'), backgroundColor: AppTheme.danger),
                  );
                }
              }
            },
            child: const Text('Simpan'),
          ),
        ],
      ),
    );
  }
}

class _PondCard extends StatelessWidget {
  final PondModel pond;
  const _PondCard({required this.pond});

  @override
  Widget build(BuildContext context) {
    final sensor = pond.latestSensor;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => context.push('/ponds/${pond.pondId}'),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: (pond.isConnected == true ? AppTheme.success : AppTheme.textMuted)
                          .withOpacity(0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(Icons.water_rounded,
                        color: pond.isConnected == true ? AppTheme.success : AppTheme.textMuted,
                        size: 22),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(pond.name,
                            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                        Row(
                          children: [
                            Text(pond.fishType ?? '', style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
                            const SizedBox(width: 8),
                            if (pond.fishCount != null)
                              Text('${pond.fishCount} ekor',
                                  style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
                          ],
                        ),
                      ],
                    ),
                  ),
                  StatusChip.connected(pond.isConnected ?? false),
                ],
              ),
              if (sensor != null) ...[
                const SizedBox(height: 12),
                const Divider(height: 1),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 16,
                  children: [
                    _SensorValue(
                        icon: Icons.thermostat_rounded,
                        value: '${sensor.temperature?.toStringAsFixed(1) ?? '--'}°C'),
                    _SensorValue(
                        icon: Icons.opacity_rounded,
                        value: '${sensor.dissolvedOxygen?.toStringAsFixed(1) ?? '--'} mg/L'),
                    _SensorValue(icon: Icons.science_rounded, value: 'pH ${sensor.ph?.toStringAsFixed(1) ?? '--'}'),
                    _SensorValue(
                        icon: Icons.water_damage_rounded,
                        value: '${sensor.depth?.toStringAsFixed(0) ?? '--'} cm'),
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

class _SensorValue extends StatelessWidget {
  final IconData icon;
  final String value;
  const _SensorValue({required this.icon, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 12, color: AppTheme.textSecondary),
        const SizedBox(width: 3),
        Text(value, style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
      ],
    );
  }
}
