import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fleetintel_mobile/core/db/app_database.dart';
import 'package:fleetintel_mobile/core/db/outbox_repository.dart';

/// Answers every request with a fixed status, or simulates being offline when [status] is null.
class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this.status, {this.detail});

  int? status;
  final String? detail;
  int calls = 0;

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    calls++;
    if (status == null) {
      throw DioException(requestOptions: options, type: DioExceptionType.connectionError);
    }
    final body = detail == null ? '{}' : jsonEncode({'detail': detail});
    return ResponseBody.fromString(body, status!, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  late AppDatabase db;
  late _FakeAdapter adapter;
  late OutboxRepository repo;

  Future<void> queue(String id) => repo.enqueue(
        id: id,
        kind: 'inspection',
        method: 'POST',
        endpoint: '/inspections',
        payload: {'client_submission_id': id},
      );

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    adapter = _FakeAdapter(200);
    final dio = Dio(BaseOptions(baseUrl: 'https://example.test'))..httpClientAdapter = adapter;
    repo = OutboxRepository(db, dio);
  });

  tearDown(() => db.close());

  test('success is the only path that removes an entry', () async {
    await queue('a');
    expect(await repo.flush(), FlushOutcome.ok);
    expect(await repo.pendingCount(), 0);
    expect(await repo.failedCount(), 0);
  });

  test('offline keeps everything queued', () async {
    adapter.status = null;
    await queue('a');
    expect(await repo.flush(), FlushOutcome.networkDown);
    expect(await repo.pendingCount(), 1);
  });

  test('401 stops the flush and keeps the entry', () async {
    adapter.status = 401;
    await queue('a');
    await queue('b');
    expect(await repo.flush(), FlushOutcome.authExpired);
    expect(await repo.pendingCount(), 2);
    expect(adapter.calls, 1, reason: 'must stop at the first 401, not burn through the queue');
  });

  test('423 account hold keeps the whole queue and stops', () async {
    adapter.status = 423;
    await queue('a');
    await queue('b');
    expect(await repo.flush(), FlushOutcome.accountHold);
    expect(await repo.pendingCount(), 2, reason: 'a suspended account must not lose field work');
    expect(await repo.failedCount(), 0);
    expect(adapter.calls, 1);
  });

  for (final status in [403, 408, 425, 429, 500, 502, 503]) {
    test('$status is transient: retained as pending, never deleted', () async {
      adapter.status = status;
      await queue('a');
      expect(await repo.flush(), FlushOutcome.ok);
      expect(await repo.pendingCount(), 1);
      expect(await repo.failedCount(), 0);
    });
  }

  for (final status in [400, 404, 409, 422]) {
    test('$status is a real rejection: kept and marked failed, not deleted', () async {
      adapter.status = status;
      await queue('a');
      await repo.flush();
      expect(await repo.pendingCount(), 0, reason: 'must not be retried forever');
      expect(await repo.failedCount(), 1, reason: 'must not vanish either');
    });
  }

  test('a failed entry is not re-sent on the next flush', () async {
    adapter.status = 422;
    await queue('a');
    await repo.flush();
    final callsAfterFirst = adapter.calls;
    await repo.flush();
    expect(adapter.calls, callsAfterFirst);
  });

  test('failure reason carries the server detail', () async {
    adapter = _FakeAdapter(422, detail: 'Odometer reading is lower than the previous one');
    final dio = Dio(BaseOptions(baseUrl: 'https://example.test'))..httpClientAdapter = adapter;
    repo = OutboxRepository(db, dio);
    await queue('a');
    await repo.flush();
    final failed = await repo.failedEntries();
    expect(failed.single.failedReason, 'Odometer reading is lower than the previous one');
    expect(failed.single.failedAt, isNotNull);
  });

  test('retryFailed requeues an entry, and it syncs once the server accepts it', () async {
    adapter.status = 422;
    await queue('a');
    await repo.flush();
    expect(await repo.failedCount(), 1);

    await repo.retryFailed('a');
    expect(await repo.pendingCount(), 1);
    expect(await repo.failedCount(), 0);

    adapter.status = 200;
    await repo.flush();
    expect(await repo.pendingCount(), 0);
    expect(await repo.failedCount(), 0);
  });

  test('discardFailed removes only when the user explicitly chooses to', () async {
    adapter.status = 422;
    await queue('a');
    await repo.flush();
    await repo.discardFailed('a');
    expect(await repo.failedCount(), 0);
  });

  test('a transient failure does not block the entries behind it', () async {
    // First request 500s, the rest succeed.
    var n = 0;
    final dio = Dio(BaseOptions(baseUrl: 'https://example.test'))
      ..httpClientAdapter = _SequencedAdapter(() => n++ == 0 ? 500 : 200);
    repo = OutboxRepository(db, dio);
    await queue('a');
    await queue('b');
    await queue('c');
    await repo.flush();
    expect(await repo.pendingCount(), 1, reason: 'only the 500 stays; b and c still went through');
  });

  test('suspension then reactivation: nothing lost, everything syncs', () async {
    adapter.status = 423;
    for (final id in ['a', 'b', 'c']) {
      await queue(id);
    }
    expect(await repo.flush(), FlushOutcome.accountHold);
    expect(await repo.pendingCount(), 3);

    adapter.status = 200; // account reactivated
    expect(await repo.flush(), FlushOutcome.ok);
    expect(await repo.pendingCount(), 0);
    expect(await repo.failedCount(), 0);
  });
}

class _SequencedAdapter implements HttpClientAdapter {
  _SequencedAdapter(this.next);
  final int Function() next;

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    return ResponseBody.fromString('{}', next(), headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  @override
  void close({bool force = false}) {}
}
