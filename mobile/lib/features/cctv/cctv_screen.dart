// ═══════════════════════════════════════════════════════════════
// Screens dengan WebView: CCTV & Grafana
// ═══════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/app_config.dart';

// ── CCTV Screen ───────────────────────────────────────────────────

class CctvScreen extends ConsumerStatefulWidget {
  const CctvScreen({super.key});
  @override
  ConsumerState<CctvScreen> createState() => _CctvScreenState();
}

class _CctvScreenState extends ConsumerState<CctvScreen> {
  dynamic _config;
  List<dynamic> _cameras = [];
  bool _loading = true;
  String? _currentUrl;
  WebViewController? _webController;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final config = await ref.read(apiClientProvider).getCctvConfig();
      final cameras = await ref.read(apiClientProvider).getCctvCameras();
      if (mounted) {
        setState(() {
          _config = config;
          _cameras = cameras;
          _loading = false;
          if (config?['portal_url'] != null) {
            _openUrl(config['portal_url']);
          } else if (cameras.isNotEmpty && cameras[0]['stream_url'] != null) {
            _openUrl(cameras[0]['stream_url']);
          }
        });
      }
    } catch (_) { if (mounted) setState(() => _loading = false); }
  }

  void _openUrl(String url) {
    setState(() => _currentUrl = url);
    if (_webController == null) {
      _webController = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..loadRequest(Uri.parse(url));
    } else {
      _webController!.loadRequest(Uri.parse(url));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('CCTV'),
        actions: [
          if (_webController != null)
            IconButton(
              icon: const Icon(Icons.refresh_rounded),
              onPressed: () => _webController!.reload(),
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                // Camera selector
                if (_cameras.isNotEmpty)
                  Container(
                    height: 48,
                    color: AppTheme.bgSurface,
                    child: ListView.builder(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      itemCount: _cameras.length,
                      itemBuilder: (_, i) {
                        final cam = _cameras[i];
                        final url = cam['stream_url'] ?? cam['rtsp_url'];
                        final selected = _currentUrl == url;
                        return Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: FilterChip(
                            label: Text(cam['name'] ?? 'Kamera ${i+1}'),
                            selected: selected,
                            onSelected: (_) { if (url != null) _openUrl(url); },
                          ),
                        );
                      },
                    ),
                  ),

                // WebView
                Expanded(
                  child: _currentUrl != null && _webController != null
                      ? WebViewWidget(controller: _webController!)
                      : Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.videocam_off_rounded, size: 56, color: AppTheme.textMuted),
                              const SizedBox(height: 12),
                              const Text('Tidak ada URL CCTV yang dikonfigurasi',
                                  style: TextStyle(color: AppTheme.textSecondary)),
                              const SizedBox(height: 8),
                              const Text('Konfigurasi CCTV di panel admin web',
                                  style: TextStyle(fontSize: 12, color: AppTheme.textMuted)),
                            ],
                          ),
                        ),
                ),
              ],
            ),
    );
  }
}

// ── Grafana Screen ────────────────────────────────────────────────

class GrafanaScreen extends StatefulWidget {
  const GrafanaScreen({super.key});
  @override
  State<GrafanaScreen> createState() => _GrafanaScreenState();
}

class _GrafanaScreenState extends State<GrafanaScreen> {
  late final WebViewController _controller;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(NavigationDelegate(
        onPageFinished: (_) => setState(() => _loading = false),
      ))
      ..loadRequest(Uri.parse(AppConfig.grafanaUrl));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Grafana Analytics'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () { setState(() => _loading = true); _controller.reload(); },
          ),
          IconButton(
            icon: const Icon(Icons.open_in_browser_rounded),
            onPressed: () => _controller.loadRequest(Uri.parse(AppConfig.grafanaUrl)),
          ),
        ],
      ),
      body: Stack(
        children: [
          WebViewWidget(controller: _controller),
          if (_loading)
            const Center(child: CircularProgressIndicator()),
        ],
      ),
    );
  }
}
