// ═══════════════════════════════════════════════════════════════
// Screen stubs yang akan dikembangkan lebih lanjut
// File ini berisi: devices_screen, mqtt_monitor_screen,
// hardware_test_screen, firmware_screen, simulation_screen,
// compare_screen, whatsapp_screen, users_screen, database_screen
// ═══════════════════════════════════════════════════════════════

library screens;

import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../core/api/api_client.dart';
import '../core/models/models.dart';
import '../core/mqtt/mqtt_service.dart';
import '../core/theme/app_theme.dart';
import '../shared/widgets/status_chip.dart';

// ═════════════════════════════════════════════════════════════════
// Devices Screen (semua perangkat IoT)
// ═════════════════════════════════════════════════════════════════

class DevicesScreen extends ConsumerStatefulWidget {
  const DevicesScreen({super.key});
  @override
  ConsumerState<DevicesScreen> createState() => _DevicesScreenState();
}

class _DevicesScreenState extends ConsumerState<DevicesScreen> {
  List<WaterDevice> _waterDevices = [];
  List<LeleDevice> _leleDevices = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final w = await ref.read(apiClientProvider).getWaterDevices();
      final l = await ref.read(apiClientProvider).getLeleDevices();
      if (mounted) setState(() { _waterDevices = w; _leleDevices = l; _loading = false; });
    } catch (_) { if (mounted) setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));

    final online = _waterDevices.where((d) => d.isConnected == true).length +
        _leleDevices.where((d) => d.isOnline).length;
    final total = _waterDevices.length + _leleDevices.length;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Perangkat IoT'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh_rounded), onPressed: () { setState(() => _loading = true); _load(); }),
        ],
      ),
      body: RefreshIndicator(
        color: AppTheme.primary,
        onRefresh: () async { setState(() => _loading = true); await _load(); },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Summary
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _CountBadge(label: 'Total', value: total, color: AppTheme.primary),
                    _CountBadge(label: 'Online', value: online, color: AppTheme.success),
                    _CountBadge(label: 'Offline', value: total - online, color: AppTheme.danger),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Water Sensor Devices
            if (_waterDevices.isNotEmpty) ...[
              const Text('Sensor Air', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              ..._waterDevices.map((d) => Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      leading: Icon(Icons.sensors_rounded,
                          color: d.isConnected == true ? AppTheme.success : AppTheme.textMuted),
                      title: Text(d.name),
                      subtitle: Text(d.farmName ?? d.pondId),
                      trailing: StatusChip.connected(d.isConnected ?? false),
                    ),
                  )),
              const SizedBox(height: 16),
            ],

            // Lele Feeder Devices
            if (_leleDevices.isNotEmpty) ...[
              const Text('Pemberi Pakan', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              ..._leleDevices.map((d) => Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      leading: Icon(Icons.set_meal_rounded,
                          color: d.isOnline ? AppTheme.success : AppTheme.textMuted),
                      title: Text(d.name ?? d.deviceId),
                      subtitle: Text(d.deviceId),
                      trailing: StatusChip.online(d.isOnline),
                    ),
                  )),
            ],
          ],
        ),
      ),
    );
  }
}

class _CountBadge extends StatelessWidget {
  final String label;
  final int value;
  final Color color;
  const _CountBadge({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) => Column(
        children: [
          Text('$value', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: color)),
          Text(label, style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
        ],
      );
}

// ═════════════════════════════════════════════════════════════════
// MQTT Monitor Screen
// ═════════════════════════════════════════════════════════════════

class MqttMonitorScreen extends ConsumerStatefulWidget {
  const MqttMonitorScreen({super.key});
  @override
  ConsumerState<MqttMonitorScreen> createState() => _MqttMonitorScreenState();
}

class _MqttMonitorScreenState extends ConsumerState<MqttMonitorScreen> {
  final List<MqttMessage> _messages = [];
  final _scrollController = ScrollController();
  bool _autoscroll = true;
  String _filter = '';

  @override
  Widget build(BuildContext context) {
    ref.listen(mqttMessagesProvider, (_, next) {
      next.whenData((msg) {
        setState(() {
          _messages.insert(0, msg);
          if (_messages.length > 500) _messages.removeLast();
        });
      });
    });

    final mqtt = ref.watch(mqttServiceProvider);
    final filtered = _filter.isEmpty
        ? _messages
        : _messages.where((m) => m.topic.contains(_filter)).toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('MQTT Monitor'),
        actions: [
          IconButton(
            icon: Icon(_autoscroll ? Icons.vertical_align_bottom : Icons.pause_rounded),
            onPressed: () => setState(() => _autoscroll = !_autoscroll),
            tooltip: 'Auto-scroll',
          ),
          IconButton(
            icon: const Icon(Icons.delete_sweep_rounded),
            onPressed: () => setState(() => _messages.clear()),
          ),
        ],
      ),
      body: Column(
        children: [
          // Status bar
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            color: AppTheme.bgSurface,
            child: Row(
              children: [
                StatusChip.connected(mqtt.isConnected),
                const SizedBox(width: 12),
                Text('${_messages.length} pesan', style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                const Spacer(),
                SizedBox(
                  width: 160,
                  child: TextField(
                    decoration: const InputDecoration(
                      hintText: 'Filter topic...',
                      prefixIcon: Icon(Icons.search_rounded, size: 16),
                      isDense: true,
                    ),
                    onChanged: (v) => setState(() => _filter = v),
                  ),
                ),
              ],
            ),
          ),

          // Messages
          Expanded(
            child: filtered.isEmpty
                ? const Center(child: Text('Menunggu pesan MQTT...', style: TextStyle(color: AppTheme.textSecondary)))
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.all(8),
                    itemCount: filtered.length,
                    itemBuilder: (_, i) {
                      final msg = filtered[i];
                      return Card(
                        margin: const EdgeInsets.only(bottom: 4),
                        child: Padding(
                          padding: const EdgeInsets.all(10),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(msg.topic,
                                        style: const TextStyle(fontFamily: 'monospace', fontSize: 11, color: AppTheme.primary)),
                                  ),
                                  Text(
                                    DateFormat('HH:mm:ss').format(msg.receivedAt),
                                    style: const TextStyle(fontSize: 10, color: AppTheme.textMuted),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Text(
                                jsonEncode(msg.payload),
                                style: const TextStyle(fontFamily: 'monospace', fontSize: 11, color: AppTheme.textSecondary),
                                maxLines: 3,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════
// Hardware Test Screen
// ═════════════════════════════════════════════════════════════════

class HardwareTestScreen extends ConsumerStatefulWidget {
  const HardwareTestScreen({super.key});
  @override
  ConsumerState<HardwareTestScreen> createState() => _HardwareTestScreenState();
}

class _HardwareTestScreenState extends ConsumerState<HardwareTestScreen> {
  List<PondModel> _ponds = [];
  PondModel? _selectedPond;
  bool _loading = false;

  @override
  void initState() { super.initState(); _loadPonds(); }

  Future<void> _loadPonds() async {
    try {
      final p = await ref.read(apiClientProvider).getPonds();
      if (mounted) setState(() => _ponds = p);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Uji Hardware')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Pond selector
            DropdownButtonFormField<PondModel>(
              value: _selectedPond,
              decoration: const InputDecoration(labelText: 'Pilih Kolam'),
              items: _ponds.map((p) => DropdownMenuItem(value: p, child: Text(p.name))).toList(),
              onChanged: (p) => setState(() => _selectedPond = p),
            ),
            const SizedBox(height: 24),

            if (_selectedPond != null) ...[
              const Text('Kontrol Katup', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              GridView.count(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisCount: 2,
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
                childAspectRatio: 2.5,
                children: [
                  _TestBtn('Buka Outlet', AppTheme.warning, () => _valve('open_valve')),
                  _TestBtn('Tutup Outlet', AppTheme.primary, () => _valve('close_valve')),
                  _TestBtn('Buka Inlet', AppTheme.success, () => _valve('open_inlet')),
                  _TestBtn('Tutup Inlet', AppTheme.textSecondary, () => _valve('close_inlet')),
                ],
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: _loading ? null : _drainCycle,
                  icon: const Icon(Icons.autorenew_rounded, color: AppTheme.warning),
                  label: const Text('Trigger Drain Cycle', style: TextStyle(color: AppTheme.warning)),
                  style: OutlinedButton.styleFrom(
                      side: BorderSide(color: AppTheme.warning.withOpacity(0.5))),
                ),
              ),
            ] else ...[
              const Center(
                child: Text('Pilih kolam untuk menguji hardware',
                    style: TextStyle(color: AppTheme.textSecondary)),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _TestBtn(String label, Color color, VoidCallback onTap) => OutlinedButton(
        onPressed: _loading ? null : onTap,
        style: OutlinedButton.styleFrom(
          side: BorderSide(color: color.withOpacity(0.5)),
          foregroundColor: color,
        ),
        child: Text(label, style: const TextStyle(fontSize: 12)),
      );

  Future<void> _valve(String cmd) async {
    if (_selectedPond == null) return;
    setState(() => _loading = true);
    try {
      await ref.read(apiClientProvider).controlValve(_selectedPond!.pondId, cmd);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Dikirim: $cmd'), backgroundColor: AppTheme.success),
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e'), backgroundColor: AppTheme.danger),
      );
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _drainCycle() async {
    if (_selectedPond == null) return;
    setState(() => _loading = true);
    try {
      await ref.read(apiClientProvider).triggerDrainCycle(_selectedPond!.pondId);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Drain cycle dimulai'), backgroundColor: AppTheme.success),
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e'), backgroundColor: AppTheme.danger),
      );
    } finally {
      setState(() => _loading = false);
    }
  }
}

// ═════════════════════════════════════════════════════════════════
// Firmware Screen (OTA)
// ═════════════════════════════════════════════════════════════════

class FirmwareScreen extends ConsumerStatefulWidget {
  const FirmwareScreen({super.key});
  @override
  ConsumerState<FirmwareScreen> createState() => _FirmwareScreenState();
}

class _FirmwareScreenState extends ConsumerState<FirmwareScreen> {
  List<dynamic> _firmwares = [];
  List<LeleDevice> _devices = [];
  bool _loading = true;
  int? _selectedFirmware;
  String? _selectedDevice;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final f = await ref.read(apiClientProvider).getLeleFirmwareList();
      final d = await ref.read(apiClientProvider).getLeleDevices();
      if (mounted) setState(() { _firmwares = f; _devices = d; _loading = false; });
    } catch (_) { if (mounted) setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Firmware OTA'),
        actions: [IconButton(icon: const Icon(Icons.refresh_rounded), onPressed: () { setState(() => _loading = true); _load(); })],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Flash to Device
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Flash Firmware', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                          const SizedBox(height: 14),
                          DropdownButtonFormField<String>(
                            value: _selectedDevice,
                            decoration: const InputDecoration(labelText: 'Pilih Perangkat'),
                            items: _devices.map((d) => DropdownMenuItem(value: d.deviceId, child: Text(d.name ?? d.deviceId))).toList(),
                            onChanged: (v) => setState(() => _selectedDevice = v),
                          ),
                          const SizedBox(height: 12),
                          DropdownButtonFormField<int>(
                            value: _selectedFirmware,
                            decoration: const InputDecoration(labelText: 'Pilih Firmware'),
                            items: _firmwares.map<DropdownMenuItem<int>>((f) => DropdownMenuItem(
                                value: f['id'], child: Text('v${f['version']} (${f['filename']})'))).toList(),
                            onChanged: (v) => setState(() => _selectedFirmware = v),
                          ),
                          const SizedBox(height: 16),
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton.icon(
                              onPressed: (_selectedDevice != null && _selectedFirmware != null)
                                  ? _flash : null,
                              icon: const Icon(Icons.upload_rounded),
                              label: const Text('Flash Firmware'),
                              style: ElevatedButton.styleFrom(backgroundColor: AppTheme.warning),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(height: 20),
                  const Text('Daftar Firmware', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 12),
                  ..._firmwares.map((f) => Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: ListTile(
                          leading: const Icon(Icons.memory_rounded, color: AppTheme.primary),
                          title: Text('v${f['version']} – ${f['filename']}'),
                          subtitle: f['size'] != null ? Text('${(f['size'] / 1024).toStringAsFixed(1)} KB') : null,
                        ),
                      )),
                ],
              ),
            ),
    );
  }

  Future<void> _flash() async {
    if (_selectedDevice == null || _selectedFirmware == null) return;
    try {
      await ref.read(apiClientProvider).flashFirmware(_selectedDevice!, _selectedFirmware!);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Flash OTA dimulai'), backgroundColor: AppTheme.success),
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e'), backgroundColor: AppTheme.danger),
      );
    }
  }
}

// ═════════════════════════════════════════════════════════════════
// Simulation Screen
// ═════════════════════════════════════════════════════════════════

class SimulationScreen extends ConsumerStatefulWidget {
  const SimulationScreen({super.key});
  @override
  ConsumerState<SimulationScreen> createState() => _SimulationScreenState();
}

class _SimulationScreenState extends ConsumerState<SimulationScreen> {
  List<PondModel> _ponds = [];
  PondModel? _selectedPond;
  final _tempCtrl = TextEditingController(text: '28');
  final _doCtrl = TextEditingController(text: '7');
  final _phCtrl = TextEditingController(text: '7.5');
  final _turbCtrl = TextEditingController(text: '30');
  final _depthCtrl = TextEditingController(text: '80');
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    ref.read(apiClientProvider).getPonds().then((p) {
      if (mounted) setState(() => _ponds = p);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Kirim Data Dummy')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Simulasi Sensor', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            const Text('Kirim data sensor dummy untuk pengujian sistem',
                style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
            const SizedBox(height: 16),
            DropdownButtonFormField<PondModel>(
              value: _selectedPond,
              decoration: const InputDecoration(labelText: 'Pilih Kolam'),
              items: _ponds.map((p) => DropdownMenuItem(value: p, child: Text(p.name))).toList(),
              onChanged: (p) => setState(() => _selectedPond = p),
            ),
            const SizedBox(height: 16),
            _SliderField('Suhu (°C)', _tempCtrl, 20, 40),
            _SliderField('Oksigen Terlarut (mg/L)', _doCtrl, 0, 20),
            _SliderField('pH', _phCtrl, 4, 10),
            _SliderField('Kekeruhan (NTU)', _turbCtrl, 0, 200),
            _SliderField('Kedalaman (cm)', _depthCtrl, 0, 200),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: (_selectedPond != null && !_loading) ? _send : null,
                icon: _loading
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.send_rounded),
                label: const Text('Kirim Data Simulasi'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _SliderField(String label, TextEditingController ctrl, double min, double max) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextField(
          controller: ctrl,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(labelText: label),
        ),
      );

  Future<void> _send() async {
    if (_selectedPond == null) return;
    setState(() => _loading = true);
    try {
      await ref.read(apiClientProvider).sendSimulation(_selectedPond!.pondId, {
        'temperature': double.tryParse(_tempCtrl.text) ?? 28,
        'dissolved_oxygen': double.tryParse(_doCtrl.text) ?? 7,
        'ph': double.tryParse(_phCtrl.text) ?? 7.5,
        'turbidity': double.tryParse(_turbCtrl.text) ?? 30,
        'depth': double.tryParse(_depthCtrl.text) ?? 80,
      });
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Data simulasi dikirim'), backgroundColor: AppTheme.success),
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e'), backgroundColor: AppTheme.danger),
      );
    } finally {
      setState(() => _loading = false);
    }
  }
}

// ═════════════════════════════════════════════════════════════════
// Compare Screen (Perbandingan Siklus)
// ═════════════════════════════════════════════════════════════════

class CompareScreen extends ConsumerStatefulWidget {
  const CompareScreen({super.key});
  @override
  ConsumerState<CompareScreen> createState() => _CompareScreenState();
}

class _CompareScreenState extends ConsumerState<CompareScreen> {
  List<dynamic> _data = [];
  bool _loading = true;
  final _idrFmt = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final d = await ref.read(apiClientProvider).getCycleCompare();
      if (mounted) setState(() { _data = d; _loading = false; });
    } catch (_) { if (mounted) setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Perbandingan Siklus'),
        actions: [IconButton(icon: const Icon(Icons.refresh_rounded), onPressed: () { setState(() => _loading = true); _load(); })],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _data.isEmpty
              ? const Center(child: Text('Belum ada data siklus', style: TextStyle(color: AppTheme.textSecondary)))
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _data.length,
                  itemBuilder: (_, i) {
                    final c = _data[i];
                    final profit = (c['estimated_revenue'] ?? 0) - (c['total_cost'] ?? 0);
                    return Card(
                      margin: const EdgeInsets.only(bottom: 10),
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(c['pond_name'] ?? 'Kolam',
                                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                            Text('Siklus #${c['id'] ?? i + 1}',
                                style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                Expanded(child: _StatCell('Tebar', '${c['stock_count'] ?? 0} ekor')),
                                Expanded(child: _StatCell('Biaya', _idrFmt.format(c['total_cost'] ?? 0))),
                                Expanded(child: _StatCell('Profit', _idrFmt.format(profit),
                                    color: profit >= 0 ? AppTheme.success : AppTheme.danger)),
                              ],
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
    );
  }

  Widget _StatCell(String label, String value, {Color? color}) => Column(
        children: [
          Text(label, style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
          Text(value, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: color ?? AppTheme.textPrimary)),
        ],
      );
}

// ═════════════════════════════════════════════════════════════════
// WhatsApp Notification Screen
// ═════════════════════════════════════════════════════════════════

class WhatsAppScreen extends ConsumerStatefulWidget {
  const WhatsAppScreen({super.key});
  @override
  ConsumerState<WhatsAppScreen> createState() => _WhatsAppScreenState();
}

class _WhatsAppScreenState extends ConsumerState<WhatsAppScreen> {
  dynamic _config;
  List<dynamic> _recipients = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final config = await ref.read(apiClientProvider).getWaConfig();
      final recipients = await ref.read(apiClientProvider).getWaRecipients();
      if (mounted) setState(() { _config = config; _recipients = recipients; _loading = false; });
    } catch (_) { if (mounted) setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifikasi WhatsApp'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh_rounded), onPressed: () { setState(() => _loading = true); _load(); }),
          IconButton(icon: const Icon(Icons.add_rounded), onPressed: () => _showAddDialog(context)),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Status WA
                  if (_config != null)
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Row(
                          children: [
                            Icon(
                              _config['is_connected'] == true ? Icons.check_circle_rounded : Icons.error_rounded,
                              color: _config['is_connected'] == true ? AppTheme.success : AppTheme.danger,
                            ),
                            const SizedBox(width: 10),
                            Text(
                              _config['is_connected'] == true ? 'WhatsApp Terhubung' : 'WhatsApp Terputus',
                              style: TextStyle(
                                fontWeight: FontWeight.w600,
                                color: _config['is_connected'] == true ? AppTheme.success : AppTheme.danger,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  const SizedBox(height: 16),

                  const Text('Penerima Notifikasi', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 12),
                  ..._recipients.map((r) => Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: ListTile(
                          leading: const Icon(Icons.person_rounded, color: AppTheme.primary),
                          title: Text(r['name'] ?? r['phone']),
                          subtitle: Text(r['phone'] ?? ''),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.send_rounded, size: 18, color: AppTheme.success),
                                onPressed: () async {
                                  await ref.read(apiClientProvider).testWaRecipient(r['id']);
                                  if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(content: Text('Pesan tes dikirim'), backgroundColor: AppTheme.success),
                                  );
                                },
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete_rounded, size: 18, color: AppTheme.danger),
                                onPressed: () async {
                                  await ref.read(apiClientProvider).deleteWaRecipient(r['id']);
                                  _load();
                                },
                              ),
                            ],
                          ),
                        ),
                      )),
                ],
              ),
            ),
    );
  }

  void _showAddDialog(BuildContext context) {
    final nameCtrl = TextEditingController();
    final phoneCtrl = TextEditingController();

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Tambah Penerima WA'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Nama')),
            const SizedBox(height: 12),
            TextField(controller: phoneCtrl,
                decoration: const InputDecoration(labelText: 'Nomor HP (628xxx)'),
                keyboardType: TextInputType.phone),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Batal')),
          ElevatedButton(
            onPressed: () async {
              try {
                await ref.read(apiClientProvider).createWaRecipient({
                  'name': nameCtrl.text,
                  'phone': phoneCtrl.text,
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

// ═════════════════════════════════════════════════════════════════
// Users Screen
// ═════════════════════════════════════════════════════════════════

class UsersScreen extends ConsumerStatefulWidget {
  const UsersScreen({super.key});
  @override
  ConsumerState<UsersScreen> createState() => _UsersScreenState();
}

class _UsersScreenState extends ConsumerState<UsersScreen> {
  List<AppUser> _users = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final u = await ref.read(apiClientProvider).getUsers();
      if (mounted) setState(() { _users = u; _loading = false; });
    } catch (_) { if (mounted) setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Manajemen Pengguna'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh_rounded), onPressed: () { setState(() => _loading = true); _load(); }),
          IconButton(icon: const Icon(Icons.add_rounded), onPressed: () => _showAddDialog(context)),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView.builder(
              padding: const EdgeInsets.all(12),
              itemCount: _users.length,
              itemBuilder: (_, i) {
                final u = _users[i];
                return Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    leading: Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        gradient: AppTheme.primaryGradient,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Center(
                        child: Text(u.initial,
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                      ),
                    ),
                    title: Text(u.displayName),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(u.email),
                        StatusChip(label: roleLabel[u.role] ?? u.role, color: AppTheme.primary),
                      ],
                    ),
                    isThreeLine: true,
                    trailing: PopupMenuButton<String>(
                      onSelected: (action) => _handleAction(context, u, action),
                      itemBuilder: (_) => [
                        const PopupMenuItem(value: 'edit', child: Text('Edit')),
                        const PopupMenuItem(value: 'delete', child: Text('Hapus', style: TextStyle(color: AppTheme.danger))),
                      ],
                    ),
                  ),
                );
              },
            ),
    );
  }

  void _handleAction(BuildContext context, AppUser user, String action) async {
    if (action == 'delete') {
      final confirm = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Konfirmasi'),
          content: Text('Hapus pengguna ${user.displayName}?'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
            ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              style: ElevatedButton.styleFrom(backgroundColor: AppTheme.danger),
              child: const Text('Hapus'),
            ),
          ],
        ),
      );
      if (confirm == true) {
        await ref.read(apiClientProvider).deleteUser(user.id);
        _load();
      }
    }
  }

  void _showAddDialog(BuildContext context) {
    final nameCtrl = TextEditingController();
    final emailCtrl = TextEditingController();
    final passCtrl = TextEditingController();
    String role = 'pekerja';
    const roles = ['pemilik', 'pekerja', 'pengamat'];

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlgState) => AlertDialog(
          title: const Text('Tambah Pengguna'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Nama Lengkap')),
                const SizedBox(height: 12),
                TextField(controller: emailCtrl, decoration: const InputDecoration(labelText: 'Email'),
                    keyboardType: TextInputType.emailAddress),
                const SizedBox(height: 12),
                TextField(controller: passCtrl, decoration: const InputDecoration(labelText: 'Password'),
                    obscureText: true),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: role,
                  decoration: const InputDecoration(labelText: 'Role'),
                  items: roles.map((r) => DropdownMenuItem(value: r, child: Text(roleLabel[r] ?? r))).toList(),
                  onChanged: (v) => setDlgState(() => role = v!),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Batal')),
            ElevatedButton(
              onPressed: () async {
                try {
                  await ref.read(apiClientProvider).createUser({
                    'name': nameCtrl.text,
                    'email': emailCtrl.text,
                    'password': passCtrl.text,
                    'role': role,
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

// ═════════════════════════════════════════════════════════════════
// Database Explorer Screen (Super Admin only)
// ═════════════════════════════════════════════════════════════════

class DatabaseScreen extends ConsumerStatefulWidget {
  const DatabaseScreen({super.key});
  @override
  ConsumerState<DatabaseScreen> createState() => _DatabaseScreenState();
}

class _DatabaseScreenState extends ConsumerState<DatabaseScreen> {
  List<String> _tables = [];
  String? _selectedTable;
  Map<String, dynamic>? _tableData;
  bool _loading = true;
  final _sqlCtrl = TextEditingController();
  dynamic _queryResult;

  @override
  void initState() { super.initState(); _loadTables(); }

  Future<void> _loadTables() async {
    try {
      final t = await ref.read(apiClientProvider).dbTables();
      if (mounted) setState(() { _tables = t; _loading = false; });
    } catch (_) { if (mounted) setState(() => _loading = false); }
  }

  Future<void> _loadTable(String name) async {
    setState(() { _selectedTable = name; _tableData = null; });
    try {
      final d = await ref.read(apiClientProvider).dbTable(name);
      if (mounted) setState(() => _tableData = d);
    } catch (_) {}
  }

  Future<void> _runQuery() async {
    try {
      final r = await ref.read(apiClientProvider).dbQuery(_sqlCtrl.text);
      if (mounted) setState(() => _queryResult = r);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e'), backgroundColor: AppTheme.danger),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Database Explorer')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Row(
              children: [
                // Table list
                Container(
                  width: 140,
                  color: AppTheme.bgSurface,
                  child: ListView.builder(
                    itemCount: _tables.length,
                    itemBuilder: (_, i) {
                      final t = _tables[i];
                      return ListTile(
                        dense: true,
                        selected: t == _selectedTable,
                        title: Text(t, style: const TextStyle(fontSize: 12)),
                        onTap: () => _loadTable(t),
                      );
                    },
                  ),
                ),
                const VerticalDivider(width: 1),
                // Table data / query
                Expanded(
                  child: Column(
                    children: [
                      // SQL Query bar
                      Padding(
                        padding: const EdgeInsets.all(8),
                        child: Row(
                          children: [
                            Expanded(
                              child: TextField(
                                controller: _sqlCtrl,
                                decoration: const InputDecoration(
                                    hintText: 'SELECT * FROM ...', isDense: true),
                                style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
                              ),
                            ),
                            const SizedBox(width: 8),
                            ElevatedButton(onPressed: _runQuery, child: const Text('Run')),
                          ],
                        ),
                      ),
                      const Divider(height: 1),
                      // Data
                      Expanded(
                        child: SingleChildScrollView(
                          padding: const EdgeInsets.all(8),
                          child: _tableData != null
                              ? _buildTableView(_tableData!['rows'] ?? [])
                              : _queryResult != null
                                  ? Text(jsonEncode(_queryResult),
                                      style: const TextStyle(fontFamily: 'monospace', fontSize: 11))
                                  : const Center(child: Text('Pilih tabel atau jalankan query',
                                      style: TextStyle(color: AppTheme.textSecondary))),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }

  Widget _buildTableView(List rows) {
    if (rows.isEmpty) return const Text('Tidak ada data');
    final cols = (rows.first as Map).keys.take(6).toList();
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: DataTable(
        columnSpacing: 16,
        dataRowMaxHeight: 36,
        headingTextStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.textSecondary),
        dataTextStyle: const TextStyle(fontSize: 11, fontFamily: 'monospace'),
        columns: cols.map((c) => DataColumn(label: Text(c.toString()))).toList(),
        rows: rows.take(50).map((row) {
          final m = row as Map;
          return DataRow(cells: cols.map((c) => DataCell(Text(
              m[c]?.toString().substring(0, m[c]?.toString().length.clamp(0, 30)) ?? ''))).toList());
        }).toList(),
      ),
    );
  }
}
