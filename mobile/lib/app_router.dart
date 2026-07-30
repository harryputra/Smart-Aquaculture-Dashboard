import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/auth/auth_provider.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/quick_login_screen.dart';
import 'features/dashboard/dashboard_screen.dart';
import 'features/farms/farms_screen.dart';
import 'features/farms/farm_detail_screen.dart';
import 'features/ponds/pond_detail_screen.dart';
import 'features/notifications/notifications_screen.dart';
import 'features/water/water_devices_screen.dart';
import 'features/cctv/cctv_screen.dart' show CctvScreen;
import 'features/all_screens.dart';
import 'shell_screen.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();
final _shellNavigatorKey = GlobalKey<NavigatorState>();

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authProvider);

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/',
    redirect: (context, state) {
      // Masih loading auth state
      if (authState.loading) return null;

      final isLoggedIn = authState.isAuthenticated;
      final isAuthRoute = state.matchedLocation.startsWith('/login') ||
          state.matchedLocation.startsWith('/q/');

      if (!isLoggedIn && !isAuthRoute) return '/login';
      if (isLoggedIn && isAuthRoute) return '/';
      return null;
    },
    routes: [
      // ── Auth Routes (tanpa shell) ────────────────────────────────
      GoRoute(
        path: '/login',
        builder: (ctx, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/q/:token',
        builder: (ctx, state) => QuickLoginScreen(
          token: state.pathParameters['token'] ?? '',
        ),
      ),

      // ── Main Shell (dengan bottom nav) ────────────────────────────
      ShellRoute(
        navigatorKey: _shellNavigatorKey,
        builder: (ctx, state, child) => ShellScreen(child: child),
        routes: [
          GoRoute(
            path: '/',
            pageBuilder: (ctx, state) => const NoTransitionPage(
              child: DashboardScreen(),
            ),
          ),
          GoRoute(
            path: '/farms',
            pageBuilder: (ctx, state) => const NoTransitionPage(
              child: FarmsScreen(),
            ),
          ),
          GoRoute(
            path: '/notifications',
            pageBuilder: (ctx, state) => const NoTransitionPage(
              child: NotificationsScreen(),
            ),
          ),
          GoRoute(
            path: '/lele-feeder',
            pageBuilder: (ctx, state) => const NoTransitionPage(
              child: FeederScreen(),
            ),
          ),
          GoRoute(
            path: '/water-devices',
            pageBuilder: (ctx, state) => const NoTransitionPage(
              child: WaterDevicesScreen(),
            ),
          ),
          GoRoute(
            path: '/more',
            pageBuilder: (ctx, state) => const NoTransitionPage(
              child: MoreScreen(),
            ),
          ),
        ],
      ),

      // ── Detail Routes (full screen, tanpa bottom nav) ─────────────
      GoRoute(
        path: '/farms/:farmId',
        builder: (ctx, state) => FarmDetailScreen(
          farmId: state.pathParameters['farmId'] ?? '',
        ),
      ),
      GoRoute(
        path: '/ponds/:pondId',
        builder: (ctx, state) => PondDetailScreen(
          pondId: state.pathParameters['pondId'] ?? '',
        ),
      ),
      GoRoute(
        path: '/ponds/:pondId/tab/:tab',
        builder: (ctx, state) => PondDetailScreen(
          pondId: state.pathParameters['pondId'] ?? '',
          initialTab: int.tryParse(state.pathParameters['tab'] ?? '0') ?? 0,
        ),
      ),
      GoRoute(
        path: '/cctv',
        builder: (ctx, state) => const CctvScreen(),
      ),
      GoRoute(
        path: '/devices',
        builder: (ctx, state) => const DevicesScreen(),
      ),
      GoRoute(
        path: '/mqtt-monitor',
        builder: (ctx, state) => const MqttMonitorScreen(),
      ),
      GoRoute(
        path: '/hardware-test',
        builder: (ctx, state) => const HardwareTestScreen(),
      ),
      GoRoute(
        path: '/firmware',
        builder: (ctx, state) => const FirmwareScreen(),
      ),
      GoRoute(
        path: '/simulation',
        builder: (ctx, state) => const SimulationScreen(),
      ),
      GoRoute(
        path: '/analytics',
        builder: (ctx, state) => const GrafanaScreen(),
      ),
      GoRoute(
        path: '/compare',
        builder: (ctx, state) => const CompareScreen(),
      ),
      GoRoute(
        path: '/whatsapp',
        builder: (ctx, state) => const WhatsAppScreen(),
      ),
      GoRoute(
        path: '/users',
        builder: (ctx, state) => const UsersScreen(),
      ),
      GoRoute(
        path: '/database',
        builder: (ctx, state) => const DatabaseScreen(),
      ),
    ],
  );
});

// ── More Screen Placeholder ───────────────────────────────────────
// Placeholder untuk navigasi "Lainnya" di bottom nav
class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key});
  @override
  Widget build(BuildContext context) => const SizedBox();
}
