const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');

(async () => {
  const reset = process.argv.includes('--reset');
  try {
    const { rows } = await pool.query("SELECT to_regclass('public.users') IS NOT NULL AS exists");
    if (rows[0].exists && !reset) {
      console.error('La base contient déjà des tables. db:init les supprimerait toutes.');
      console.error('Pour tout effacer et recréer : npm run db:reset');
      process.exitCode = 1;
      return;
    }
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('Schéma créé');
  } catch (e) {
    console.error('Erreur db:init :', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
