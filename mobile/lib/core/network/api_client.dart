import 'package:dio/dio.dart';

import '../storage/token_store.dart';

/// The backend's actual production origin -- see backend/server.py, mounted under /api.
/// No staging/dev split yet; this matches what the web app and marketing site point at.
const String kApiBaseUrl = 'https://app.fleetintel.africa/api';

typedef LogoutCallback = Future<void> Function();

/// Single dio instance for the whole app: attaches the stored access token to every
/// request, and on a 401 tries exactly one refresh-then-retry before giving up and
/// signing the user out. Mirrors the web app's axios interceptor behavior.
class ApiClient {
  ApiClient(this._tokenStore, {required LogoutCallback onLogout}) : _onLogout = onLogout {
    dio = Dio(BaseOptions(baseUrl: kApiBaseUrl, connectTimeout: const Duration(seconds: 15)));
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _tokenStore.readAccessToken();
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          final isAuthRoute = error.requestOptions.path.startsWith('/auth/');
          if (error.response?.statusCode != 401 || isAuthRoute || error.requestOptions.extra['retried'] == true) {
            handler.next(error);
            return;
          }
          final refreshed = await _tryRefresh();
          if (!refreshed) {
            await _onLogout();
            handler.next(error);
            return;
          }
          try {
            final retryOptions = error.requestOptions;
            retryOptions.extra['retried'] = true;
            final token = await _tokenStore.readAccessToken();
            retryOptions.headers['Authorization'] = 'Bearer $token';
            final response = await dio.fetch(retryOptions);
            handler.resolve(response);
          } catch (_) {
            handler.next(error);
          }
        },
      ),
    );
  }

  final TokenStore _tokenStore;
  final LogoutCallback _onLogout;
  late final Dio dio;

  Future<bool> _tryRefresh() async {
    final refreshToken = await _tokenStore.readRefreshToken();
    if (refreshToken == null) return false;
    try {
      final response = await Dio(BaseOptions(baseUrl: kApiBaseUrl)).post(
        '/auth/refresh',
        data: {'refresh_token': refreshToken},
      );
      await _tokenStore.saveTokens(
        accessToken: response.data['token'] as String,
        refreshToken: response.data['refresh_token'] as String,
      );
      return true;
    } catch (_) {
      return false;
    }
  }
}
