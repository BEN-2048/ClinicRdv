require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { Pool } = require('pg');
const { parseKey, encrypt, pgEnv, majorVersion } = require('./backupCrypto');

const pgDump = process.env.PG_DUMP_PATH || 'pg_dump';
const outDir = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');

(async () => {
  const key = parseKey(process.env.BACKUP_ENCRYPTION_KEY);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL manquante');

  const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: true } });
  const server = (await pool.query('SHOW server_version')).rows[0].server_version;
  const migrations = (await pool.query('SELECT filename FROM schema_migrations ORDER BY filename')).rows.map((r) => r.filename);
  await pool.end();

  const client = execFileSync(pgDump, ['--version']).toString();
  if (majorVersion(client) < majorVersion(server)) {
    throw new Error(
      `pg_dump ${majorVersion(client)} ne peut pas sauvegarder un serveur PostgreSQL ${majorVersion(server)} : ` +
      `installez les outils clients PostgreSQL ${majorVersion(server)} et renseignez PG_DUMP_PATH`
    );
  }

  const dump = execFileSync(pgDump, ['--format=custom', '--no-owner', '--no-privileges'], {
    env: { ...process.env, ...pgEnv(databaseUrl) },
    maxBuffer: 1024 * 1024 * 1024,
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
  const file = path.join(outDir, `clinicrdv-${stamp}.dump.enc`);
  const sealed = encrypt(dump, key);
  fs.writeFileSync(file, sealed, { mode: 0o600, flag: 'wx' });
  fs.writeFileSync(`${file}.json`, JSON.stringify({
    createdAt: new Date().toISOString(),
    serverVersion: server,
    lastMigration: migrations[migrations.length - 1] ?? null,
    plainBytes: dump.length,
    encryptedBytes: sealed.length,
    sha256: crypto.createHash('sha256').update(sealed).digest('hex'),
  }, null, 2), { mode: 0o600 });

  console.log(`Sauvegarde chiffrée : ${file}`);
})().catch((error) => {
  console.error('Erreur db:backup :', error.message);
  process.exitCode = 1;
});
