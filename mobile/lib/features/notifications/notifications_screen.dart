// ═══════════════════════════════════════════════════════════════
// Screen: Notifikasi
// ═══════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../shell_screen.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});
  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  List<NotificationModel> _notifs = [];
  bool _loading = true;
  bool _unreadOnly = false;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final n = await ref.read(apiClientProvider).getNotifications(
          unreadOnly: _unreadOnly, limit: 100);
      final count = await ref.read(apiClientProvider).getUnreadCount();
      if (mounted) {
        setState(() { _notifs = n; _loading = false; });
        ref.read(unreadCountProvider.notifier).state = count;
      }
    } catch (_) { if (mounted) setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifikasi'),
        actions: [
          Switch(
            value: _unreadOnly,
            onChanged: (v) { setState(() { _unreadOnly = v; _loading = true; }); _load(); },
          ),
          const SizedBox(width: 4),
          TextButton(
            onPressed: () async {
              await ref.read(apiClientProvider).markAllRead();
              _load();
            },
            child: const Text('Tandai Semua Dibaca',
                style: TextStyle(fontSize: 12, color: AppTheme.primary)),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _notifs.isEmpty
              ? const Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.notifications_none_rounded, size: 56, color: AppTheme.textMuted),
                      SizedBox(height: 12),
                      Text('Tidak ada notifikasi', style: TextStyle(color: AppTheme.textSecondary)),
                    ],
                  ),
                )
              : RefreshIndicator(
                  color: AppTheme.primary,
                  onRefresh: () async { setState(() => _loading = true); await _load(); },
                  child: ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: _notifs.length,
                    itemBuilder: (_, i) => _NotifItem(
                      notif: _notifs[i],
                      onRead: () async {
                        await ref.read(apiClientProvider).markRead(_notifs[i].id);
                        _load();
                      },
                    ),
                  ),
                ),
    );
  }
}

class _NotifItem extends StatelessWidget {
  final NotificationModel notif;
  final VoidCallback onRead;
  const _NotifItem({required this.notif, required this.onRead});

  @override
  Widget build(BuildContext context) {
    final color = AppTheme.severityColor(notif.type);
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: notif.isRead ? null : onRead,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: color.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  notif.type == 'critical' ? Icons.error_rounded :
                  notif.type == 'risk' ? Icons.warning_rounded :
                  notif.type == 'success' ? Icons.check_circle_rounded : Icons.info_rounded,
                  color: color, size: 20,
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
                            width: 7, height: 7,
                            margin: const EdgeInsets.only(right: 6, top: 2),
                            decoration: const BoxDecoration(color: AppTheme.primary, shape: BoxShape.circle),
                          ),
                        Expanded(child: Text(notif.title,
                            style: TextStyle(fontWeight: notif.isRead ? FontWeight.normal : FontWeight.w700, fontSize: 13))),
                      ],
                    ),
                    if (notif.pondName != null) ...[
                      const SizedBox(height: 2),
                      Text(notif.pondName!, style: const TextStyle(fontSize: 11, color: AppTheme.primary)),
                    ],
                    if (notif.message != null) ...[
                      const SizedBox(height: 4),
                      Text(notif.message!, style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary), maxLines: 3),
                    ],
                    if (notif.createdAt != null) ...[
                      const SizedBox(height: 4),
                      Text(DateFormat('dd MMM yyyy, HH:mm').format(notif.createdAt!),
                          style: const TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
