import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/status_chip.dart';

// ── Dashboard Data Provider ────────────────────────────────────────

final dashboardSummaryProvider = FutureProvider<DashboardSummary>((ref) async {
  return ref.read(apiClientProvider).getDashboardSummary();
});

final recentNotificationsProvider = FutureProvider<List<NotificationModel>>((ref) async {
  return ref.read(apiClientProvider).getNotifications(limit: 5);
});

final recentPondsProvider = FutureProvider<List<PondModel>>((ref) async {
  return ref.read(apiClientProvider).getPonds();
});

// ── Dashboard Screen ───────────────────────────────────────────────

class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});
  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final summaryAsync = ref.watch(dashboardSummaryProvider);
    final pondsAsync = ref.watch(recentPondsProvider);
    final notifsAsync = ref.watch(recentNotificationsProvider);

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Dashboard', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            Text(
              'Selamat datang, ${user?.displayName ?? ''}',
              style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary, fontWeight: FontWeight.normal),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () {
              ref.invalidate(dashboardSummaryProvider);
              ref.invalidate(recentPondsProvider);
              ref.invalidate(recentNotificationsProvider);
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        color: AppTheme.primary,
        onRefresh: () async {
          ref.invalidate(dashboardSummaryProvider);
          ref.invalidate(recentPondsProvider);
          ref.invalidate(recentNotificationsProvider);
        },
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── Summary Cards ──────────────────────────────────
              summaryAsync.when(
                data: (s) => _SummaryGrid(summary: s),
                loading: () => _ShimmerGrid(),
                error: (e, _) => _ErrorCard(e.toString()),
              ),

              const SizedBox(height: 24),

              // ── Recent Ponds ───────────────────────────────────
              Row(
                children: [
                  const Expanded(
                    child: Text('Kolam Terkini',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                  ),
                  TextButton(
                    onPressed: () => context.go('/farms'),
                    child: const Text('Lihat Semua'),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              pondsAsync.when(
                data: (ponds) => _RecentPondsList(ponds: ponds.take(5).toList()),
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => _ErrorCard(e.toString()),
              ),

              const SizedBox(height: 24),

              // ── Recent Notifications ───────────────────────────
              Row(
                children: [
                  const Expanded(
                    child: Text('Notifikasi Terbaru',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                  ),
                  TextButton(
                    onPressed: () => context.go('/notifications'),
                    child: const Text('Lihat Semua'),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              notifsAsync.when(
                data: (notifs) => notifs.isEmpty
                    ? const _EmptyNotif()
                    : Column(
                        children: notifs.map((n) => _NotifCard(notif: n)).toList(),
                      ),
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => _ErrorCard(e.toString()),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Summary Grid ──────────────────────────────────────────────────

class _SummaryGrid extends StatelessWidget {
  final DashboardSummary summary;
  const _SummaryGrid({required this.summary});

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 12,
      mainAxisSpacing: 12,
      childAspectRatio: 1.6,
      children: [
        InfoCard(
          title: 'Total Peternakan',
          value: summary.totalFarms.toString(),
          icon: Icons.location_on_rounded,
          color: AppTheme.primary,
        ),
        InfoCard(
          title: 'Total Kolam',
          value: summary.totalPonds.toString(),
          icon: Icons.water_rounded,
          color: AppTheme.info,
        ),
        InfoCard(
          title: 'Perangkat Online',
          value: summary.connectedDevices.toString(),
          icon: Icons.wifi_rounded,
          color: AppTheme.success,
        ),
        InfoCard(
          title: 'Pemberian Pakan 24j',
          value: summary.feedings24h.toString(),
          icon: Icons.set_meal_rounded,
          color: AppTheme.accent,
        ),
        InfoCard(
          title: 'Kematian 30 Hari',
          value: summary.deaths30d.toString(),
          icon: Icons.warning_rounded,
          color: summary.deaths30d > 0 ? AppTheme.danger : AppTheme.success,
        ),
        InfoCard(
          title: 'Notif Belum Baca',
          value: summary.unreadNotifications.toString(),
          icon: Icons.notifications_rounded,
          color: summary.unreadNotifications > 0 ? AppTheme.warning : AppTheme.success,
        ),
      ],
    );
  }
}

class _ShimmerGrid extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 12,
      mainAxisSpacing: 12,
      childAspectRatio: 1.6,
      children: List.generate(6, (_) => Container(
        decoration: BoxDecoration(
          color: AppTheme.bgCard,
          borderRadius: BorderRadius.circular(16),
        ),
      )),
    );
  }
}

// ── Recent Ponds List ─────────────────────────────────────────────

class _RecentPondsList extends StatelessWidget {
  final List<PondModel> ponds;
  const _RecentPondsList({required this.ponds});

  @override
  Widget build(BuildContext context) {
    if (ponds.isEmpty) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(20),
          child: Center(child: Text('Belum ada kolam', style: TextStyle(color: AppTheme.textSecondary))),
        ),
      );
    }
    return Column(
      children: ponds.map((p) => _PondListItem(pond: p)).toList(),
    );
  }
}

class _PondListItem extends StatelessWidget {
  final PondModel pond;
  const _PondListItem({required this.pond});

  @override
  Widget build(BuildContext context) {
    final sensor = pond.latestSensor;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => context.push('/ponds/${pond.pondId}'),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: (pond.isConnected == true ? AppTheme.primary : AppTheme.textMuted)
                      .withOpacity(0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  Icons.water_rounded,
                  color: pond.isConnected == true ? AppTheme.primary : AppTheme.textMuted,
                  size: 24,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(pond.name,
                              style: const TextStyle(
                                  fontWeight: FontWeight.w600, fontSize: 14)),
                        ),
                        StatusChip.connected(pond.isConnected ?? false),
                      ],
                    ),
                    const SizedBox(height: 4),
                    if (sensor != null)
                      Text(
                        '🌡 ${sensor.temperature?.toStringAsFixed(1) ?? '--'}°C  '
                        '💧 ${sensor.dissolvedOxygen?.toStringAsFixed(1) ?? '--'} mg/L  '
                        '📊 pH ${sensor.ph?.toStringAsFixed(1) ?? '--'}',
                        style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary),
                      )
                    else
                      Text(
                        pond.fishType ?? 'Tidak ada data sensor',
                        style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary),
                      ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: AppTheme.textMuted, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Notification Card ─────────────────────────────────────────────

class _NotifCard extends StatelessWidget {
  final NotificationModel notif;
  const _NotifCard({required this.notif});

  @override
  Widget build(BuildContext context) {
    final color = AppTheme.severityColor(notif.type);
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: color.withOpacity(0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(
                notif.type == 'critical' ? Icons.error_rounded :
                notif.type == 'risk' ? Icons.warning_rounded :
                notif.type == 'success' ? Icons.check_circle_rounded :
                Icons.info_rounded,
                color: color,
                size: 20,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      if (!notif.isRead)
                        Container(
                          width: 6,
                          height: 6,
                          margin: const EdgeInsets.only(right: 6, top: 2),
                          decoration: const BoxDecoration(
                            color: AppTheme.primary,
                            shape: BoxShape.circle,
                          ),
                        ),
                      Expanded(
                        child: Text(
                          notif.title,
                          style: TextStyle(
                            fontWeight: notif.isRead ? FontWeight.normal : FontWeight.w600,
                            fontSize: 13,
                          ),
                        ),
                      ),
                    ],
                  ),
                  if (notif.pondName != null) ...[
                    const SizedBox(height: 2),
                    Text(notif.pondName!,
                        style: const TextStyle(fontSize: 11, color: AppTheme.primary)),
                  ],
                  if (notif.message != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      notif.message!,
                      style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorCard extends StatelessWidget {
  final String message;
  const _ErrorCard(this.message);
  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Text('Error: $message', style: const TextStyle(color: AppTheme.danger)),
        ),
      );
}

class _EmptyNotif extends StatelessWidget {
  const _EmptyNotif();
  @override
  Widget build(BuildContext context) => const Card(
        child: Padding(
          padding: EdgeInsets.all(20),
          child: Center(
            child: Text('Tidak ada notifikasi', style: TextStyle(color: AppTheme.textSecondary)),
          ),
        ),
      );
}
