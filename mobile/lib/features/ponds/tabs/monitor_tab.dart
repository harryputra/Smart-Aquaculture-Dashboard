import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/models.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/status_chip.dart';

class MonitorTab extends ConsumerStatefulWidget {
  final PondModel pond;
  const MonitorTab({super.key, required this.pond});
  @override
  ConsumerState<MonitorTab> createState() => _MonitorTabState();
}

class _MonitorTabState extends ConsumerState<MonitorTab> {
  SensorData? _latest;
  List<SensorData> _history = [];
  Timer? _timer;
  bool _loading = true;
  String _selectedMetric = 'temperature';

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 10), (_) => _loadLatest());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    await Future.wait([_loadLatest(), _loadHistory()]);
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _loadLatest() async {
    try {
      final d = await ref.read(apiClientProvider).getLatestSensor(widget.pond.pondId);
      if (mounted) setState(() => _latest = d);
    } catch (_) {}
  }

  Future<void> _loadHistory() async {
    try {
      final d = await ref.read(apiClientProvider).getSensorHistory(widget.pond.pondId, limit: 30);
      if (mounted) setState(() => _history = d);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final threshold = widget.pond.threshold;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Sensor Grid ─────────────────────────────────────────
          GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 2,
            crossAxisSpacing: 10,
            mainAxisSpacing: 10,
            childAspectRatio: 1.5,
            children: [
              SensorCard(
                label: 'Suhu',
                value: _latest?.temperature?.toStringAsFixed(1),
                unit: '°C',
                icon: Icons.thermostat_rounded,
                color: AppTheme.warning,
                isAlert: threshold != null && _latest?.temperature != null &&
                    (_latest!.temperature! > (threshold.tempMax ?? 100) ||
                     _latest!.temperature! < (threshold.tempMin ?? -100)),
              ),
              SensorCard(
                label: 'Oksigen Terlarut',
                value: _latest?.dissolvedOxygen?.toStringAsFixed(2),
                unit: 'mg/L',
                icon: Icons.opacity_rounded,
                color: AppTheme.info,
                isAlert: threshold?.doMin != null && _latest?.dissolvedOxygen != null &&
                    _latest!.dissolvedOxygen! < threshold!.doMin!,
              ),
              SensorCard(
                label: 'pH',
                value: _latest?.ph?.toStringAsFixed(2),
                unit: '',
                icon: Icons.science_rounded,
                color: AppTheme.accent,
                isAlert: threshold != null && _latest?.ph != null &&
                    (_latest!.ph! > (threshold.phMax ?? 100) ||
                     _latest!.ph! < (threshold.phMin ?? -100)),
              ),
              SensorCard(
                label: 'Kekeruhan',
                value: _latest?.turbidity?.toStringAsFixed(1),
                unit: 'NTU',
                icon: Icons.water_damage_rounded,
                color: AppTheme.warning,
                isAlert: threshold?.turbidityMax != null && _latest?.turbidity != null &&
                    _latest!.turbidity! > threshold!.turbidityMax!,
              ),
              SensorCard(
                label: 'Kedalaman Air',
                value: _latest?.depth?.toStringAsFixed(0),
                unit: 'cm',
                icon: Icons.straighten_rounded,
                color: AppTheme.primary,
              ),
              SensorCard(
                label: 'Level Pakan',
                value: _latest?.feedLevelCm?.toStringAsFixed(0),
                unit: 'cm',
                icon: Icons.set_meal_rounded,
                color: AppTheme.success,
              ),
            ],
          ),

          const SizedBox(height: 20),

          // ── Aerator Status ──────────────────────────────────────
          if (_latest?.aeratorOn != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Row(
                  children: [
                    Icon(Icons.air_rounded,
                        color: _latest!.aeratorOn! ? AppTheme.success : AppTheme.textMuted),
                    const SizedBox(width: 10),
                    Text('Aerator: ${_latest!.aeratorOn! ? "AKTIF" : "MATI"}',
                        style: TextStyle(
                            fontWeight: FontWeight.w600,
                            color: _latest!.aeratorOn! ? AppTheme.success : AppTheme.textMuted)),
                  ],
                ),
              ),
            ),

          const SizedBox(height: 20),

          // ── Chart ───────────────────────────────────────────────
          if (_history.isNotEmpty) ...[
            Row(
              children: [
                const Expanded(
                    child: Text('Riwayat Sensor',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700))),
                DropdownButton<String>(
                  value: _selectedMetric,
                  underline: const SizedBox(),
                  items: const [
                    DropdownMenuItem(value: 'temperature', child: Text('Suhu')),
                    DropdownMenuItem(value: 'dissolved_oxygen', child: Text('DO')),
                    DropdownMenuItem(value: 'ph', child: Text('pH')),
                    DropdownMenuItem(value: 'turbidity', child: Text('Kekeruhan')),
                  ],
                  onChanged: (v) => setState(() => _selectedMetric = v!),
                ),
              ],
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 200,
              child: _buildChart(),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildChart() {
    final data = _history.map((s) {
      return switch (_selectedMetric) {
        'temperature' => s.temperature,
        'dissolved_oxygen' => s.dissolvedOxygen,
        'ph' => s.ph,
        'turbidity' => s.turbidity,
        _ => s.temperature,
      };
    }).toList();

    if (data.every((v) => v == null)) {
      return const Center(child: Text('Tidak ada data', style: TextStyle(color: AppTheme.textSecondary)));
    }

    final spots = <FlSpot>[];
    for (var i = 0; i < data.length; i++) {
      if (data[i] != null) spots.add(FlSpot(i.toDouble(), data[i]!));
    }

    return LineChart(
      LineChartData(
        gridData: FlGridData(
          show: true,
          getDrawingHorizontalLine: (_) => const FlLine(color: AppTheme.borderPrimary, strokeWidth: 1),
          getDrawingVerticalLine: (_) => const FlLine(color: AppTheme.borderPrimary, strokeWidth: 0.5),
        ),
        titlesData: const FlTitlesData(
          rightTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
          topTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
          bottomTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 40,
            ),
          ),
        ),
        borderData: FlBorderData(show: false),
        lineBarsData: [
          LineChartBarData(
            spots: spots,
            isCurved: true,
            color: AppTheme.primary,
            barWidth: 2,
            belowBarData: BarAreaData(
              show: true,
              color: AppTheme.primary.withOpacity(0.1),
            ),
            dotData: const FlDotData(show: false),
          ),
        ],
      ),
    );
  }
}
