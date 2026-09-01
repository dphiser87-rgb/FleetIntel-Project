import * as SQLite from "expo-sqlite";

// Single local database serving two roles: a read-cache of last-synced server data (so browsing
// jobs/vehicles/templates needs no connectivity, not just submitting them) and a write-queue of
// offline mutations (so a dropped connection at submit time doesn't lose completed field work).
let _dbPromise = null;

function getDb() {
  if (!_dbPromise) {
    _dbPromise = SQLite.openDatabaseAsync("fleetintel.db").then(async (db) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;

        CREATE TABLE IF NOT EXISTS cache (
          collection TEXT NOT NULL,
          id TEXT NOT NULL,
          data TEXT NOT NULL,
          synced_at TEXT NOT NULL,
          PRIMARY KEY (collection, id)
        );

        CREATE TABLE IF NOT EXISTS outbox (
          id TEXT PRIMARY KEY NOT NULL,
          kind TEXT NOT NULL,
          method TEXT NOT NULL,
          endpoint TEXT NOT NULL,
          payload TEXT NOT NULL,
          queued_at TEXT NOT NULL
        );
      `);
      return db;
    });
  }
  return _dbPromise;
}

export async function cachePut(collection, rows) {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      await db.runAsync(
        "INSERT OR REPLACE INTO cache (collection, id, data, synced_at) VALUES (?, ?, ?, ?)",
        collection, row.id, JSON.stringify(row), now
      );
    }
  });
}

export async function cacheGetAll(collection) {
  const db = await getDb();
  const rows = await db.getAllAsync("SELECT data FROM cache WHERE collection = ?", collection);
  return rows.map((r) => JSON.parse(r.data));
}

export async function cacheGet(collection, id) {
  const db = await getDb();
  const row = await db.getFirstAsync("SELECT data FROM cache WHERE collection = ? AND id = ?", collection, id);
  return row ? JSON.parse(row.data) : null;
}

export async function cacheReplaceAll(collection, rows) {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM cache WHERE collection = ?", collection);
    for (const row of rows) {
      await db.runAsync(
        "INSERT OR REPLACE INTO cache (collection, id, data, synced_at) VALUES (?, ?, ?, ?)",
        collection, row.id, JSON.stringify(row), now
      );
    }
  });
}

export async function outboxPut({ id, kind, method, endpoint, payload }) {
  const db = await getDb();
  await db.runAsync(
    "INSERT OR REPLACE INTO outbox (id, kind, method, endpoint, payload, queued_at) VALUES (?, ?, ?, ?, ?, ?)",
    id, kind, method, endpoint, JSON.stringify(payload), new Date().toISOString()
  );
}

export async function outboxGetAll() {
  const db = await getDb();
  const rows = await db.getAllAsync("SELECT * FROM outbox ORDER BY queued_at ASC");
  return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
}

export async function outboxRemove(id) {
  const db = await getDb();
  await db.runAsync("DELETE FROM outbox WHERE id = ?", id);
}

export async function outboxCount() {
  const db = await getDb();
  const row = await db.getFirstAsync("SELECT COUNT(*) as n FROM outbox");
  return row?.n || 0;
}
