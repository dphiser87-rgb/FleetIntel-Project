import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

part 'app_database.g.dart';

/// Queued writes that failed to reach the backend, replayed on reconnect. Schema mirrors the
/// Expo prototype's proven outbox design (mobile_expo_old/src/lib/db.js) rather than reinventing
/// it: `kind` is a human label for the pending-sync UI, `method`/`endpoint`/`payloadJson` describe
/// the actual call to replay, `id` doubles as the client_submission_id the backend idempotency
/// check keys on.
class OutboxEntries extends Table {
  TextColumn get id => text()();
  TextColumn get kind => text()(); // "inspection" | "defect" | "parts_requisition" | "maintenance_photo"
  TextColumn get method => text()(); // "POST" | "PATCH"
  TextColumn get endpoint => text()();
  TextColumn get payloadJson => text()();
  DateTimeColumn get queuedAt => dateTime()();

  /// Set when the server rejected this entry in a way retrying cannot fix (a validation error).
  /// The row is kept rather than deleted so the work is still visible to whoever captured it --
  /// previously any non-401 response deleted the entry outright, so a rejected inspection vanished
  /// with no trace. Null means still pending.
  TextColumn get failedReason => text().nullable()();
  DateTimeColumn get failedAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Read-cache of last-synced server data (templates, vehicle, driver-context) so the driver flow
/// works from launch through submission with no connectivity, not just at the final submit step.
class CacheEntries extends Table {
  TextColumn get collection => text()();
  TextColumn get id => text()();
  TextColumn get dataJson => text()();
  DateTimeColumn get syncedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {collection, id};
}

@DriftDatabase(tables: [OutboxEntries, CacheEntries])
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(_openConnection());

  /// In-memory or otherwise injected executor, for tests.
  AppDatabase.forTesting(super.executor);

  @override
  int get schemaVersion => 2;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) => m.createAll(),
        onUpgrade: (m, from, to) async {
          // v2 adds the failure columns to outbox_entries. Added rather than recreating the table
          // so anything already queued on a device survives the upgrade -- the whole point of this
          // change is that queued work stops disappearing.
          if (from < 2) {
            await m.addColumn(outboxEntries, outboxEntries.failedReason);
            await m.addColumn(outboxEntries, outboxEntries.failedAt);
          }
        },
      );

  Future<void> cacheReplaceAll(String collection, List<MapEntry<String, String>> idToJson) async {
    await transaction(() async {
      await (delete(cacheEntries)..where((t) => t.collection.equals(collection))).go();
      for (final entry in idToJson) {
        await into(cacheEntries).insert(
          CacheEntriesCompanion.insert(
            collection: collection,
            id: entry.key,
            dataJson: entry.value,
            syncedAt: DateTime.now(),
          ),
        );
      }
    });
  }

  Future<List<String>> cacheGetAll(String collection) async {
    final rows = await (select(cacheEntries)..where((t) => t.collection.equals(collection))).get();
    return rows.map((r) => r.dataJson).toList();
  }
}

LazyDatabase _openConnection() {
  return LazyDatabase(() async {
    final dbFolder = await getApplicationDocumentsDirectory();
    final file = File(p.join(dbFolder.path, 'fleetintel_mobile.sqlite'));
    return NativeDatabase.createInBackground(file);
  });
}
