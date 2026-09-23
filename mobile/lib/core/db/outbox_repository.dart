import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:drift/drift.dart' show OrderingTerm, Value;

import 'app_database.dart';

enum FlushOutcome {
  ok,
  authExpired,
  networkDown,

  /// The account is on a billing or security hold. Everything stays queued; the caller surfaces the
  /// hold and stops flushing, since every remaining entry would be refused the same way.
  accountHold,
}

/// Queue-and-flush for writes that can't reach the backend right now. Only endpoints the backend
/// actually supports idempotent retry for (via client_submission_id) belong here: inspections,
/// maintenance-photos, parts-requisitions, defects.
///
/// Responses are classified rather than split simply on "did we get one". The earlier rule --
/// anything other than a 401 or a network failure is "a real server rejection the client should
/// have validated against", so delete it -- is right for a validation error and wrong for
/// everything else it caught. A 403, a 423 hold, a 429 or any 5xx would silently destroy a
/// mechanic's queued inspection over a transient or policy condition that retrying would clear.
/// Nothing in the queue is deleted now except on success.
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

  /// Entries still waiting to sync. Excludes ones the server permanently rejected, so the pending
  /// badge doesn't count work that will never go.
  Future<int> pendingCount() async {
    final rows = await (_db.select(_db.outboxEntries)..where((t) => t.failedReason.isNull())).get();
    return rows.length;
  }

  /// Entries the server rejected outright. Kept so the capture isn't lost and can be surfaced.
  Future<int> failedCount() async {
    final rows = await (_db.select(_db.outboxEntries)..where((t) => t.failedReason.isNotNull())).get();
    return rows.length;
  }

  Future<List<OutboxEntry>> failedEntries() {
    return (_db.select(_db.outboxEntries)
          ..where((t) => t.failedReason.isNotNull())
          ..orderBy([(t) => OrderingTerm.asc(t.queuedAt)]))
        .get();
  }

  /// Clears a permanent rejection so the entry is retried on the next flush. For a "try again"
  /// affordance once the underlying problem (a lapsed permission, a corrected record) is resolved.
  Future<void> retryFailed(String id) async {
    await (_db.update(_db.outboxEntries)..where((t) => t.id.equals(id)))
        .write(const OutboxEntriesCompanion(failedReason: Value(null), failedAt: Value(null)));
  }

  Future<void> discardFailed(String id) async {
    await (_db.delete(_db.outboxEntries)..where((t) => t.id.equals(id))).go();
  }

  Future<FlushOutcome> flush() async {
    final rows = await (_db.select(_db.outboxEntries)
          ..where((t) => t.failedReason.isNull())
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
        // Success is the only path that removes an entry.
        await (_db.delete(_db.outboxEntries)..where((t) => t.id.equals(row.id))).go();
      } on DioException catch (e) {
        final status = e.response?.statusCode;

        // No response at all: still offline. Everything stays queued.
        if (e.response == null) return FlushOutcome.networkDown;

        // The silent refresh in dio's interceptor already failed, so stop rather than burn through
        // the rest of the queue against an expired session.
        if (status == 401) return FlushOutcome.authExpired;

        // Account hold. Every other entry would be refused identically, so stop and let the caller
        // explain it. Nothing is dropped; uploads resume once the hold clears.
        if (status == 423) return FlushOutcome.accountHold;

        if (_isRetryable(status)) {
          // Transient. Leave it queued and try again on the next flush rather than deleting a
          // capture because the server had a bad moment.
          continue;
        }

        // A genuine rejection retrying cannot fix. Keep the row, mark it, and let it surface --
        // looping forever is wrong, but so is destroying the work without telling anyone.
        await (_db.update(_db.outboxEntries)..where((t) => t.id.equals(row.id))).write(
          OutboxEntriesCompanion(
            failedReason: Value(_reasonFor(status, e)),
            failedAt: Value(DateTime.now()),
          ),
        );
      }
    }
    return FlushOutcome.ok;
  }

  /// 408 timeout, 425 too-early, 429 rate-limited and every 5xx are conditions a later attempt can
  /// clear. 403 is included deliberately: permissions get widened again, and a narrowed module
  /// shouldn't cost a mechanic work already captured in the field.
  bool _isRetryable(int? status) {
    if (status == null) return true;
    if (status >= 500) return true;
    return status == 403 || status == 408 || status == 425 || status == 429;
  }

  String _reasonFor(int? status, DioException e) {
    final detail = e.response?.data is Map ? (e.response!.data as Map)['detail'] : null;
    if (detail is String && detail.isNotEmpty) return detail;
    return 'Rejected by the server (HTTP ${status ?? 'unknown'})';
  }
}
