import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _quickPassCtrl = TextEditingController();
  bool _loading = false;
  bool _showPass = false;
  String? _error;

  // Quick Login state — diambil live dari backend (quick_login_config),
  // bukan hardcoded. Tombol hanya muncul jika show_button_on_login aktif.
  List<dynamic> _quickAccounts = [];
  bool _quickShowButton = false;
  bool _quickPassphraseRequired = false;
  bool _quickBusy = false;
  String? _quickError;

  @override
  void initState() {
    super.initState();
    _loadQuickLogin();
  }

  Future<void> _loadQuickLogin() async {
    try {
      final api = ref.read(apiClientProvider);
      final data = await api.getQuickLoginPublic();
      if (!mounted) return;
      setState(() {
        _quickShowButton = data['show_button'] == true;
        _quickPassphraseRequired = data['passphrase_required'] == true;
        _quickAccounts = data['accounts'] ?? [];
      });
    } catch (_) {
      // 404 saat fitur off, atau tidak ada koneksi — sembunyikan saja, jangan tampilkan error.
    }
  }

  Future<void> _quickLoginAs(dynamic account) async {
    setState(() { _quickBusy = true; _quickError = null; });
    try {
      await ref.read(authProvider.notifier).quickLogin({
        'account': account['user_id'],
        if (_quickPassphraseRequired) 'passphrase': _quickPassCtrl.text,
      });
    } catch (e) {
      setState(() => _quickError = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _quickBusy = false);
    }
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _loading = true; _error = null; });
    try {
      await ref.read(authProvider.notifier).login(
        _emailCtrl.text.trim(),
        _passCtrl.text,
      );
      // Router will redirect automatically
    } catch (e) {
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    } finally {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(gradient: AppTheme.bgGradient),
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              children: [
                const SizedBox(height: 60),
                // ── Logo & Brand ──────────────────────────────────
                Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    gradient: AppTheme.primaryGradient,
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: [
                      BoxShadow(
                        color: AppTheme.primary.withOpacity(0.4),
                        blurRadius: 20,
                        spreadRadius: 2,
                      ),
                    ],
                  ),
                  child: const Icon(Icons.water_drop_rounded, color: Colors.white, size: 36),
                ),
                const SizedBox(height: 20),
                ShaderMask(
                  shaderCallback: (bounds) =>
                      AppTheme.primaryGradient.createShader(bounds),
                  child: const Text(
                    'AquaSmart',
                    style: TextStyle(
                      fontSize: 32,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                      letterSpacing: -0.5,
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Smart Aquaculture Monitoring System',
                  style: TextStyle(fontSize: 14, color: AppTheme.textSecondary),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 48),

                // ── Login Form ────────────────────────────────────
                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: AppTheme.bgCard,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: AppTheme.borderPrimary),
                  ),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Masuk',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                            color: AppTheme.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 4),
                        const Text(
                          'Masukkan kredensial Anda',
                          style: TextStyle(fontSize: 13, color: AppTheme.textSecondary),
                        ),
                        const SizedBox(height: 24),

                        // Email
                        TextFormField(
                          controller: _emailCtrl,
                          keyboardType: TextInputType.emailAddress,
                          autofillHints: const [AutofillHints.email],
                          style: const TextStyle(color: AppTheme.textPrimary),
                          decoration: const InputDecoration(
                            labelText: 'Email',
                            prefixIcon: Icon(Icons.email_rounded),
                          ),
                          validator: (v) => v == null || v.isEmpty ? 'Email wajib diisi' : null,
                        ),
                        const SizedBox(height: 16),

                        // Password
                        TextFormField(
                          controller: _passCtrl,
                          obscureText: !_showPass,
                          autofillHints: const [AutofillHints.password],
                          style: const TextStyle(color: AppTheme.textPrimary),
                          decoration: InputDecoration(
                            labelText: 'Password',
                            prefixIcon: const Icon(Icons.lock_rounded),
                            suffixIcon: IconButton(
                              icon: Icon(
                                _showPass ? Icons.visibility_off : Icons.visibility,
                              ),
                              onPressed: () => setState(() => _showPass = !_showPass),
                            ),
                          ),
                          validator: (v) => v == null || v.isEmpty ? 'Password wajib diisi' : null,
                          onFieldSubmitted: (_) => _login(),
                        ),

                        if (_error != null) ...[
                          const SizedBox(height: 16),
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: AppTheme.danger.withOpacity(0.1),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: AppTheme.danger.withOpacity(0.3)),
                            ),
                            child: Row(
                              children: [
                                const Icon(Icons.error_outline_rounded,
                                    color: AppTheme.danger, size: 18),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    _error!,
                                    style: const TextStyle(color: AppTheme.danger, fontSize: 13),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],

                        const SizedBox(height: 24),
                        SizedBox(
                          width: double.infinity,
                          height: 50,
                          child: ElevatedButton(
                            onPressed: _loading ? null : _login,
                            child: _loading
                                ? const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                        color: Colors.white, strokeWidth: 2),
                                  )
                                : const Text('Masuk', style: TextStyle(fontSize: 16)),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                // ── Quick Login (hanya muncul jika diaktifkan di server) ──
                if (_quickShowButton && _quickAccounts.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: AppTheme.bgCard.withOpacity(0.7),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: AppTheme.borderPrimary),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.bolt, color: AppTheme.warning, size: 18),
                            const SizedBox(width: 6),
                            const Text(
                              'Quick Login (Demo)',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: AppTheme.textPrimary,
                              ),
                            ),
                          ],
                        ),
                        if (_quickPassphraseRequired) ...[
                          const SizedBox(height: 12),
                          TextField(
                            controller: _quickPassCtrl,
                            obscureText: true,
                            style: const TextStyle(color: AppTheme.textPrimary),
                            decoration: const InputDecoration(
                              labelText: 'Passphrase quick-login',
                              isDense: true,
                            ),
                          ),
                        ],
                        if (_quickError != null) ...[
                          const SizedBox(height: 10),
                          Text(_quickError!, style: const TextStyle(color: AppTheme.danger, fontSize: 12)),
                        ],
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: _quickAccounts.map((acc) => _quickBtn(acc)).toList(),
                        ),
                      ],
                    ),
                  ),
                ],

                const SizedBox(height: 40),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _quickBtn(dynamic account) {
    final label = roleLabel[account['role']] ?? account['role'] ?? '?';
    return OutlinedButton(
      onPressed: _quickBusy ? null : () => _quickLoginAs(account),
      style: OutlinedButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        textStyle: const TextStyle(fontSize: 12),
        side: const BorderSide(color: AppTheme.borderPrimary),
        foregroundColor: AppTheme.textSecondary,
      ),
      child: Text(label),
    );
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passCtrl.dispose();
    _quickPassCtrl.dispose();
    super.dispose();
  }
}
