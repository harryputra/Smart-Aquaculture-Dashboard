import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

// ── Status / Severity Chip ────────────────────────────────────────

class StatusChip extends StatelessWidget {
  final String label;
  final Color? color;
  final IconData? icon;

  const StatusChip({
    super.key,
    required this.label,
    this.color,
    this.icon,
  });

  factory StatusChip.severity(String severity) {
    return StatusChip(
      label: _severityLabel(severity),
      color: AppTheme.severityColor(severity),
      icon: _severityIcon(severity),
    );
  }

  factory StatusChip.connected(bool connected) {
    return StatusChip(
      label: connected ? 'Terhubung' : 'Terputus',
      color: connected ? AppTheme.success : AppTheme.danger,
      icon: connected ? Icons.wifi : Icons.wifi_off,
    );
  }

  factory StatusChip.online(bool online) {
    return StatusChip(
      label: online ? 'Online' : 'Offline',
      color: online ? AppTheme.success : AppTheme.textMuted,
      icon: online ? Icons.circle : Icons.circle_outlined,
    );
  }

  factory StatusChip.deviceMode(String mode) {
    final isEsp = mode == 'esp32';
    return StatusChip(
      label: isEsp ? 'ESP32' : 'Dummy',
      color: isEsp ? AppTheme.success : AppTheme.warning,
      icon: isEsp ? Icons.memory_rounded : Icons.computer_rounded,
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = color ?? AppTheme.textSecondary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: c.withOpacity(0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: c.withOpacity(0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: c),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(fontSize: 11, color: c, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }

  static String _severityLabel(String s) => switch (s) {
        'critical' => 'Kritis',
        'risk' => 'Risiko',
        'info' => 'Info',
        'success' => 'Berhasil',
        _ => s,
      };

  static IconData _severityIcon(String s) => switch (s) {
        'critical' => Icons.error_rounded,
        'risk' => Icons.warning_rounded,
        'info' => Icons.info_rounded,
        'success' => Icons.check_circle_rounded,
        _ => Icons.circle,
      };
}

// ── Sensor Value Card ─────────────────────────────────────────────

class SensorCard extends StatelessWidget {
  final String label;
  final String? value;
  final String unit;
  final IconData icon;
  final Color? color;
  final bool? isAlert;

  const SensorCard({
    super.key,
    required this.label,
    this.value,
    required this.unit,
    required this.icon,
    this.color,
    this.isAlert,
  });

  @override
  Widget build(BuildContext context) {
    final c = isAlert == true ? AppTheme.danger : (color ?? AppTheme.primary);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isAlert == true ? AppTheme.danger.withOpacity(0.4) : AppTheme.borderPrimary,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: c.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(icon, size: 18, color: c),
              ),
              const Spacer(),
              if (isAlert == true)
                Icon(Icons.warning_rounded, size: 16, color: AppTheme.danger),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            label,
            style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary),
          ),
          const SizedBox(height: 4),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                value ?? '--',
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  color: isAlert == true ? AppTheme.danger : AppTheme.textPrimary,
                ),
              ),
              const SizedBox(width: 4),
              Padding(
                padding: const EdgeInsets.only(bottom: 3),
                child: Text(
                  unit,
                  style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Info Card ─────────────────────────────────────────────────────

class InfoCard extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;
  final Color color;
  final String? subtitle;

  const InfoCard({
    super.key,
    required this.title,
    required this.value,
    required this.icon,
    required this.color,
    this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.borderPrimary),
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: color.withOpacity(0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: color, size: 24),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                const SizedBox(height: 4),
                Text(value,
                    style: const TextStyle(
                        fontSize: 20, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
                if (subtitle != null)
                  Text(subtitle!,
                      style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Loading Shimmer ───────────────────────────────────────────────

class ShimmerBox extends StatelessWidget {
  final double width;
  final double height;
  final double borderRadius;

  const ShimmerBox({
    super.key,
    required this.width,
    required this.height,
    this.borderRadius = 8,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: AppTheme.bgCard,
        borderRadius: BorderRadius.circular(borderRadius),
      ),
    );
  }
}

// ── Error Widget ──────────────────────────────────────────────────

class ErrorRetryWidget extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const ErrorRetryWidget({super.key, required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline_rounded, size: 48, color: AppTheme.danger),
            const SizedBox(height: 12),
            Text(message, style: const TextStyle(color: AppTheme.textSecondary),
                textAlign: TextAlign.center),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Coba Lagi'),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Empty Widget ──────────────────────────────────────────────────

class EmptyWidget extends StatelessWidget {
  final String message;
  final IconData? icon;
  final Widget? action;

  const EmptyWidget({super.key, required this.message, this.icon, this.action});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon ?? Icons.inbox_rounded, size: 56, color: AppTheme.textMuted),
            const SizedBox(height: 16),
            Text(message,
                style: const TextStyle(color: AppTheme.textSecondary, fontSize: 14),
                textAlign: TextAlign.center),
            if (action != null) ...[const SizedBox(height: 16), action!],
          ],
        ),
      ),
    );
  }
}

// ── Section Header ────────────────────────────────────────────────

class SectionHeader extends StatelessWidget {
  final String title;
  final Widget? trailing;

  const SectionHeader({super.key, required this.title, this.trailing});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.textSecondary,
                  letterSpacing: 0.5),
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}
