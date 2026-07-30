import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../widgets/status_chip.dart';

class AppDrawer extends ConsumerWidget {
  final UserModel? user;
  const AppDrawer({super.key, this.user});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canManageUsers = user?.canManageUsers ?? false;
    final isSuper = user?.isSuper ?? false;

    return Drawer(
      backgroundColor: AppTheme.bgSurface,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Header ─────────────────────────────────────────────
            Container(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          gradient: AppTheme.primaryGradient,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(Icons.water_drop_rounded, color: Colors.white, size: 22),
                      ),
                      const SizedBox(width: 12),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'AquaSmart',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                              color: AppTheme.textPrimary,
                            ),
                          ),
                          Text(
                            'Smart Aquaculture',
                            style: TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                          ),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ),

            const Divider(color: AppTheme.borderPrimary, height: 1),

            // ── Navigation ─────────────────────────────────────────
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 8),
                children: [
                  _sectionTitle('Utama'),
                  _navItem(context, Icons.home_rounded, 'Dashboard', '/'),
                  _navItem(context, Icons.water_rounded, 'Peternakan', '/farms'),
                  _navItem(context, Icons.notifications_rounded, 'Notifikasi', '/notifications'),

                  _sectionTitle('Hardware'),
                  _navItem(context, Icons.set_meal_rounded, 'Pakan Lele', '/lele-feeder'),
                  _navItem(context, Icons.sensors_rounded, 'Perangkat Air', '/water-devices'),
                  _navItem(context, Icons.videocam_rounded, 'CCTV', '/cctv'),
                  _navItem(context, Icons.device_hub_rounded, 'Perangkat', '/devices'),
                  _navItem(context, Icons.radio_rounded, 'MQTT Monitor', '/mqtt-monitor'),
                  _navItem(context, Icons.build_rounded, 'Uji Hardware', '/hardware-test'),
                  _navItem(context, Icons.upload_rounded, 'Firmware (OTA)', '/firmware'),

                  _sectionTitle('Tools'),
                  _navItem(context, Icons.play_arrow_rounded, 'Simulasi Dummy', '/simulation'),
                  _navItem(context, Icons.bar_chart_rounded, 'Grafana Analytics', '/analytics'),
                  _navItem(context, Icons.grid_view_rounded, 'Perbandingan Kolam', '/compare'),

                  if (canManageUsers) ...[
                    _sectionTitle('Administrasi'),
                    _navItem(context, Icons.people_rounded, 'Pengguna', '/users'),
                    _navItem(context, Icons.chat_rounded, 'Notifikasi WA', '/whatsapp'),
                    if (isSuper)
                      _navItem(context, Icons.storage_rounded, 'Database', '/database'),
                  ],
                ],
              ),
            ),

            const Divider(color: AppTheme.borderPrimary, height: 1),

            // ── User Profile ────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 38,
                        height: 38,
                        decoration: BoxDecoration(
                          gradient: AppTheme.primaryGradient,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Center(
                          child: Text(
                            user?.initial ?? '?',
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              user?.displayName ?? '',
                              style: const TextStyle(
                                fontWeight: FontWeight.w600,
                                fontSize: 13.5,
                                color: AppTheme.textPrimary,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              roleLabel[user?.role] ?? user?.role ?? '',
                              style: const TextStyle(
                                fontSize: 11.5,
                                color: AppTheme.textSecondary,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: () {
                        Navigator.pop(context);
                        ref.read(authProvider.notifier).logout();
                      },
                      icon: const Icon(Icons.logout_rounded, size: 16),
                      label: const Text('Keluar'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppTheme.danger,
                        side: const BorderSide(color: AppTheme.danger),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _sectionTitle(String title) => Padding(
        padding: const EdgeInsets.fromLTRB(8, 16, 8, 4),
        child: Text(
          title.toUpperCase(),
          style: const TextStyle(
            fontSize: 10.5,
            fontWeight: FontWeight.w700,
            color: AppTheme.textMuted,
            letterSpacing: 1,
          ),
        ),
      );

  Widget _navItem(BuildContext context, IconData icon, String label, String path) =>
      ListTile(
        leading: Icon(icon, size: 20, color: AppTheme.textSecondary),
        title: Text(label, style: const TextStyle(fontSize: 14, color: AppTheme.textPrimary)),
        contentPadding: const EdgeInsets.symmetric(horizontal: 8),
        dense: true,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        onTap: () {
          Navigator.pop(context);
          context.go(path);
        },
      );
}
