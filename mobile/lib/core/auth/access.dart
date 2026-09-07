/// Mirrors backend/server.py's System Rights matrix (MODULE_KEYS + require_module's
/// "none" < "read" < "full" ordering) so route guards here match what the API will
/// actually allow -- avoids showing a screen the backend then rejects. The mobile app
/// only ever needs the driver-relevant subset, but the levels/ordering must stay the
/// same shape as the backend's for the comparison logic to mean anything.
const Map<String, int> kAccessLevels = {'none': 0, 'read': 1, 'full': 2};

class AccessModules {
  AccessModules._();
  static const vehicleChecklist = 'vehicle_checklist';
}

bool hasModuleAccess(Map<String, dynamic> permissions, String module, {String atLeast = 'read'}) {
  final modules = (permissions['modules'] as Map?)?.cast<String, dynamic>() ?? {};
  final level = modules[module] as String? ?? 'none';
  return (kAccessLevels[level] ?? 0) >= (kAccessLevels[atLeast] ?? 0);
}
