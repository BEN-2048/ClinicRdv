require('dotenv').config();

const positiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

module.exports = {
  port: process.env.PORT || 4000,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  brevoApiKey: process.env.BREVO_API_KEY,
  brevoSenderEmail: process.env.BREVO_SENDER_EMAIL,

  otpSecret: process.env.OTP_SECRET,
  otpExpiresMinutes: positiveInteger(process.env.OTP_EXPIRES_MINUTES, 10),
  otpMaxAttempts: positiveInteger(process.env.OTP_MAX_ATTEMPTS, 5),
  otpResendCooldownSeconds: positiveInteger(process.env.OTP_RESEND_COOLDOWN_SECONDS, 60),

  nodeEnv: process.env.NODE_ENV || 'development',

  rateLimitEnabled: process.env.RATE_LIMIT_ENABLED
    ? process.env.RATE_LIMIT_ENABLED === 'true'
    : process.env.NODE_ENV !== 'test',
  trustProxy: process.env.TRUST_PROXY,
};
