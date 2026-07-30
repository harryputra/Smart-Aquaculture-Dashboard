import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/models.dart';
import '../../../core/theme/app_theme.dart';

class ControlTab extends ConsumerStatefulWidget {
  final PondModel pond;
  const ControlTab({super.key, required this.pond});
  @override
  ConsumerState<ControlTab> createState() => _ControlTabState();
}

class _ControlTabState extends ConsumerState<ControlTab> {
  AeratorStatus? _aerator;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _loadAerator();
  }

  Future<void> _loadAerator() async {
    try {
      final a = await ref.read(apiClientProvider).getAerator(widget.pond.pondId);
      if (mounted) setState(() => _aerator = a);
    } catch (_) {}
  }

  Future<void> _sendValve(String cmd) async {
    setState(() => _loading = true);
    try {
      await ref.read(apiClientProvider).controlValve(widget.pond.pondId, cmd);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Perintah dikirim'), backgroundColor: AppTheme.success),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: AppTheme.danger),
        );
      }
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _triggerDrainCycle() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Konfirmasi'),
        content: const Text('Mulai siklus kuras + isi ulang otomatis?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.warning),
            child: const Text('Ya, Mulai'),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    setState(() => _loading = true);
    try {
      await ref.read(apiClientProvider).triggerDrainCycle(widget.pond.pondId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Siklus drain-refill dimulai'), backgroundColor: AppTheme.success),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: AppTheme.danger),
        );
      }
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _setAeratorMode(String mode) async {
    try {
      await ref.read(apiClientProvider).setAerator(widget.pond.pondId, {'mode': mode});
      await _loadAerator();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Mode aerator diubah'), backgroundColor: AppTheme.success),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: AppTheme.danger),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Valve Control ────────────────────────────────────────
          const Text('Kontrol Katup Air', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: _ControlButton(
                          icon: Icons.open_in_new_rounded,
                          label: 'Buka Outlet',
                          color: AppTheme.warning,
                          onPressed: _loading ? null : () => _sendValve('open_valve'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _ControlButton(
                          icon: Icons.close_rounded,
                          label: 'Tutup Outlet',
                          color: AppTheme.primary,
                          onPressed: _loading ? null : () => _sendValve('close_valve'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: _ControlButton(
                          icon: Icons.water_drop_rounded,
                          label: 'Buka Inlet',
                          color: AppTheme.success,
                          onPressed: _loading ? null : () => _sendValve('open_inlet'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _ControlButton(
                          icon: Icons.block_rounded,
                          label: 'Tutup Inlet',
                          color: AppTheme.textSecondary,
                          onPressed: _loading ? null : () => _sendValve('close_inlet'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 20),

          // ── Auto Drain Cycle ─────────────────────────────────────
          const Text('Siklus Otomatis', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Kuras + Isi Ulang Otomatis',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Memulai siklus pengurasan diikuti pengisian air bersih secara otomatis.',
                    style: TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                  ),
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: _loading ? null : _triggerDrainCycle,
                      icon: const Icon(Icons.autorenew_rounded),
                      label: const Text('Mulai Siklus'),
                      style: ElevatedButton.styleFrom(backgroundColor: AppTheme.warning),
                    ),
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 20),

          // ── Aerator Control ──────────────────────────────────────
          const Text('Kontrol Aerator', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          if (_aerator != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            color: (_aerator!.aeratorOn == true ? AppTheme.success : AppTheme.textMuted)
                                .withOpacity(0.12),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Icon(Icons.air_rounded,
                              color: _aerator!.aeratorOn == true ? AppTheme.success : AppTheme.textMuted),
                        ),
                        const SizedBox(width: 12),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Status: ${_aerator!.aeratorOn == true ? "AKTIF" : "MATI"}',
                              style: TextStyle(
                                  fontWeight: FontWeight.w600,
                                  color: _aerator!.aeratorOn == true ? AppTheme.success : AppTheme.textMuted),
                            ),
                            Text('Mode: ${_aerator!.mode.toUpperCase()}',
                                style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        Expanded(
                          child: _ModeButton(
                            label: 'Auto',
                            selected: _aerator!.mode == 'auto',
                            onTap: () => _setAeratorMode('auto'),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: _ModeButton(
                            label: 'Manual ON',
                            selected: _aerator!.mode == 'manual',
                            onTap: () => _setAeratorMode('manual'),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: _ModeButton(
                            label: 'Mati',
                            selected: _aerator!.mode == 'off',
                            onTap: () => _setAeratorMode('off'),
                          ),
                        ),
                      ],
                    ),
                    if (_aerator!.doOn != null) ...[
                      const SizedBox(height: 12),
                      const Divider(),
                      const SizedBox(height: 8),
                      Text('DO ON ≥ ${_aerator!.doOn} mg/L | DO OFF ≤ ${_aerator!.doOff} mg/L',
                          style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                    ],
                  ],
                ),
              ),
            )
          else
            const Card(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Center(
                  child: CircularProgressIndicator(),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _ControlButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback? onPressed;
  const _ControlButton({required this.icon, required this.label, required this.color, this.onPressed});

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: onPressed,
      icon: Icon(icon, size: 18, color: color),
      label: Text(label, style: TextStyle(color: color, fontSize: 12)),
      style: OutlinedButton.styleFrom(
        side: BorderSide(color: color.withOpacity(0.5)),
        padding: const EdgeInsets.symmetric(vertical: 12),
      ),
    );
  }
}

class _ModeButton extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _ModeButton({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: selected ? AppTheme.primary.withOpacity(0.2) : AppTheme.bgInput,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: selected ? AppTheme.primary : AppTheme.borderPrimary),
        ),
        child: Center(
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: selected ? AppTheme.primary : AppTheme.textSecondary,
            ),
          ),
        ),
      ),
    );
  }
}
