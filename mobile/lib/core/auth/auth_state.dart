import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../network/api_client.dart';
import '../storage/token_store.dart';

/// The user shape returned by user_from_token() in server.py -- id, email, name, role,
/// workspace_id, permissions, phone, driver_id. Kept as a raw map rather than a typed
/// model for now (Phase 0); a proper model can come once more screens need typed access
/// to specific fields.
class AuthState {
  const AuthState({this.user, this.status = AuthStatus.unknown});

  final Map<String, dynamic>? user;
  final AuthStatus status;

  bool get isAuthenticated => status == AuthStatus.authenticated && user != null;

  AuthState copyWith({Map<String, dynamic>? user, AuthStatus? status}) =>
      AuthState(user: user ?? this.user, status: status ?? this.status);
}

enum AuthStatus { unknown, authenticated, unauthenticated }

final tokenStoreProvider = Provider<TokenStore>((ref) {
  return TokenStore(const FlutterSecureStorage());
});

final apiClientProvider = Provider<ApiClient>((ref) {
  final tokenStore = ref.watch(tokenStoreProvider);
  return ApiClient(tokenStore, onLogout: () async {
    await ref.read(authControllerProvider.notifier).logout();
  });
});

final authControllerProvider = StateNotifierProvider<AuthController, AuthState>((ref) {
  return AuthController(ref);
});

class AuthController extends StateNotifier<AuthState> {
  AuthController(this._ref) : super(const AuthState()) {
    _restoreSession();
  }

  final Ref _ref;

  Future<void> _restoreSession() async {
    final tokenStore = _ref.read(tokenStoreProvider);
    final token = await tokenStore.readAccessToken();
    if (token == null) {
      state = state.copyWith(status: AuthStatus.unauthenticated);
      return;
    }
    try {
      final dio = _ref.read(apiClientProvider).dio;
      final response = await dio.get('/auth/me');
      state = AuthState(user: Map<String, dynamic>.from(response.data), status: AuthStatus.authenticated);
    } catch (_) {
      await tokenStore.clear();
      state = state.copyWith(status: AuthStatus.unauthenticated);
    }
  }

  /// [identifier] is email or phone -- the backend resolves which (see /auth/login).
  Future<void> login(String identifier, String password) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.post('/auth/login', data: {'email': identifier, 'password': password});
    final data = Map<String, dynamic>.from(response.data);
    await _ref.read(tokenStoreProvider).saveTokens(
          accessToken: data['token'] as String,
          refreshToken: data['refresh_token'] as String,
        );
    state = AuthState(user: Map<String, dynamic>.from(data['user']), status: AuthStatus.authenticated);
  }

  Future<void> logout() async {
    await _ref.read(tokenStoreProvider).clear();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }
}
