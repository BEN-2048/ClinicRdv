require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { Pool } = require('pg');
const { parseKey, decrypt, pgEnv, sameDatabase } = require('./backupCrypto');

const pgRestore = process.env.PG_RESTORE_PATH || 'pg_restore';
const CHECK_TABLES = [
  'users', 'patients', 'appointments', 'consultation_notes',
  'facilities', 'medical_documents', 'patient_access_logs', 'schema_migrations',
];

(async () => {
  const [file] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!file) throw new Error('Usage : npm run db:restore -- <fichier.dump.enc> --confirm');
  if (!process.argv.includes('--confirm')) throw new Error('Ajoutez --confirm : la base cible sera écrasée');

  const target = process.env.RESTORE_DATABASE_URL;
  if (!target) throw new Error('RESTORE_DATABASE_URL manquante (base de test, jamais la production)');
  if (process.env.DATABASE_URL && sameDatabase(target, process.env.DATABASE_URL)) {
    throw new Error('RESTORE_DATABASE_URL désigne la base principale : restauration refusée');
  }

  const plain = decrypt(fs.readFileSync(file), parseKey(process.env.BACKUP_ENCRYPTION_KEY));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clinicrdv-restore-'));
  const tmp = path.join(dir, 'dump');
  fs.writeFileSync(tmp, plain, { mode: 0o600 });
  try {
    const env = pgEnv(target);
    execFileSync(pgRestore, ['--no-owner', '--no-privileges', '--clean', '--if-exists', '--exit-on-error', '-d', env.PGDATABASE, tmp], {
      env: { ...process.env, ...env },
      stdio: 'inherit',
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  const local = /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(target);
  const pool = new Pool({ connectionString: target, ssl: local ? false : { rejectUnauthorized: true } });
  for (const table of CHECK_TABLES) {
    const r = await pool.query(`SELECT count(*)::int AS n FROM ${table}`).catch(() => ({ rows: [{ n: 'absente' }] }));
    console.log(`${table.padEnd(22)} ${r.rows[0].n}`);
  }
  await pool.end();
  console.log('Restauration terminée : comparez ces chiffres avec la base d’origine.');
})().catch((error) => {
  console.error('Erreur db:restore :', error.message);
  process.exitCode = 1;
});
