const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const LOCK_ID = 727274001;
const FILE_PATTERN = /^(\d{3})_[a-z0-9_]+\.sql$/;

const listMigrationFiles = (dir) => {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const seen = new Map();

  for (const file of files) {
    const match = FILE_PATTERN.exec(file);
    if (!match) {
      throw new Error(`Nom de migration invalide : ${file} (attendu : 001_description.sql)`);
    }
    if (seen.has(match[1])) {
      throw new Error(`Numero de migration en double : ${seen.get(match[1])} et ${file}`);
    }
    seen.set(match[1], file);
  }

  return files;
};

const readSql = (dir, file) =>
  fs.readFileSync(path.join(dir, file), 'utf8').replace(/^﻿/, '');

const migrate = async (pool, { dir = MIGRATIONS_DIR, log = console.log } = {}) => {
  const files = listMigrationFiles(dir);
  const client = await pool.connect();
  const applied = [];

  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);

    const base = await client.query(
      "SELECT to_regclass('public.users') IS NOT NULL AS exists"
    );
    if (!base.rows[0].exists) {
      throw new Error('Schema de base absent : lancez npm run db:init');
    }

    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         filename VARCHAR(255) PRIMARY KEY,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`
    );

    const done = await client.query('SELECT filename FROM schema_migrations');
    const doneSet = new Set(done.rows.map((r) => r.filename));
    const pending = files.filter((f) => !doneSet.has(f));

    for (const file of pending) {
      try {
        await client.query('BEGIN');
        await client.query(readSql(dir, file));
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`Echec de la migration ${file} : ${error.message}`);
      }
      applied.push(file);
      log(`Migration appliquee : ${file}`);
    }

    if (!applied.length) log('Base a jour, aucune migration a appliquer.');
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    client.release();
  }
};

module.exports = { migrate, listMigrationFiles };

if (require.main === module) {
  const pool = require('../src/config/db');
  migrate(pool)
    .catch((error) => {
      console.error('Erreur db:migrate :', error.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
