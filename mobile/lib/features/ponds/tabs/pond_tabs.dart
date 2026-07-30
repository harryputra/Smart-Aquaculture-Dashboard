// ═══════════════════════════════════════════════════════════════
// Tab stubs – semua fitur ada, UI lengkap akan dikembangkan
// File ini menggabungkan: cycle_tab, feeding_tab, mortality_tab,
// financial_tab, logbook_tab, settings_tab
// ═══════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/models.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/status_chip.dart';

// ── CYCLE TAB ─────────────────────────────────────────────────────

class CycleTab extends ConsumerStatefulWidget {
  final PondModel pond;
  const CycleTab({super.key, required this.pond});
  @override
  ConsumerState<CycleTab> createState() => _CycleTabState();
}

class _CycleTabState extends ConsumerState<CycleTab> {
  PondCycle? _cycle;
  List<PondCycle> _history = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final cycle = await ref.read(apiClientProvider).getActiveCycle(widget.pond.pondId);
      final history = await ref.read(apiClientProvider).getCycles(widget.pond.pondId);
      if (mounted) setState(() { _cycle = cycle; _history = history; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_cycle != null && _cycle!.status == 'active') ...[
            _ActiveCycleCard(cycle: _cycle!, pondId: widget.pond.pondId, onRefresh: _load),
          ] else ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    const Icon(Icons.info_rounded, color: AppTheme.textMuted, size: 40),
                    const SizedBox(height: 10),
                    const Text('Tidak ada siklus aktif',
                        style: TextStyle(color: AppTheme.textSecondary)),
                    const SizedBox(height: 14),
                    ElevatedButton.icon(
                      onPressed: () => _showStartCycleDialog(context),
                      icon: const Icon(Icons.play_arrow_rounded),
                      label: const Text('Mulai Siklus Baru'),
                    ),
                  ],
                ),
              ),
            ),
          ],

          if (_history.isNotEmpty) ...[
            const SizedBox(height: 20),
            const Text('Riwayat Siklus',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            ..._history.where((c) => c.status != 'active').map((c) => _CycleHistoryItem(cycle: c)),
          ],
        ],
      ),
    );
  }

  void _showStartCycleDialog(BuildContext context) {
    final countCtrl = TextEditingController(text: '1000');
    final sizeCtrl = TextEditingController(text: 'Benih 5cm');
    final sourceCtrl = TextEditingController(text: 'Pembenihan lokal');
    final notesCtrl = TextEditingController();

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Mulai Siklus Budidaya'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: countCtrl,
                  decoration: const InputDecoration(labelText: 'Jumlah Tebar'),
                  keyboardType: TextInputType.number),
              const SizedBox(height: 12),
              TextField(controller: sizeCtrl,
                  decoration: const InputDecoration(labelText: 'Ukuran Benih')),
              const SizedBox(height: 12),
              TextField(controller: sourceCtrl,
                  decoration: const InputDecoration(labelText: 'Sumber Benih')),
              const SizedBox(height: 12),
              TextField(controller: notesCtrl,
                  decoration: const InputDecoration(labelText: 'Catatan'),
                  maxLines: 2),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Batal')),
          ElevatedButton(
            onPressed: () async {
              try {
                await ref.read(apiClientProvider).startCycle(widget.pond.pondId, {
                  'stock_count': int.tryParse(countCtrl.text) ?? 0,
                  'fish_size': sizeCtrl.text,
                  'fish_source': sourceCtrl.text,
                  'notes': notesCtrl.text,
                });
                await _load();
                if (ctx.mounted) Navigator.pop(ctx);
              } catch (e) {
                if (ctx.mounted) {
                  ScaffoldMessenger.of(ctx).showSnackBar(
                    SnackBar(content: Text('Error: $e'), backgroundColor: AppTheme.danger),
                  );
                }
              }
            },
            child: const Text('Mulai'),
          ),
        ],
      ),
    );
  }
}

class _ActiveCycleCard extends StatelessWidget {
  final PondCycle cycle;
  final String pondId;
  final VoidCallback onRefresh;
  const _ActiveCycleCard({required this.cycle, required this.pondId, required this.onRefresh});

  @override
  Widget build(BuildContext context) {
    final days = cycle.startDate != null
        ? DateTime.now().difference(cycle.startDate!).inDays
        : 0;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const Icon(Icons.circle, color: AppTheme.success, size: 10),
              const SizedBox(width: 8),
              const Text('Siklus Aktif',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            ]),
            const SizedBox(height: 14),
            _InfoRow('Hari ke-', '$days hari'),
            _InfoRow('Tebar', '${cycle.stockCount ?? '--'} ekor'),
            _InfoRow('Ukuran Benih', cycle.fishSize ?? '--'),
            _InfoRow('Sumber', cycle.fishSource ?? '--'),
            if (cycle.startDate != null)
              _InfoRow('Tanggal Tebar', DateFormat('dd MMM yyyy').format(cycle.startDate!)),
          ],
        ),
      ),
    );
  }
}

class _CycleHistoryItem extends StatelessWidget {
  final PondCycle cycle;
  const _CycleHistoryItem({required this.cycle});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: StatusChip(
          label: cycle.status == 'harvested' ? 'Panen' : 'Dibatalkan',
          color: cycle.status == 'harvested' ? AppTheme.success : AppTheme.textMuted,
        ),
        title: Text('${cycle.stockCount ?? 0} ekor tebar'),
        subtitle: cycle.startDate != null
            ? Text(DateFormat('dd MMM yyyy').format(cycle.startDate!))
            : null,
      ),
    );
  }
}

Widget _InfoRow(String label, String value) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(
            width: 130,
            child: Text(label, style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
          ),
          Expanded(
            child: Text(value,
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
          ),
        ],
      ),
    );

// ── FEEDING TAB ────────────────────────────────────────────────────

class FeedingTab extends ConsumerStatefulWidget {
  final PondModel pond;
  const FeedingTab({super.key, required this.pond});
  @override
  ConsumerState<FeedingTab> createState() => _FeedingTabState();
}

class _FeedingTabState extends ConsumerState<FeedingTab> {
  List<FeedingLog> _logs = [];
  List<FeedingSchedule> _schedules = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final logs = await ref.read(apiClientProvider).getFeedingLogs(widget.pond.pondId);
      final schedules = await ref.read(apiClientProvider).getFeedingSchedules(pondId: widget.pond.pondId);
      if (mounted) setState(() { _logs = logs; _schedules = schedules; _loading = false; });
    } catch (_) { if (mounted) setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Quick record feeding
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Catat Pemberian Pakan',
                      style: TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 12),
                  ElevatedButton.icon(
                    onPressed: () => _showFeedingDialog(context),
                    icon: const Icon(Icons.add_rounded),
                    label: const Text('Tambah Catatan'),
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 20),
          Row(
            children: [
              const Expanded(
                  child: Text('Jadwal Pakan',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700))),
              IconButton(
                icon: const Icon(Icons.add_circle_rounded, color: AppTheme.primary),
                onPressed: () => _showScheduleDialog(context),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (_schedules.isEmpty)
            const Text('Belum ada jadwal', style: TextStyle(color: AppTheme.textSecondary))
          else
            ..._schedules.map((s) => Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    leading: const Icon(Icons.schedule_rounded, color: AppTheme.primary),
                    title: Text('${s.scheduleTime} – ${s.feedAmountKg} kg'),
                    subtitle: Text(s.feedType ?? ''),
                    trailing: IconButton(
                      icon: const Icon(Icons.delete_rounded, color: AppTheme.danger, size: 20),
                      onPressed: () async {
                        await ref.read(apiClientProvider).deleteFeedingSchedule(s.id);
                        _load();
                      },
                    ),
                  ),
                )),

          const SizedBox(height: 20),
          const Text('Log Pemberian Pakan',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          if (_logs.isEmpty)
            const Text('Belum ada log', style: TextStyle(color: AppTheme.textSecondary))
          else
            ..._logs.map((l) => Card(
                  margin: const EdgeInsets.only(bottom: 6),
                  child: ListTile(
                    leading: const Icon(Icons.set_meal_rounded, color: AppTheme.success),
                    title: Text('${l.feedAmountKg} kg – ${l.feedType ?? "Pakan"}'),
                    subtitle: Text(
                      l.timestamp != null ? DateFormat('dd MMM HH:mm').format(l.timestamp!) : '',
                      style: const TextStyle(fontSize: 11),
                    ),
                    trailing: Text(l.triggeredBy ?? '', style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
                  ),
                )),
        ],
      ),
    );
  }

  void _showFeedingDialog(BuildContext context) {
    final amountCtrl = TextEditingController(text: '0.5');
    final typeCtrl = TextEditingController(text: 'Pelet');
    final noteCtrl = TextEditingController();

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Catat Pemberian Pakan'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: amountCtrl,
                decoration: const InputDecoration(labelText: 'Jumlah (kg)'),
                keyboardType: TextInputType.number),
            const SizedBox(height: 12),
            TextField(controller: typeCtrl,
                decoration: const InputDecoration(labelText: 'Jenis Pakan')),
            const SizedBox(height: 12),
            TextField(controller: noteCtrl,
                decoration: const InputDecoration(labelText: 'Catatan')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Batal')),
          ElevatedButton(
            onPressed: () async {
              try {
                await ref.read(apiClientProvider).recordFeeding({
                  'pond_id': widget.pond.pondId,
                  'feed_amount_kg': double.tryParse(amountCtrl.text) ?? 0,
                  'feed_type': typeCtrl.text,
                  'note': noteCtrl.text,
                });
                await _load();
                if (ctx.mounted) Navigator.pop(ctx);
              } catch (e) {
                if (ctx.mounted) ScaffoldMessenger.of(ctx).showSnackBar(
                    SnackBar(content: Text('Error: $e'), backgroundColor: AppTheme.danger));
              }
            },
            child: const Text('Simpan'),
          ),
        ],
      ),
    );
  }

  void _showScheduleDialog(BuildContext context) {
    final timeCtrl = TextEditingController(text: '07:00');
    final amountCtrl = TextEditingController(text: '0.5');
    final typeCtrl = TextEditingController(text: 'Pelet');

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Tambah Jadwal Pakan'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: timeCtrl,
                decoration: const InputDecoration(labelText: 'Waktu (HH:MM)')),
            const SizedBox(height: 12),
            TextField(controller: amountCtrl,
                decoration: const InputDecoration(labelText: 'Jumlah (kg)'),
                keyboardType: TextInputType.number),
            const SizedBox(height: 12),
            TextField(controller: typeCtrl,
                decoration: const InputDecoration(labelText: 'Jenis Pakan')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Batal')),
          ElevatedButton(
            onPressed: () async {
              try {
                await ref.read(apiClientProvider).createFeedingSchedule({
                  'pond_id': widget.pond.pondId,
                  'schedule_time': timeCtrl.text.contains(':') ? '${timeCtrl.text}:00' : timeCtrl.text,
                  'schedule_days': '1,2,3,4,5,6,7',
                  'feed_amount_kg': double.tryParse(amountCtrl.text) ?? 0,
                  'feed_type': typeCtrl.text,
                });
                await _load();
                if (ctx.mounted) Navigator.pop(ctx);
              } catch (e) {
                if (ctx.mounted) ScaffoldMessenger.of(ctx).showSnackBar(
                    SnackBar(content: Text('Error: $e'), backgroundColor: AppTheme.danger));
              }
            },
            child: const Text('Simpan'),
          ),
        ],
      ),
    );
  }
}

// ── MORTALITY TAB ─────────────────────────────────────────────────

class MortalityTab extends ConsumerStatefulWidget {
  final PondModel pond;
  const MortalityTab({super.key, required this.pond});
  @override
  ConsumerState<MortalityTab> createState() => _MortalityTabState();
}

class _MortalityTabState extends ConsumerState<MortalityTab> {
  List<MortalityRecord> _records = [];
  Map<String, dynamic>? _summary;
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final records = await ref.read(apiClientProvider).getMortality(widget.pond.pondId);
      final summary = await ref.read(apiClientProvider).getMortalitySummary(widget.pond.pondId);
      if (mounted) setState(() { _records = records; _summary = summary; _loading = false; });
    } catch (_) { if (mounted) setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());

    final totalDeath = _summary?['total_deaths'] ?? 0;
    final fishCount = _summary?['fish_count'] ?? 0;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Summary
          Row(
            children: [
              Expanded(
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      children: [
                        const Text('Total Kematian', style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                        const SizedBox(height: 4),
                        Text('$totalDeath',
                            style: TextStyle(
                                fontSize: 28,
                                fontWeight: FontWeight.w800,
                                color: totalDeath > 0 ? AppTheme.danger : AppTheme.success)),
                        const Text('ekor', style: TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      children: [
                        const Text('Estimasi Panen', style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                        const SizedBox(height: 4),
                        Text('${_summary?['estimated_harvest'] ?? fishCount}',
                            style: const TextStyle(
                                fontSize: 28, fontWeight: FontWeight.w800, color: AppTheme.success)),
                        const Text('ekor', style: TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 16),
          Row(
            children: [
              const Expanded(child: Text('Catatan Kematian',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700))),
              ElevatedButton.icon(
                onPressed: () => _showAddDialog(context),
                icon: const Icon(Icons.add_rounded, size: 16),
                label: const Text('Catat'),
                style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.danger, padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8)),
              ),
            ],
          ),
          const SizedBox(height: 12),

          if (_records.isEmpty)
            const Center(child: Text('Belum ada catatan kematian', style: TextStyle(color: AppTheme.textSecondary)))
          else
            ..._records.map((r) => Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    leading: Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: AppTheme.danger.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Center(
                        child: Text('${r.deathCount}',
                            style: const TextStyle(
                                fontWeight: FontWeight.bold, color: AppTheme.danger)),
                      ),
                    ),
                    title: Text(r.cause ?? 'Penyebab tidak diketahui'),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (r.note != null && r.note!.isNotEmpty) Text(r.note!),
                        if (r.recordedAt != null)
                          Text(DateFormat('dd MMM yyyy HH:mm').format(r.recordedAt!),
                              style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
                      ],
                    ),
                    trailing: IconButton(
                      icon: const Icon(Icons.delete_rounded, color: AppTheme.danger, size: 20),
                      onPressed: () async {
                        await ref.read(apiClientProvider).deleteMortality(r.id);
                        _load();
                      },
                    ),
                  ),
                )),
        ],
      ),
    );
  }

  void _showAddDialog(BuildContext context) {
    final countCtrl = TextEditingController(text: '1');
    final causeCtrl = TextEditingController();
    final noteCtrl = TextEditingController();

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Catat Kematian Ikan'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: countCtrl,
                decoration: const InputDecoration(labelText: 'Jumlah Kematian'),
                keyboardType: TextInputType.number),
            const SizedBox(height: 12),
            TextField(controller: causeCtrl,
                decoration: const InputDecoration(labelText: 'Penyebab')),
            const SizedBox(height: 12),
            TextField(controller: noteCtrl,
                decoration: const InputDecoration(labelText: 'Catatan')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Batal')),
          ElevatedButton(
            onPressed: () async {
              try {
                await ref.read(apiClientProvider).recordMortality({
                  'pond_id': widget.pond.pondId,
                  'death_count': int.tryParse(countCtrl.text) ?? 0,
                  'cause': causeCtrl.text,
                  'note': noteCtrl.text,
                });
                await _load();
                if (ctx.mounted) Navigator.pop(ctx);
              } catch (e) {
                if (ctx.mounted) ScaffoldMessenger.of(ctx).showSnackBar(
                    SnackBar(content: Text('Error: $e'), backgroundColor: AppTheme.danger));
              }
            },
            child: const Text('Simpan'),
          ),
        ],
      ),
    );
  }
}

// ── FINANCIAL TAB ─────────────────────────────────────────────────

class FinancialTab extends ConsumerStatefulWidget {
  final PondModel pond;
  const FinancialTab({super.key, required this.pond});
  @override
  ConsumerState<FinancialTab> createState() => _FinancialTabState();
}

class _FinancialTabState extends ConsumerState<FinancialTab> {
  dynamic _financial;
  List<dynamic> _costs = [];
  bool _loading = true;
  final _idrFmt = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final f = await ref.read(apiClientProvider).getFinancial(widget.pond.pondId);
      final c = await ref.read(apiClientProvider).getCosts(widget.pond.pondId);
      if (mounted) setState(() { _financial = f; _costs = c; _loading = false; });
    } catch (_) { if (mounted) setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Financial summary cards
          if (_financial != null) ...[
            Row(
              children: [
                Expanded(child: _FinCard(
                  title: 'Total Biaya',
                  value: _idrFmt.format(_financial['total_cost'] ?? 0),
                  color: AppTheme.danger,
                  icon: Icons.trending_down_rounded,
                )),
                const SizedBox(width: 10),
                Expanded(child: _FinCard(
                  title: 'Estimasi Panen',
                  value: _idrFmt.format(_financial['estimated_revenue'] ?? 0),
                  color: AppTheme.success,
                  icon: Icons.trending_up_rounded,
                )),
              ],
            ),
            const SizedBox(height: 10),
            _FinCard(
              title: 'Estimasi Profit',
              value: _idrFmt.format((_financial['estimated_revenue'] ?? 0) - (_financial['total_cost'] ?? 0)),
              color: ((_financial['estimated_revenue'] ?? 0) - (_financial['total_cost'] ?? 0)) >= 0
                  ? AppTheme.success : AppTheme.danger,
              icon: Icons.account_balance_rounded,
            ),
          ],

          const SizedBox(height: 20),
          Row(
            children: [
              const Expanded(child: Text('Rincian Biaya',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700))),
              IconButton(
                icon: const Icon(Icons.add_circle_rounded, color: AppTheme.primary),
                onPressed: () => _showAddCostDialog(context),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ..._costs.map((c) => Card(
                margin: const EdgeInsets.only(bottom: 6),
                child: ListTile(
                  title: Text(c['description'] ?? c['category'] ?? ''),
                  subtitle: Text(c['category'] ?? ''),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_idrFmt.format(c['amount'] ?? 0),
                          style: const TextStyle(fontWeight: FontWeight.w700, color: AppTheme.danger)),
                      IconButton(
                        icon: const Icon(Icons.delete_rounded, color: AppTheme.danger, size: 18),
                        onPressed: () async {
                          await ref.read(apiClientProvider).deleteCost(widget.pond.pondId, c['id']);
                          _load();
                        },
                      ),
                    ],
                  ),
                ),
              )),
        ],
      ),
    );
  }

  void _showAddCostDialog(BuildContext context) {
    final descCtrl = TextEditingController();
    final amountCtrl = TextEditingController();
    String category = 'pakan';
    final categories = ['pakan', 'benih', 'obat', 'listrik', 'tenaga_kerja', 'lainnya'];

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlgState) => AlertDialog(
          title: const Text('Tambah Biaya'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                value: category,
                decoration: const InputDecoration(labelText: 'Kategori'),
                items: categories.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
                onChanged: (v) => setDlgState(() => category = v!),
              ),
              const SizedBox(height: 12),
              TextField(controller: descCtrl,
                  decoration: const InputDecoration(labelText: 'Deskripsi')),
              const SizedBox(height: 12),
              TextField(controller: amountCtrl,
                  decoration: const InputDecoration(labelText: 'Jumlah (Rp)'),
                  keyboardType: TextInputType.number),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Batal')),
            ElevatedButton(
              onPressed: () async {
                try {
                  await ref.read(apiClientProvider).addCost(widget.pond.pondId, {
                    'category': category,
                    'description': descCtrl.text,
                    'amount': double.tryParse(amountCtrl.text.replaceAll('.', '').replaceAll(',', '')) ?? 0,
                  });
                  await _load();
                  if (ctx.mounted) Navigator.pop(ctx);
                } catch (e) {
                  if (ctx.mounted) ScaffoldMessenger.of(ctx).showSnackBar(
                      SnackBar(content: Text('Error: $e'), backgroundColor: AppTheme.danger));
                }
              },
              child: const Text('Simpan'),
            ),
          ],
        ),
      ),
    );
  }
}

class _FinCard extends StatelessWidget {
  final String title;
  final String value;
  final Color color;
  final IconData icon;
  const _FinCard({required this.title, required this.value, required this.color, required this.icon});

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: color.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: color),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
                    Text(value, style: TextStyle(fontWeight: FontWeight.w700, color: color, fontSize: 14)),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
}

// ── LOGBOOK TAB ───────────────────────────────────────────────────

class LogbookTab extends ConsumerStatefulWidget {
  final PondModel pond;
  const LogbookTab({super.key, required this.pond});
  @override
  ConsumerState<LogbookTab> createState() => _LogbookTabState();
}

class _LogbookTabState extends ConsumerState<LogbookTab> {
  List<dynamic> _entries = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final e = await ref.read(apiClientProvider).getLogbook(widget.pond.pondId);
      if (mounted) setState(() { _entries = e; _loading = false; });
    } catch (_) { if (mounted) setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());

    return Scaffold(
      body: _entries.isEmpty
          ? const Center(child: Text('Belum ada catatan logbook', style: TextStyle(color: AppTheme.textSecondary)))
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _entries.length,
              itemBuilder: (_, i) {
                final e = _entries[i];
                return Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    leading: const Icon(Icons.book_rounded, color: AppTheme.primary),
                    title: Text(e['activity'] ?? ''),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (e['notes'] != null) Text(e['notes']),
                        if (e['logged_at'] != null || e['created_at'] != null)
                          Text(
                            DateFormat('dd MMM yyyy HH:mm').format(
                                DateTime.parse(e['logged_at'] ?? e['created_at'])),
                            style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary),
                          ),
                      ],
                    ),
                    trailing: IconButton(
                      icon: const Icon(Icons.delete_rounded, color: AppTheme.danger, size: 18),
                      onPressed: () async {
                        await ref.read(apiClientProvider).deleteLogbook(widget.pond.pondId, e['id']);
                        _load();
                      },
                    ),
                  ),
                );
              },
            ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showAddDialog(context),
        child: const Icon(Icons.add_rounded),
      ),
    );
  }

  void _showAddDialog(BuildContext context) {
    final activityCtrl = TextEditingController();
    final notesCtrl = TextEditingController();
    final String? category = 'pengamatan';

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Tambah Catatan Logbook'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: activityCtrl,
                decoration: const InputDecoration(labelText: 'Aktivitas *')),
            const SizedBox(height: 12),
            TextField(controller: notesCtrl,
                decoration: const InputDecoration(labelText: 'Catatan'),
                maxLines: 3),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Batal')),
          ElevatedButton(
            onPressed: () async {
              if (activityCtrl.text.isEmpty) return;
              try {
                await ref.read(apiClientProvider).addLogbook(widget.pond.pondId, {
                  'activity': activityCtrl.text,
                  'notes': notesCtrl.text,
                  'category': category,
                });
                await _load();
                if (ctx.mounted) Navigator.pop(ctx);
              } catch (e) {
                if (ctx.mounted) ScaffoldMessenger.of(ctx).showSnackBar(
                    SnackBar(content: Text('Error: $e'), backgroundColor: AppTheme.danger));
              }
            },
            child: const Text('Simpan'),
          ),
        ],
      ),
    );
  }
}

// ── SETTINGS TAB ──────────────────────────────────────────────────

class SettingsTab extends ConsumerStatefulWidget {
  final PondModel pond;
  const SettingsTab({super.key, required this.pond});
  @override
  ConsumerState<SettingsTab> createState() => _SettingsTabState();
}

class _SettingsTabState extends ConsumerState<SettingsTab> {
  SensorThreshold? _threshold;
  bool _loading = true;

  // Controllers
  final _tempMinCtrl = TextEditingController();
  final _tempMaxCtrl = TextEditingController();
  final _doMinCtrl = TextEditingController();
  final _doMaxCtrl = TextEditingController();
  final _phMinCtrl = TextEditingController();
  final _phMaxCtrl = TextEditingController();
  final _turbidityMaxCtrl = TextEditingController();
  final _depthMinCtrl = TextEditingController();
  final _depthMaxCtrl = TextEditingController();
  final _feedLevelLowCtrl = TextEditingController();
  bool _autoDrain = false;
  bool _autoRefill = false;

  @override
  void initState() { super.initState(); _load(); }

  @override
  void dispose() {
    for (final c in [_tempMinCtrl, _tempMaxCtrl, _doMinCtrl, _doMaxCtrl,
        _phMinCtrl, _phMaxCtrl, _turbidityMaxCtrl, _depthMinCtrl, _depthMaxCtrl, _feedLevelLowCtrl]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final t = await ref.read(apiClientProvider).getThreshold(widget.pond.pondId);
      if (mounted && t != null) {
        setState(() {
          _threshold = t;
          _loading = false;
          _tempMinCtrl.text = t.tempMin?.toString() ?? '25';
          _tempMaxCtrl.text = t.tempMax?.toString() ?? '32';
          _doMinCtrl.text = t.doMin?.toString() ?? '5';
          _doMaxCtrl.text = t.doMax?.toString() ?? '12';
          _phMinCtrl.text = t.phMin?.toString() ?? '6.5';
          _phMaxCtrl.text = t.phMax?.toString() ?? '8.5';
          _turbidityMaxCtrl.text = t.turbidityMax?.toString() ?? '100';
          _depthMinCtrl.text = t.depthMin?.toString() ?? '30';
          _depthMaxCtrl.text = t.depthMax?.toString() ?? '120';
          _feedLevelLowCtrl.text = t.feedLevelLowCm?.toString() ?? '';
          _autoDrain = t.autoDrainEnabled;
          _autoRefill = t.autoRefillEnabled;
        });
      } else if (mounted) {
        setState(() => _loading = false);
      }
    } catch (_) { if (mounted) setState(() => _loading = false); }
  }

  Future<void> _save() async {
    try {
      await ref.read(apiClientProvider).updateThreshold(widget.pond.pondId, SensorThreshold(
        tempMin: double.tryParse(_tempMinCtrl.text),
        tempMax: double.tryParse(_tempMaxCtrl.text),
        doMin: double.tryParse(_doMinCtrl.text),
        doMax: double.tryParse(_doMaxCtrl.text),
        phMin: double.tryParse(_phMinCtrl.text),
        phMax: double.tryParse(_phMaxCtrl.text),
        turbidityMax: double.tryParse(_turbidityMaxCtrl.text),
        depthMin: double.tryParse(_depthMinCtrl.text),
        depthMax: double.tryParse(_depthMaxCtrl.text),
        feedLevelLowCm: double.tryParse(_feedLevelLowCtrl.text),
        autoDrainEnabled: _autoDrain,
        autoRefillEnabled: _autoRefill,
      ));
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Pengaturan disimpan'), backgroundColor: AppTheme.success),
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e'), backgroundColor: AppTheme.danger),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Batas Ambang Sensor',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 16),

          _ThresholdSection(title: 'Suhu (°C)', minCtrl: _tempMinCtrl, maxCtrl: _tempMaxCtrl),
          const SizedBox(height: 12),
          _ThresholdSection(title: 'Oksigen Terlarut (mg/L)', minCtrl: _doMinCtrl, maxCtrl: _doMaxCtrl),
          const SizedBox(height: 12),
          _ThresholdSection(title: 'pH', minCtrl: _phMinCtrl, maxCtrl: _phMaxCtrl),
          const SizedBox(height: 12),
          _ThresholdSection(title: 'Kedalaman (cm)', minCtrl: _depthMinCtrl, maxCtrl: _depthMaxCtrl),
          const SizedBox(height: 12),

          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Kekeruhan Maks (NTU)', style: TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  TextField(controller: _turbidityMaxCtrl,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: 'Maks')),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),

          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Level Pakan Rendah (cm)', style: TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  TextField(controller: _feedLevelLowCtrl,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: 'Peringatkan di bawah')),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          const Text('Otomasi', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),

          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                children: [
                  SwitchListTile(
                    title: const Text('Auto Drain (Kuras Otomatis)'),
                    subtitle: const Text('Kuras otomatis saat kondisi kritis',
                        style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                    value: _autoDrain,
                    onChanged: (v) => setState(() => _autoDrain = v),
                    activeColor: AppTheme.primary,
                  ),
                  const Divider(height: 1),
                  SwitchListTile(
                    title: const Text('Auto Refill (Isi Ulang Otomatis)'),
                    subtitle: const Text('Isi ulang setelah drain selesai',
                        style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                    value: _autoRefill,
                    onChanged: (v) => setState(() => _autoRefill = v),
                    activeColor: AppTheme.primary,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),

          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _save,
              icon: const Icon(Icons.save_rounded),
              label: const Text('Simpan Pengaturan'),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _ThresholdSection extends StatelessWidget {
  final String title;
  final TextEditingController minCtrl;
  final TextEditingController maxCtrl;
  const _ThresholdSection({required this.title, required this.minCtrl, required this.maxCtrl});

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: minCtrl,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: 'Min', prefixIcon: Icon(Icons.arrow_downward, size: 16)),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextField(
                      controller: maxCtrl,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: 'Max', prefixIcon: Icon(Icons.arrow_upward, size: 16)),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      );
}
