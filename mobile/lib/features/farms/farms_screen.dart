import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/status_chip.dart';

// ── Providers ─────────────────────────────────────────────────────

final farmsProvider = FutureProvider<List<FarmModel>>((ref) async {
  return ref.read(apiClientProvider).getFarms();
});

// ── Farms Screen ──────────────────────────────────────────────────

class FarmsScreen extends ConsumerStatefulWidget {
  const FarmsScreen({super.key});
  @override
  ConsumerState<FarmsScreen> createState() => _FarmsScreenState();
}

class _FarmsScreenState extends ConsumerState<FarmsScreen> {
  @override
  Widget build(BuildContext context) {
    final farmsAsync = ref.watch(farmsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Peternakan'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () => ref.invalidate(farmsProvider),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showAddFarmDialog(context),
        child: const Icon(Icons.add_rounded),
      ),
      body: farmsAsync.when(
        data: (farms) => farms.isEmpty
            ? const Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.water_rounded, size: 64, color: AppTheme.textMuted),
                    SizedBox(height: 16),
                    Text('Belum ada peternakan', style: TextStyle(color: AppTheme.textSecondary)),
                  ],
                ),
              )
            : RefreshIndicator(
                color: AppTheme.primary,
                onRefresh: () async => ref.invalidate(farmsProvider),
                child: ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: farms.length,
                  itemBuilder: (_, i) => _FarmCard(farm: farms[i]),
                ),
              ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, color: AppTheme.danger, size: 48),
              const SizedBox(height: 8),
              Text('Error: $e', style: const TextStyle(color: AppTheme.textSecondary)),
              ElevatedButton(
                onPressed: () => ref.invalidate(farmsProvider),
                child: const Text('Coba Lagi'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showAddFarmDialog(BuildContext context) {
    final nameCtrl = TextEditingController();
    final locationCtrl = TextEditingController();
    final ownerCtrl = TextEditingController();
    final descCtrl = TextEditingController();

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Tambah Peternakan'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameCtrl,
                decoration: const InputDecoration(labelText: 'Nama Peternakan *'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: locationCtrl,
                decoration: const InputDecoration(labelText: 'Lokasi'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: ownerCtrl,
                decoration: const InputDecoration(labelText: 'Pemilik'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: descCtrl,
                decoration: const InputDecoration(labelText: 'Deskripsi'),
                maxLines: 2,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Batal')),
          ElevatedButton(
            onPressed: () async {
              if (nameCtrl.text.isEmpty) return;
              try {
                await ref.read(apiClientProvider).createFarm({
                  'name': nameCtrl.text,
                  'location': locationCtrl.text,
                  'owner': ownerCtrl.text,
                  'description': descCtrl.text,
                });
                ref.invalidate(farmsProvider);
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

// ── Farm Card ─────────────────────────────────────────────────────

class _FarmCard extends StatelessWidget {
  final FarmModel farm;
  const _FarmCard({required this.farm});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => context.push('/farms/${farm.farmId}'),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
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
                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                    if (farm.location != null) ...[
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          const Icon(Icons.location_on_rounded, size: 13, color: AppTheme.textSecondary),
                          const SizedBox(width: 2),
                          Text(farm.location!,
                              style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                        ],
                      ),
                    ],
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                          decoration: BoxDecoration(
                            color: AppTheme.primary.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            '${farm.pondCount} Kolam',
                            style: const TextStyle(
                                fontSize: 11, color: AppTheme.primary, fontWeight: FontWeight.w600),
                          ),
                        ),
                        if (farm.owner != null) ...[
                          const SizedBox(width: 8),
                          Text('· ${farm.owner}',
                              style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: AppTheme.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}
