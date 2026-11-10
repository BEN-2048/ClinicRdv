const crypto = require('crypto');

const MAGIC = Buffer.from('CLRDVBK1');
const IV_BYTES = 12;
const TAG_BYTES = 16;

const parseKey = (value) => {
  if (!value) throw new Error('BACKUP_ENCRYPTION_KEY manquante : aucune sauvegarde non chiffrée n’est autorisée');
  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY doit faire 32 octets (64 caractères hexadécimaux)');
  return key;
};

const encrypt = (plain, key) => {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(MAGIC);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
};

const decrypt = (sealed, key) => {
  if (sealed.length < MAGIC.length + IV_BYTES + TAG_BYTES || !sealed.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('Fichier de sauvegarde ClinicRDV invalide');
  }
  const iv = sealed.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
  const tag = sealed.subarray(MAGIC.length + IV_BYTES, MAGIC.length + IV_BYTES + TAG_BYTES);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(sealed.subarray(MAGIC.length + IV_BYTES + TAG_BYTES)), decipher.final()]);
};

const pgEnv = (databaseUrl) => {
  const url = new URL(databaseUrl);
  const sslmode = url.searchParams.get('sslmode');
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, '')),
    ...(sslmode ? { PGSSLMODE: sslmode } : {}),
  };
};

const sameDatabase = (a, b) => {
  const x = new URL(a);
  const y = new URL(b);
  const host = (h) => h.replace(/-pooler(?=\.)/, '').toLowerCase();
  return host(x.hostname) === host(y.hostname) && x.pathname === y.pathname;
};

const majorVersion = (text) => {
  const m = /(\d+)(?:\.\d+)?/.exec(String(text));
  return m ? Number(m[1]) : null;
};

module.exports = { parseKey, encrypt, decrypt, pgEnv, sameDatabase, majorVersion };
