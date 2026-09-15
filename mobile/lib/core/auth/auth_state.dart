import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../db/app_database.dart';
import '../db/outbox_repository.dart';
import '../network/api_client.dart';
import '../storage/token_store.dart';
import 'access.dart';

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

/// Thrown by [AuthController.login] when the backend responds with `requires_2fa` (currently:
/// mandatory email-OTP for driver accounts). The password is deliberately not held in [AuthState]
/// anywhere -- callers need to keep it in-memory themselves to complete [AuthController.verifyOtp].
class Requires2FAException implements Exception {
  const Requires2FAException(this.email);
  final String email;
}

final tokenStoreProvider = Provider<TokenStore>((ref) {
  return TokenStore(const FlutterSecureStorage());
});

final apiClientProvider = Provider<ApiClient>((ref) {
  final tokenStore = ref.watch(tokenStoreProvider);
  return ApiClient(tokenStore, onLogout: () async {
    await ref.read(authControllerProvider.notifier).logout();
  });
});

final appDatabaseProvider = Provider<AppDatabase>((ref) {
  final db = AppDatabase();
  ref.onDispose(db.close);
  return db;
});

final outboxRepositoryProvider = Provider<OutboxRepository>((ref) {
  return OutboxRepository(ref.watch(appDatabaseProvider), ref.watch(apiClientProvider).dio);
});

final accessRepositoryProvider = Provider<AccessRepository>((ref) {
  return AccessRepository(ref.watch(apiClientProvider).dio, ref.watch(appDatabaseProvider));
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

  /// [identifier] is email or phone -- the backend resolves which (see /auth/login). Throws
  /// [Requires2FAException] when the account needs a second factor (currently: driver accounts,
  /// which get an emailed code) -- callers should catch that specifically and collect a code via
  /// [verifyOtp] rather than treating it as a login failure. Calling this again with the same
  /// credentials after a [Requires2FAException] is also how a driver requests a fresh code.
  Future<void> login(String identifier, String password) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.post('/auth/login', data: {'email': identifier, 'password': password});
    final data = Map<String, dynamic>.from(response.data);
    if (data['requires_2fa'] == true) {
      throw Requires2FAException(data['email'] as String);
    }
    await _ref.read(tokenStoreProvider).saveTokens(
          accessToken: data['token'] as String,
          refreshToken: data['refresh_token'] as String,
        );
    state = AuthState(user: Map<String, dynamic>.from(data['user']), status: AuthStatus.authenticated);
  }

  /// Completes a login that returned [Requires2FAException]. [identifier] and [password] must be
  /// the same credentials used in the [login] call that triggered it -- the backend's /auth/login
  /// re-verifies the password alongside the code in one request rather than trusting a bare code.
  Future<void> verifyOtp(String identifier, String password, String code) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.post(
      '/auth/login',
      data: {'email': identifier, 'password': password, 'code': code},
    );
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
