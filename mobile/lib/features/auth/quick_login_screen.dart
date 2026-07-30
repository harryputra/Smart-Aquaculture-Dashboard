import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';

class QuickLoginScreen extends ConsumerStatefulWidget {
  final String token;
  const QuickLoginScreen({super.key, required this.token});
  @override
  ConsumerState<QuickLoginScreen> createState() => _QuickLoginScreenState();
}

class _QuickLoginScreenState extends ConsumerState<QuickLoginScreen> {
  bool _loading = true;
  String? _error;
  List<dynamic> _accounts = [];
  bool _enabled = false;

  @override
  void initState() {
    super.initState();
    _loadConfig();
  }

  Future<void> _loadConfig() async {
    try {
      final api = ref.read(apiClientProvider);
      final data = await api.getQuickLoginPublic(widget.token);
      setState(() {
        _enabled = data['enabled'] == true;
        _accounts = data['accounts'] ?? [];
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Link quick-login tidak valid atau sudah dinonaktifkan.';
        _loading = false;
      });
    }
  }

  Future<void> _loginAs(Map<String, dynamic> account) async {
    setState(() => _loading = true);
    try {
      await ref.read(authProvider.notifier).quickLogin({
        'token': widget.token,
        'role': account['role'],
      });
    } catch (e) {
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(gradient: AppTheme.bgGradient),
        child: SafeArea(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null || !_enabled
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(32),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.lock_outline, size: 64, color: AppTheme.textMuted),
                            const SizedBox(height: 16),
                            Text(
                              _error ?? 'Quick Login tidak aktif.',
                              style: const TextStyle(color: AppTheme.textSecondary),
                              textAlign: TextAlign.center,
                            ),
                          ],
                        ),
                      ),
                    )
                  : _buildAccountList(),
        ),
      ),
    );
  }

  Widget _buildAccountList() {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 40),
          const Icon(Icons.bolt, color: AppTheme.warning, size: 40),
          const SizedBox(height: 16),
          const Text(
            'Quick Login',
            style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: AppTheme.textPrimary),
          ),
          const Text(
            'Pilih akun untuk masuk langsung',
            style: TextStyle(color: AppTheme.textSecondary),
          ),
          const SizedBox(height: 32),
          ..._accounts.map((acc) => _AccountCard(
                account: acc,
                onTap: () => _loginAs(acc),
              )),
        ],
      ),
    );
  }
}

class _AccountCard extends StatelessWidget {
  final dynamic account;
  final VoidCallback onTap;
  const _AccountCard({required this.account, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        leading: Container(
          width: 42,
          height: 42,
          decoration: BoxDecoration(
            gradient: AppTheme.primaryGradient,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Center(
            child: Text(
              (account['label'] ?? account['role'] ?? '?')[0].toUpperCase(),
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18),
            ),
          ),
        ),
        title: Text(account['label'] ?? account['role'] ?? '', style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(account['email'] ?? '', style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12)),
        trailing: const Icon(Icons.chevron_right, color: AppTheme.textSecondary),
        onTap: onTap,
      ),
    );
  }
}
