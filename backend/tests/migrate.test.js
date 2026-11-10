const fs = require('fs');
const os = require('os');
const path = require('path');
const { migrate, listMigrationFiles } = require('../db/migrate');

const makeDir = (files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clinicrdv-migrations-'));
  for (const [name, sql] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), sql);
  }
  return dir;
};

const makePool = ({ hasUsers = true, applied = [], failOn = null } = {}) => {
  const queries = [];
  const client = {
    query: jest.fn(async (sql) => {
      queries.push(sql);
      if (failOn && sql.includes(failOn)) throw new Error('syntax error');
      if (sql.includes("to_regclass('public.users')")) {
        return { rows: [{ exists: hasUsers }] };
      }
      if (sql.startsWith('SELECT filename FROM schema_migrations')) {
        return { rows: applied.map((filename) => ({ filename })) };
      }
      return { rows: [] };
    }),
    release: jest.fn(),
  };
  return { pool: { connect: jest.fn(async () => client) }, client, queries };
};

const silent = () => {};

describe('db:migrate', () => {
  test('applique uniquement les migrations manquantes, dans l ordre', async () => {
    const dir = makeDir({
      '002_b.sql': 'SELECT 2;',
      '001_a.sql': 'SELECT 1;',
      '003_c.sql': 'SELECT 3;',
    });
    const { pool, queries } = makePool({ applied: ['001_a.sql'] });

    const applied = await migrate(pool, { dir, log: silent });

    expect(applied).toEqual(['002_b.sql', '003_c.sql']);
    expect(queries).not.toContain('SELECT 1;');
    expect(queries.indexOf('SELECT 2;')).toBeLessThan(queries.indexOf('SELECT 3;'));
  });

  test('execute chaque migration dans sa propre transaction et l enregistre', async () => {
    const dir = makeDir({ '001_a.sql': 'SELECT 1;' });
    const { pool, client, queries } = makePool();

    await migrate(pool, { dir, log: silent });

    const start = queries.indexOf('BEGIN');
    expect(queries.slice(start, start + 4)).toEqual([
      'BEGIN',
      'SELECT 1;',
      'INSERT INTO schema_migrations (filename) VALUES ($1)',
      'COMMIT',
    ]);
    expect(client.query).toHaveBeenCalledWith(
      'INSERT INTO schema_migrations (filename) VALUES ($1)',
      ['001_a.sql']
    );
  });

  test('annule la migration en echec et s arrete', async () => {
    const dir = makeDir({ '001_a.sql': 'BROKEN SQL;', '002_b.sql': 'SELECT 2;' });
    const { pool, client, queries } = makePool({ failOn: 'BROKEN' });

    await expect(migrate(pool, { dir, log: silent })).rejects.toThrow('001_a.sql');

    expect(queries).toContain('ROLLBACK');
    expect(queries).not.toContain('COMMIT');
    expect(queries).not.toContain('SELECT 2;');
    expect(client.release).toHaveBeenCalled();
  });

  test('refuse de migrer une base sans schema de base', async () => {
    const dir = makeDir({ '001_a.sql': 'SELECT 1;' });
    const { pool, queries } = makePool({ hasUsers: false });

    await expect(migrate(pool, { dir, log: silent })).rejects.toThrow('db:init');
    expect(queries).not.toContain('SELECT 1;');
  });

  test('ignore le BOM UTF-8 en debut de fichier', async () => {
    const dir = makeDir({ '001_a.sql': '﻿SELECT 1;' });
    const { pool, queries } = makePool();

    await migrate(pool, { dir, log: silent });

    expect(queries).toContain('SELECT 1;');
  });

  test('rejette les numeros en double et les noms invalides', () => {
    expect(() => listMigrationFiles(makeDir({ '001_a.sql': '', '001_b.sql': '' })))
      .toThrow('double');
    expect(() => listMigrationFiles(makeDir({ 'notifications.sql': '' })))
      .toThrow('invalide');
  });

  test('les migrations du projet ont des numeros uniques', () => {
    expect(() => listMigrationFiles(path.join(__dirname, '..', 'db', 'migrations')))
      .not.toThrow();
  });
});
