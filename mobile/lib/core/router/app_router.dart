import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/login/login_screen.dart';
import '../../features/templates/template_picker_screen.dart';
import '../../features/vehicle/vehicle_confirm_screen.dart';
import '../../features/welcome/welcome_screen.dart';
import '../auth/auth_state.dart';

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/login',
    refreshListenable: _AuthListenable(ref),
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      final loggingIn = state.matchedLocation == '/login';

      if (auth.status == AuthStatus.unknown) return null; // wait for restore
      if (!auth.isAuthenticated) return loggingIn ? null : '/login';
      if (auth.isAuthenticated && loggingIn) return '/welcome';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/welcome', builder: (context, state) => const WelcomeScreen()),
      GoRoute(path: '/vehicle', builder: (context, state) => const VehicleConfirmScreen()),
      GoRoute(
        path: '/templates',
        builder: (context, state) => TemplatePickerScreen(
          driverContext: state.extra as Map<String, dynamic>?,
        ),
      ),
    ],
  );
});

/// Bridges Riverpod's authControllerProvider into go_router's Listenable-based
/// refresh mechanism, so a login/logout re-runs the redirect logic automatically.
class _AuthListenable extends ChangeNotifier {
  _AuthListenable(Ref ref) {
    ref.listen(authControllerProvider, (previous, next) => notifyListeners());
  }
}
