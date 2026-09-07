import 'dart:convert';

import 'package:dio/dio.dart';

import '../db/app_database.dart';

/// Sources the module/permission-level matrix from GET /permissions/presets (same endpoint the
/// Expo prototype used, mobile_expo_old/src/lib/access.js) rather than hand-copying
/// MODULE_KEYS/PROFILE_PRESETS from the backend -- one source of truth instead of drifting
/// copies. Cached locally so nav gating still works offline after the first successful fetch.
const Map<String, int> kAccessLevels = {'none': 0, 'read': 1, 'full': 2};

const _presetsCollection = 'permissions_presets';
const _presetsDocId = 'presets';

class AccessModules {
  AccessModules._();
  static const vehicleChecklist = 'vehicle_checklist';
}

class PermissionPresets {
  PermissionPresets({required this.moduleKeys, required this.presets});

  final List<String> moduleKeys;
  final Map<String, Map<String, String>> presets;

  factory PermissionPresets.fromJson(Map<String, dynamic> json) {
    final presetsJson = (json['presets'] as Map).cast<String, dynamic>();
    return PermissionPresets(
      moduleKeys: (json['module_keys'] as List).cast<String>(),
      presets: presetsJson.map(
        (role, modules) => MapEntry(role, (modules as Map).cast<String, String>()),
      ),
    );
  }
}

class AccessRepository {
  AccessRepository(this._dio, this._db);

  final Dio _dio;
  final AppDatabase _db;

  Future<PermissionPresets> loadPresets() async {
    try {
      final response = await _dio.get('/permissions/presets');
      final data = Map<String, dynamic>.from(response.data);
      await _db.cacheReplaceAll(_presetsCollection, [MapEntry(_presetsDocId, jsonEncode(data))]);
      return PermissionPresets.fromJson(data);
    } catch (_) {
      final cached = await _db.cacheGetAll(_presetsCollection);
      if (cached.isEmpty) return PermissionPresets(moduleKeys: [], presets: {});
      return PermissionPresets.fromJson(jsonDecode(cached.first) as Map<String, dynamic>);
    }
  }
}

bool hasModuleAccess(
  Map<String, dynamic> user,
  PermissionPresets presets,
  String module, {
  String atLeast = 'read',
}) {
  final rolePreset = presets.presets[user['role']] ?? {};
  final userModules = (user['permissions'] as Map?)?['modules'] as Map? ?? {};
  final level = (userModules[module] as String?) ?? rolePreset[module] ?? 'none';
  return (kAccessLevels[level] ?? 0) >= (kAccessLevels[atLeast] ?? 0);
}
