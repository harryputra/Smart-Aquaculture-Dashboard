import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/status_chip.dart';
import 'tabs/monitor_tab.dart';
import 'tabs/control_tab.dart';
import 'tabs/pond_tabs.dart';

// ── Pond Provider ─────────────────────────────────────────────────

final pondDetailProvider = FutureProvider.family<PondModel, String>((ref, pondId) async {
  return ref.read(apiClientProvider).getPond(pondId);
});

// ── Pond Detail Screen ────────────────────────────────────────────

class PondDetailScreen extends ConsumerStatefulWidget {
  final String pondId;
  final int initialTab;
  const PondDetailScreen({super.key, required this.pondId, this.initialTab = 0});

  @override
  ConsumerState<PondDetailScreen> createState() => _PondDetailScreenState();
}

class _PondDetailScreenState extends ConsumerState<PondDetailScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  static const _tabs = [
    (icon: Icons.monitor_rounded, label: 'Monitor'),
    (icon: Icons.toggle_on_rounded, label: 'Kontrol'),
    (icon: Icons.refresh_rounded, label: 'Siklus'),
    (icon: Icons.set_meal_rounded, label: 'Pakan'),
    (icon: Icons.warning_rounded, label: 'Mortalitas'),
    (icon: Icons.attach_money_rounded, label: 'Keuangan'),
    (icon: Icons.book_rounded, label: 'Logbook'),
    (icon: Icons.settings_rounded, label: 'Setelan'),
  ];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(
      length: _tabs.length,
      vsync: this,
      initialIndex: widget.initialTab.clamp(0, _tabs.length - 1),
    );
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pondAsync = ref.watch(pondDetailProvider(widget.pondId));

    return Scaffold(
      appBar: AppBar(
        title: pondAsync.when(
          data: (p) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(p.name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              Row(
                children: [
                  StatusChip.connected(p.isConnected ?? false),
                  const SizedBox(width: 6),
                  StatusChip.deviceMode(p.deviceMode),
                ],
              ),
            ],
          ),
          loading: () => const Text('Memuat...'),
          error: (_, __) => const Text('Detail Kolam'),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () => ref.invalidate(pondDetailProvider(widget.pondId)),
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          tabs: _tabs
              .map((t) => Tab(
                    icon: Icon(t.icon, size: 16),
                    text: t.label,
                    iconMargin: const EdgeInsets.only(bottom: 2),
                  ))
              .toList(),
        ),
      ),
      body: pondAsync.when(
        data: (pond) => TabBarView(
          controller: _tabController,
          children: [
            MonitorTab(pond: pond),
            ControlTab(pond: pond),
            CycleTab(pond: pond),
            FeedingTab(pond: pond),
            MortalityTab(pond: pond),
            FinancialTab(pond: pond),
            LogbookTab(pond: pond),
            SettingsTab(pond: pond),
          ],
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, color: AppTheme.danger, size: 48),
              const SizedBox(height: 8),
              Text('Error: $e', style: const TextStyle(color: AppTheme.danger)),
              ElevatedButton(
                onPressed: () => ref.invalidate(pondDetailProvider(widget.pondId)),
                child: const Text('Coba Lagi'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
