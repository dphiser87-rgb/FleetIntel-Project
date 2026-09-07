import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

part 'app_database.g.dart';

/// Queued writes waiting to reach the backend. Only the four endpoints the backend
/// actually supports idempotent offline retry for (via client_submission_id) belong
/// here: inspections, maintenance-photos, parts-requisitions, defects -- see
/// endpoint column. Each row is one POST body plus enough metadata to replay it.
class OutboxEntries extends Table {
  TextColumn get id => text()(); // uuid, also used as client_submission_id
  TextColumn get endpoint => text()(); // e.g. "/inspections"
  TextColumn get payloadJson => text()();
  DateTimeColumn get createdAt => dateTime()();
  IntColumn get attempts => integer().withDefault(const Constant(0))();
  TextColumn get lastError => text().nullable()();
  BoolColumn get synced => boolean().withDefault(const Constant(false))();

  @override
  Set<Column> get primaryKey => {id};
}

@DriftDatabase(tables: [OutboxEntries])
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(_openConnection());

  @override
  int get schemaVersion => 1;
}

LazyDatabase _openConnection() {
  return LazyDatabase(() async {
    final dbFolder = await getApplicationDocumentsDirectory();
    final file = File(p.join(dbFolder.path, 'fleetintel_mobile.sqlite'));
    return NativeDatabase.createInBackground(file);
  });
}
