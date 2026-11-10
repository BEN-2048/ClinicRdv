const env = require('../config/env');

const maskEmail = (email) => {
  const [name, domain] = String(email).split('@');
  return domain ? `${name.slice(0, 1)}•••@${domain}` : '•••';
};

const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const consoleDriver = {
  name: 'console',
  async send(to, subject, text) {
    console.log(`[E-mail de développement] vers ${maskEmail(to)} : ${subject} — ${text}`);
  },
};

const brevoDriver = {
  name: 'brevo',
  async send(to, subject, text) {
    if (!env.brevoApiKey || !env.brevoSenderEmail) {
      throw new Error('Brevo non configuré (BREVO_API_KEY, BREVO_SENDER_EMAIL)');
    }
    const { BrevoClient } = require('@getbrevo/brevo');
    const client = new BrevoClient({ apiKey: env.brevoApiKey });
    await client.transactionalEmails.sendTransacEmail({
      sender: { name: 'ClinicRDV', email: env.brevoSenderEmail },
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:auto"><p>${escapeHtml(text).replace(/\n/g, '<br>')}</p></div>`,
    });
  },
};

const DRIVERS = { console: consoleDriver, brevo: brevoDriver };

exports.getEmailDriver = () => {
  const name = env.emailDriver || (env.brevoApiKey ? 'brevo' : 'console');
  const driver = DRIVERS[name];
  if (!driver) throw new Error(`Pilote e-mail inconnu : ${name}`);
  if (driver.name === 'console' && env.nodeEnv === 'production') {
    throw new Error('Le pilote e-mail de développement est interdit en production');
  }
  return driver;
};

exports.maskEmail = maskEmail;
