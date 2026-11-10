require('dotenv').config();

const positiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

module.exports = {
  port: process.env.PORT || 4000,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshTokenDays: positiveInteger(process.env.REFRESH_TOKEN_DAYS, 30),
  sessionMaxDays: positiveInteger(process.env.SESSION_MAX_DAYS, 90),

  brevoApiKey: process.env.BREVO_API_KEY,
  brevoSenderEmail: process.env.BREVO_SENDER_EMAIL,
  emailDriver: process.env.EMAIL_DRIVER,

  otpSecret: process.env.OTP_SECRET,
  otpExpiresMinutes: positiveInteger(process.env.OTP_EXPIRES_MINUTES, 10),
  otpMaxAttempts: positiveInteger(process.env.OTP_MAX_ATTEMPTS, 5),
  otpResendCooldownSeconds: positiveInteger(process.env.OTP_RESEND_COOLDOWN_SECONDS, 60),

  smsDriver: process.env.SMS_DRIVER || 'console',
  smsgateUrl: process.env.SMSGATE_URL,
  smsgateUsername: process.env.SMSGATE_USERNAME,
  smsgatePassword: process.env.SMSGATE_PASSWORD,
  smsDailyCap: positiveInteger(process.env.SMS_DAILY_CAP, 200),
  smsPerNumberDaily: positiveInteger(process.env.SMS_PER_NUMBER_DAILY, 5),

  nodeEnv: process.env.NODE_ENV || 'development',

  rateLimitEnabled: process.env.RATE_LIMIT_ENABLED
    ? process.env.RATE_LIMIT_ENABLED === 'true'
    : process.env.NODE_ENV !== 'test',
  trustProxy: process.env.TRUST_PROXY,

  storageDriver: process.env.STORAGE_DRIVER || 'local',
  storageLocalDir: process.env.STORAGE_LOCAL_DIR,
  fileUrlSecret: process.env.FILE_URL_SECRET,
  publicApiUrl: process.env.PUBLIC_API_URL,
};
