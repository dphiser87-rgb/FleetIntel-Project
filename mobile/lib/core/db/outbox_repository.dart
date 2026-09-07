import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:drift/drift.dart' show OrderingTerm;

import 'app_database.dart';

enum FlushOutcome { ok, authExpired, networkDown }

/// Queue-and-flush for writes that can't reach the backend right now. Only endpoints the backend
/// actually supports idempotent retry for (via client_submission_id) belong here: inspections,
/// maintenance-photos, parts-requisitions, defects. Semantics ported from the proven Expo
/// prototype's offlineQueue.js: a 401 on flush means the refresh itself failed (dio's own
/// interceptor already tried silently), so stop rather than burn through the rest of the queue;
/// a network error just means try again later; anything else is a real server rejection the
/// client already should have validated against, so drop it rather than loop forever.
class OutboxRepository {
  OutboxRepository(this._db, this._dio);

  final AppDatabase _db;
  final Dio _dio;

  Future<void> enqueue({
    required String id,
    required String kind,
    required String method,
    required String endpoint,
    required Map<String, dynamic> payload,
  }) async {
    await _db.into(_db.outboxEntries).insert(
          OutboxEntriesCompanion.insert(
            id: id,
            kind: kind,
            method: method,
            endpoint: endpoint,
            payloadJson: jsonEncode(payload),
            queuedAt: DateTime.now(),
          ),
        );
  }

  Future<int> pendingCount() async {
    final rows = await _db.select(_db.outboxEntries).get();
    return rows.length;
  }

  Future<FlushOutcome> flush() async {
    final rows = await (_db.select(_db.outboxEntries)
          ..orderBy([(t) => OrderingTerm.asc(t.queuedAt)]))
        .get();

    for (final row in rows) {
      final payload = jsonDecode(row.payloadJson) as Map<String, dynamic>;
      try {
        if (row.method == 'PATCH') {
          await _dio.patch(row.endpoint, data: payload);
        } else {
          await _dio.post(row.endpoint, data: payload);
        }
        await (_db.delete(_db.outboxEntries)..where((t) => t.id.equals(row.id))).go();
      } on DioException catch (e) {
        if (e.response?.statusCode == 401) return FlushOutcome.authExpired;
        if (e.response == null) return FlushOutcome.networkDown;
        // A real server-rejected error: retrying won't help, drop it.
        await (_db.delete(_db.outboxEntries)..where((t) => t.id.equals(row.id))).go();
      }
    }
    return FlushOutcome.ok;
  }
}
