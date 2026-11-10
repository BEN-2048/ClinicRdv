const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const env = require('../config/env');

const MINUTE = 60 * 1000;

const { normalizeDrcPhone } = require('../utils/phone');

const normalizedEmail = (req) => {
  const body = req.body ?? {};
  const raw = body.identifier ?? body.email ?? body.phone;
  if (typeof raw !== 'string') return '';
  const value = raw.trim();
  if (value.includes('@')) return value.toLowerCase();
  return normalizeDrcPhone(value) ?? value;
};

const byIp = (req) => ipKeyGenerator(req.ip);
const byEmail = (req) => normalizedEmail(req) || `ip:${byIp(req)}`;
const byIpAndEmail = (req) => `${byIp(req)}|${normalizedEmail(req)}`;

const limiter = ({ name, windowMs, limit, keyGenerator, skipSuccessfulRequests = false }) =>
  rateLimit({
    windowMs,
    limit,
    keyGenerator: (req) => `${name}:${keyGenerator(req)}`,
    skipSuccessfulRequests,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => !env.rateLimitEnabled,
    handler: (req, res, next, options) => {
      const retryAfter = Math.ceil(options.windowMs / 1000);
      res.status(options.statusCode).json({
        code: 'TOO_MANY_REQUESTS',
        error: 'Trop de tentatives. Veuillez reessayer plus tard.',
        retryAfter,
      });
    },
  });

const createAuthLimiters = () => ({
  register: [
    limiter({ name: 'register-ip', windowMs: 60 * MINUTE, limit: 10, keyGenerator: byIp }),
  ],
  login: [
    limiter({ name: 'login-ip', windowMs: 15 * MINUTE, limit: 50, keyGenerator: byIp }),
    limiter({
      name: 'login-account',
      windowMs: 15 * MINUTE,
      limit: 5,
      keyGenerator: byIpAndEmail,
      skipSuccessfulRequests: true,
    }),
  ],
  verifyEmail: [
    limiter({ name: 'verify-ip', windowMs: 15 * MINUTE, limit: 30, keyGenerator: byIp }),
    limiter({ name: 'verify-email', windowMs: 15 * MINUTE, limit: 10, keyGenerator: byEmail }),
  ],
  verifyPhone: [
    limiter({ name: 'verify-phone-ip', windowMs: 15 * MINUTE, limit: 30, keyGenerator: byIp }),
    limiter({ name: 'verify-phone', windowMs: 15 * MINUTE, limit: 10, keyGenerator: byEmail }),
  ],
  resendPhone: [
    limiter({ name: 'resend-phone-ip', windowMs: 60 * MINUTE, limit: 10, keyGenerator: byIp }),
    limiter({ name: 'resend-phone', windowMs: 60 * MINUTE, limit: 3, keyGenerator: byEmail }),
  ],
  resendOtp: [
    limiter({ name: 'resend-ip', windowMs: 60 * MINUTE, limit: 10, keyGenerator: byIp }),
    limiter({ name: 'resend-email', windowMs: 60 * MINUTE, limit: 3, keyGenerator: byEmail }),
  ],
});

const createUserLimiter = (name, limit, windowMs = 60 * MINUTE) =>
  limiter({
    name,
    windowMs,
    limit,
    keyGenerator: (req) => (req.user ? `user:${req.user.id}` : byIp(req)),
  });

const createUploadLimiter = () => createUserLimiter('document-upload', 30);

module.exports = { createAuthLimiters, createUploadLimiter, createUserLimiter };
