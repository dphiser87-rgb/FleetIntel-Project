import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/executive/executive_dashboard_screen.dart';
import '../../features/executive/executive_supplier_screen.dart';
import '../../features/executive/executive_vehicle_screen.dart';
import '../../features/history/history_detail_screen.dart';
import '../../features/history/history_screen.dart';
import '../../features/login/login_screen.dart';
import '../../features/templates/template_picker_screen.dart';
import '../../features/vehicle/vehicle_confirm_screen.dart';
import '../../features/vehicle/vehicle_picker_screen.dart';
import '../../features/welcome/welcome_screen.dart';
import '../../features/workshop/workshop_board_screen.dart';
import '../../features/workshop/workshop_cost_rollup_screen.dart';
import '../../features/workshop/workshop_job_detail_screen.dart';
import '../../features/workshop/workshop_pos_screen.dart';
import '../../features/workshop/workshop_queue_screen.dart';
import '../../features/workshop/workshop_requisition_screen.dart';
import '../auth/auth_state.dart';

/// Roles that land on the Workshop area instead of the driver flow -- matches the FleetHub-Workshop
/// reference's WORKSHOP_ROLES exactly, using this backend's actual role strings (server.py's
/// OPS_ROLES/FINANCE_ROLES/REQUISITION_APPROVER_ROLES constants), not the reference's Mongo-prototype
/// shorthand ("ops" -> "operations_manager", etc).
const _kWorkshopRoles = {'mechanic', 'workshop_head', 'operations_manager', 'finance', 'admin'};

/// Roles that land on the Executive dashboard instead of the driver flow. `finance`/`admin` also have
/// read access to this module per the backend's role presets, but they already land on `/workshop`
/// above (a redirect only fires on the FIRST matching set, so this only actually changes the landing
/// screen for `executive`).
const _kExecutiveRoles = {'executive'};

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/login',
    refreshListenable: _AuthListenable(ref),
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      final loggingIn = state.matchedLocation == '/login';

      if (auth.status == AuthStatus.unknown) return null; // wait for restore
      if (!auth.isAuthenticated) return loggingIn ? null : '/login';
      if (auth.isAuthenticated && loggingIn) {
        final role = auth.user?['role'] as String?;
        if (_kWorkshopRoles.contains(role)) return '/workshop';
        if (_kExecutiveRoles.contains(role)) return '/executive';
        return '/welcome';
      }
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/welcome', builder: (context, state) => const WelcomeScreen()),
      GoRoute(path: '/workshop', builder: (context, state) => const WorkshopBoardScreen()),
      GoRoute(
        path: '/workshop/job/:id',
        builder: (context, state) => WorkshopJobDetailScreen(jobId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/workshop/requisition/:jobId',
        builder: (context, state) => WorkshopRequisitionScreen(jobId: state.pathParameters['jobId']!),
      ),
      GoRoute(path: '/workshop/pos', builder: (context, state) => const WorkshopPosScreen()),
      GoRoute(path: '/workshop/queue', builder: (context, state) => const WorkshopQueueScreen()),
      GoRoute(path: '/workshop/cost-rollup', builder: (context, state) => const WorkshopCostRollupScreen()),
      GoRoute(path: '/executive', builder: (context, state) => const ExecutiveDashboardScreen()),
      GoRoute(
        path: '/executive/vehicle/:id',
        builder: (context, state) => ExecutiveVehicleScreen(
          vehicleId: state.pathParameters['id']!,
          range: state.uri.queryParameters['range'] ?? 'year',
        ),
      ),
      GoRoute(
        path: '/executive/supplier',
        builder: (context, state) => ExecutiveSupplierScreen(
          supplierName: state.uri.queryParameters['name'] ?? 'Unknown',
          range: state.uri.queryParameters['range'] ?? 'year',
        ),
      ),
      GoRoute(path: '/vehicle', builder: (context, state) => const VehicleConfirmScreen()),
      GoRoute(path: '/vehicle-picker', builder: (context, state) => const VehiclePickerScreen()),
      GoRoute(
        path: '/templates',
        builder: (context, state) => TemplatePickerScreen(
          driverContext: state.extra as Map<String, dynamic>?,
        ),
      ),
      GoRoute(path: '/history', builder: (context, state) => const HistoryScreen()),
      GoRoute(
        path: '/history/:id',
        builder: (context, state) => HistoryDetailScreen(inspectionId: state.pathParameters['id']!),
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
