const crypto = require('crypto');
const path = require('path');
const env = require('../config/env');
const { createLocalDriver } = require('./localDriver');

const LINK_TTL_SECONDS = 300;

let driver = null;

const getDriver = () => {
  if (driver) return driver;
  if (env.storageDriver !== 'local') {
    throw new Error(`Pilote de stockage non configuré : ${env.storageDriver}`);
  }
  driver = createLocalDriver(env.storageLocalDir || path.join(__dirname, '..', '..', 'storage-data'));
  return driver;
};

const linkSecret = () => {
  if (env.fileUrlSecret) return env.fileUrlSecret;
  if (env.nodeEnv === 'production') throw new Error('FILE_URL_SECRET non configuré');
  return crypto.createHash('sha256').update(`${env.jwtSecret}:files`).digest('hex');
};

const sign = (payload) =>
  crypto.createHmac('sha256', linkSecret()).update(payload).digest('base64url');

const newStorageKey = () => `documents/${crypto.randomUUID()}`;

const createDownloadToken = (documentId, key, now = Date.now()) => {
  const expiresAt = Math.floor(now / 1000) + LINK_TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({ d: documentId, k: key, e: expiresAt })).toString('base64url');
  return { token: `${payload}.${sign(payload)}`, expiresAt: new Date(expiresAt * 1000).toISOString() };
};

const verifyDownloadToken = (token, now = Date.now()) => {
  const [payload, signature, extra] = String(token).split('.');
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!Number.isInteger(data.d) || typeof data.k !== 'string' || !Number.isInteger(data.e)) return null;
    if (data.e * 1000 < now) return null;
    return { documentId: data.d, key: data.k };
  } catch {
    return null;
  }
};

module.exports = {
  getDriver,
  newStorageKey,
  createDownloadToken,
  verifyDownloadToken,
  LINK_TTL_SECONDS,
};
