import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'core/auth/auth_provider.dart';
import 'core/models/models.dart';
import 'core/theme/app_theme.dart';
import 'shared/widgets/app_drawer.dart';

// ── Unread notification count provider ────────────────────────────
final unreadCountProvider = StateProvider<int>((ref) => 0);

// ── Shell Screen (Bottom Nav + Drawer) ───────────────────────────

class ShellScreen extends ConsumerStatefulWidget {
  final Widget child;
  const ShellScreen({super.key, required this.child});

  @override
  ConsumerState<ShellScreen> createState() => _ShellScreenState();
}

class _ShellScreenState extends ConsumerState<ShellScreen> {
  int _selectedIndex = 0;

  static const _destinations = [
    _NavDest(path: '/', icon: Icons.home_rounded, label: 'Beranda'),
    _NavDest(path: '/farms', icon: Icons.water_rounded, label: 'Peternakan'),
    _NavDest(path: '/notifications', icon: Icons.notifications_rounded, label: 'Notifikasi'),
    _NavDest(path: '/lele-feeder', icon: Icons.set_meal_rounded, label: 'Pakan'),
    _NavDest(path: '/more', icon: Icons.menu_rounded, label: 'Lainnya'),
  ];

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final unreadCount = ref.watch(unreadCountProvider);

    return Scaffold(
      drawer: AppDrawer(user: user),
      body: widget.child,
      bottomNavigationBar: _buildBottomNav(context, unreadCount),
    );
  }

  Widget _buildBottomNav(BuildContext context, int unreadCount) {
    return Container(
      decoration: const BoxDecoration(
        color: AppTheme.bgSurface,
        border: Border(top: BorderSide(color: AppTheme.borderPrimary, width: 1)),
      ),
      child: SafeArea(
        child: SizedBox(
          height: 60,
          child: Row(
            children: List.generate(_destinations.length, (i) {
              final dest = _destinations[i];
              final isSelected = _selectedIndex == i;
              final hasNotif = dest.path == '/notifications' && unreadCount > 0;

              return Expanded(
                child: InkWell(
                  onTap: () {
                    if (dest.path == '/more') {
                      Scaffold.of(context).openDrawer();
                      return;
                    }
                    setState(() => _selectedIndex = i);
                    context.go(dest.path);
                  },
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Stack(
                        clipBehavior: Clip.none,
                        children: [
                          Icon(
                            dest.icon,
                            size: 24,
                            color: isSelected ? AppTheme.primary : AppTheme.textSecondary,
                          ),
                          if (hasNotif)
                            Positioned(
                              right: -6,
                              top: -6,
                              child: Container(
                                padding: const EdgeInsets.all(2),
                                decoration: const BoxDecoration(
                                  color: AppTheme.danger,
                                  shape: BoxShape.circle,
                                ),
                                constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                                child: Text(
                                  unreadCount > 99 ? '99+' : unreadCount.toString(),
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 9,
                                    fontWeight: FontWeight.bold,
                                  ),
                                  textAlign: TextAlign.center,
                                ),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        dest.label,
                        style: TextStyle(
                          fontSize: 10,
                          color: isSelected ? AppTheme.primary : AppTheme.textSecondary,
                          fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }),
          ),
        ),
      ),
    );
  }
}

class _NavDest {
  final String path;
  final IconData icon;
  final String label;
  const _NavDest({required this.path, required this.icon, required this.label});
}
