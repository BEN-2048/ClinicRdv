import * as SQLite from "expo-sqlite";

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

const SCHEMA_VERSION = 2;

async function migrateOfflineDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  const version = row?.user_version ?? 0;
  if (version >= SCHEMA_VERSION) return;

  await db.withExclusiveTransactionAsync(async (tx) => {
    if (version < 2) {
      for (const column of [
        "facility_id INTEGER",
        "facility_name TEXT",
        "facility_timezone TEXT",
        "facility_phone TEXT",
        "facility_emergency_phone TEXT",
        "doctor_phone TEXT",
      ]) {
        await tx.execAsync(`ALTER TABLE cached_appointments ADD COLUMN ${column}`);
      }
      await tx.execAsync("ALTER TABLE cached_doctors ADD COLUMN phone TEXT");
      await tx.execAsync(`
        CREATE TABLE IF NOT EXISTS cached_facilities (
          user_id TEXT NOT NULL,
          facility_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          city TEXT,
          address TEXT,
          phone TEXT,
          emergency_phone TEXT,
          timezone TEXT,
          cached_at TEXT NOT NULL,
          PRIMARY KEY (user_id, facility_id)
        )
      `);
    }
    await tx.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
}

export async function getOfflineDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync("clinicrdv-offline.db")
      .then(async (db) => {
        await db.execAsync(`
          PRAGMA journal_mode = WAL;

          CREATE TABLE IF NOT EXISTS cached_profile (
            user_id TEXT PRIMARY KEY NOT NULL,
            email TEXT NOT NULL,
            role TEXT NOT NULL,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            phone TEXT,
            updated_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS cached_appointments (
            user_id TEXT NOT NULL,
            appointment_id INTEGER NOT NULL,
            doctor_id INTEGER NOT NULL,
            doctor_name TEXT,
            starts_at TEXT NOT NULL,
            ends_at TEXT NOT NULL,
            status TEXT NOT NULL,
            specialty TEXT,
            cached_at TEXT NOT NULL,
            PRIMARY KEY (user_id, appointment_id)
          );

          CREATE TABLE IF NOT EXISTS cached_doctors (
            user_id TEXT NOT NULL,
            doctor_id INTEGER NOT NULL,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            specialty TEXT NOT NULL,
            fee TEXT NOT NULL,
            consultation_minutes INTEGER NOT NULL,
            languages_json TEXT,
            cached_at TEXT NOT NULL,
            PRIMARY KEY (user_id, doctor_id)
          );

          CREATE TABLE IF NOT EXISTS sync_metadata (
            user_id TEXT NOT NULL,
            resource TEXT NOT NULL,
            last_synced_at TEXT NOT NULL,
            PRIMARY KEY (user_id, resource)
          );

          CREATE INDEX IF NOT EXISTS idx_cached_appointments_date
          ON cached_appointments(user_id, starts_at);

          CREATE INDEX IF NOT EXISTS idx_cached_doctors_specialty
          ON cached_doctors(user_id, specialty);
        `);

        await migrateOfflineDatabase(db);

        return db;
      })
      .catch((error) => {
        databasePromise = null;
        throw error;
      });
  }

  return databasePromise;
}
