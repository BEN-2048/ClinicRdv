const { Pool } = require('pg');
const env = require('./env');

if (!env.databaseUrl) {
  console.warn('DATABASE_URL manquant : renseignez-le dans backend/.env');
}

const isLocal = !env.databaseUrl || /@(localhost|127\.0\.0\.1|db)(:\d+)?\//.test(env.databaseUrl);

const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: isLocal ? false : { rejectUnauthorized: true },
  max: Number(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

pool.on('error', (err) => {
  console.error('Connexion PostgreSQL inactive perdue :', err.message);
});

module.exports = pool;
