const crypto = require('crypto');
const { parseKey, encrypt, decrypt, pgEnv, sameDatabase, majorVersion } = require('../scripts/backupCrypto');

const key = crypto.randomBytes(32);

describe('Chiffrement des sauvegardes', () => {
  test('une sauvegarde chiffree se dechiffre a l identique', () => {
    const plain = crypto.randomBytes(5000);
    const sealed = encrypt(plain, key);
    expect(sealed.subarray(0, 8).toString()).toBe('CLRDVBK1');
    expect(sealed.includes(plain.subarray(0, 64))).toBe(false);
    expect(decrypt(sealed, key)).toEqual(plain);
  });

  test('deux sauvegardes du meme contenu ne se ressemblent pas', () => {
    const plain = Buffer.from('même contenu');
    expect(encrypt(plain, key).equals(encrypt(plain, key))).toBe(false);
  });

  test('refuse une mauvaise cle', () => {
    expect(() => decrypt(encrypt(Buffer.from('x'), key), crypto.randomBytes(32))).toThrow();
  });

  test('detecte toute alteration du fichier', () => {
    const sealed = encrypt(Buffer.from('donnees medicales'), key);
    sealed[sealed.length - 1] ^= 0xff;
    expect(() => decrypt(sealed, key)).toThrow();
  });

  test('refuse un fichier qui n est pas une sauvegarde ClinicRDV', () => {
    expect(() => decrypt(Buffer.from('PGDMP-non-chiffre'), key)).toThrow('invalide');
  });

  test.each([[undefined], [''], ['trop-court'], ['00'.repeat(16)]])('refuse la cle %p', (value) => {
    expect(() => parseKey(value)).toThrow();
  });

  test('accepte une cle de 32 octets en hexadecimal ou en base64', () => {
    expect(parseKey('ab'.repeat(32))).toHaveLength(32);
    expect(parseKey(key.toString('base64'))).toEqual(key);
  });
});

describe('Garde-fous de restauration', () => {
  const neon = 'postgresql://user:p%40ss@ep-cool-123-pooler.eu-central-1.aws.neon.tech/clinicrdv?sslmode=verify-full';

  test('reconnait la base principale, meme sans le suffixe pooler', () => {
    expect(sameDatabase(neon, 'postgresql://user:x@ep-cool-123.eu-central-1.aws.neon.tech/clinicrdv')).toBe(true);
    expect(sameDatabase(neon, 'postgresql://postgres:x@localhost:5432/clinicrdv_restore')).toBe(false);
    expect(sameDatabase(neon, 'postgresql://user:x@ep-cool-123.eu-central-1.aws.neon.tech/autre')).toBe(false);
  });

  test('transmet les identifiants par variables d environnement, pas en ligne de commande', () => {
    expect(pgEnv(neon)).toEqual({
      PGHOST: 'ep-cool-123-pooler.eu-central-1.aws.neon.tech',
      PGPORT: '5432',
      PGUSER: 'user',
      PGPASSWORD: 'p@ss',
      PGDATABASE: 'clinicrdv',
      PGSSLMODE: 'verify-full',
    });
  });

  test.each([
    ['pg_dump (PostgreSQL) 16.15', 16],
    ['18.6 (ac70818)', 18],
    ['17', 17],
  ])('lit la version majeure de %s', (text, major) => {
    expect(majorVersion(text)).toBe(major);
  });
});
