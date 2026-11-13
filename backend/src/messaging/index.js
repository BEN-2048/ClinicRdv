const env = require('../config/env');
const { maskPhone } = require('../utils/phone');

const consoleDriver = {
  name: 'console',
  async send(to, text) {
    console.log(`[SMS de développement] vers ${maskPhone(to)} : ${text}`);
  },
};

const smsgateDriver = {
  name: 'smsgate',
  async send(to, text) {
  if (!env.smsgateUrl || !env.smsgateUsername || !env.smsgatePassword) {
    const error = new Error('SMSGate non configuré');
    error.deliveryStatus = 'failed';
    throw error;
  }

  const auth = Buffer.from(
    `${env.smsgateUsername}:${env.smsgatePassword}`
  ).toString('base64');

  let response;

  try {
    response = await fetch(
      `${env.smsgateUrl.replace(/\/$/, '')}/message`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify({
          textMessage: { text },
          phoneNumbers: [to],
        }),
        signal: AbortSignal.timeout(10000),
      }
    );
  } catch (cause) {
    const error = new Error(
      `Résultat SMSGate incertain : ${cause.message}`
    );
    error.deliveryStatus = 'unknown';
    error.cause = cause;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(`SMSGate a répondu ${response.status}`);
    error.deliveryStatus = 'failed';
    throw error;
  }
  },
};

const DRIVERS = { console: consoleDriver, smsgate: smsgateDriver };
exports.getSmsDriver = () => {
  const driver = DRIVERS[env.smsDriver];
  if (!driver) throw new Error(`Pilote SMS inconnu : ${env.smsDriver}`);
  if (driver.name === 'console' && env.nodeEnv === 'production') {
    throw new Error('Le pilote SMS de développement est interdit en production');
  }
  return driver;
};

exports.toGsm7 = (text) =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2018\u2019]/g, "'").replace(/\u2022/g, '*').replace(/[^\x20-\x7E\n]/g, '');
