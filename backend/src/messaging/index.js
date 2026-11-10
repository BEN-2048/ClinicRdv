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
      throw new Error('SMSGate non configuré (SMSGATE_URL, SMSGATE_USERNAME, SMSGATE_PASSWORD)');
    }
    const auth = Buffer.from(`${env.smsgateUsername}:${env.smsgatePassword}`).toString('base64');
    const response = await fetch(`${env.smsgateUrl.replace(/\/$/, '')}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({ textMessage: { text }, phoneNumbers: [to] }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`SMSGate a répondu ${response.status}`);
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
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'").replace(/•/g, '*').replace(/[^\x20-\x7E\n]/g, '');
