import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/api_client.dart';
import '../models/models.dart';

// ── Auth State ────────────────────────────────────────────────────

class AuthState {
  final UserModel? user;
  final bool loading;
  final String? error;

  const AuthState({
    this.user,
    this.loading = false,
    this.error,
  });

  bool get isAuthenticated => user != null;

  AuthState copyWith({UserModel? user, bool? loading, String? error, bool clearUser = false}) =>
      AuthState(
        user: clearUser ? null : (user ?? this.user),
        loading: loading ?? this.loading,
        error: error,
      );
}

// ── Auth Notifier ─────────────────────────────────────────────────

class AuthNotifier extends StateNotifier<AuthState> {
  final ApiClient _api;

  AuthNotifier(this._api) : super(const AuthState(loading: true)) {
    _init();
  }

  Future<void> _init() async {
    try {
      final j = await _api.me();
      state = AuthState(user: UserModel.fromJson(j['user']));
    } catch (e) {
      // Coba refresh token
      try {
        final j = await _api.refresh();
        state = AuthState(user: UserModel.fromJson(j['user']));
      } catch (_) {
        state = const AuthState(); // belum login
      }
    }
  }

  Future<UserModel> login(String email, String password) async {
    state = state.copyWith(loading: true, error: null);
    try {
      final j = await _api.login(email, password);
      final user = UserModel.fromJson(j['user']);
      state = AuthState(user: user);
      return user;
    } catch (e) {
      state = state.copyWith(loading: false, error: e.toString());
      rethrow;
    }
  }

  Future<UserModel> quickLogin(Map<String, dynamic> body) async {
    state = state.copyWith(loading: true, error: null);
    try {
      final j = await _api.quickLoginPost(body);
      final user = UserModel.fromJson(j['user']);
      state = AuthState(user: user);
      return user;
    } catch (e) {
      state = state.copyWith(loading: false, error: e.toString());
      rethrow;
    }
  }

  Future<void> logout() async {
    try {
      await _api.logout();
    } catch (_) {}
    state = const AuthState();
  }

  Future<void> refresh() async {
    try {
      final j = await _api.me();
      state = AuthState(user: UserModel.fromJson(j['user']));
    } catch (e) {
      try {
        final j = await _api.refresh();
        state = AuthState(user: UserModel.fromJson(j['user']));
      } catch (_) {
        state = const AuthState();
      }
    }
  }
}

// ── Provider ──────────────────────────────────────────────────────

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  final api = ref.read(apiClientProvider);
  return AuthNotifier(api);
});

// ── Convenience Getters ───────────────────────────────────────────

final currentUserProvider = Provider<UserModel?>((ref) {
  return ref.watch(authProvider).user;
});

final isAuthenticatedProvider = Provider<bool>((ref) {
  return ref.watch(authProvider).isAuthenticated;
});
