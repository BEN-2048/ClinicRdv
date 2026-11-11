import { getOfflineDatabase } from '../database/offlineDatabase';
import type { EmergencyDirectory } from '../api/services';

const KEY = 'emergency_directory';

const ensureTable = async () => {
  const db = await getOfflineDatabase();
  await db.execAsync(
    'CREATE TABLE IF NOT EXISTS public_cache (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, saved_at TEXT NOT NULL)'
  );
  return db;
};

export async function saveEmergencyDirectory(directory: EmergencyDirectory): Promise<void> {
  const db = await ensureTable();
  await db.runAsync(
    'INSERT OR REPLACE INTO public_cache (key, value, saved_at) VALUES (?, ?, ?)',
    KEY,
    JSON.stringify(directory),
    new Date().toISOString()
  );
}

export async function getCachedEmergencyDirectory(): Promise<{ directory: EmergencyDirectory; savedAt: string } | null> {
  const db = await ensureTable();
  const row = await db.getFirstAsync<{ value: string; saved_at: string }>(
    'SELECT value, saved_at FROM public_cache WHERE key = ?',
    KEY
  );
  if (!row) return null;
  try {
    return { directory: JSON.parse(row.value) as EmergencyDirectory, savedAt: row.saved_at };
  } catch {
    return null;
  }
}
