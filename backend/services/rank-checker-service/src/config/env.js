const dotenv = require('dotenv');

dotenv.config();

const requiredVars = ['MONGO_URI', 'MAIN_APP_MONGO_URI'];

requiredVars.forEach((name) => {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
});

module.exports = {
  mongoUri: process.env.MONGO_URI,
  mainAppMongoUri: process.env.MAIN_APP_MONGO_URI,
  serperApiKeysRaw:
    process.env.SERPER_API_KEYS || process.env.SERPER_API_KEY || process.env.SERPAPI_KEY || '',
  serperMonthlyLimit: Number(process.env.SERPER_MONTHLY_LIMIT) || 2500,
  serperBaselineRemaining:
    process.env.SERPER_BASELINE_REMAINING !== undefined
      ? Number(process.env.SERPER_BASELINE_REMAINING)
      : null,
  serperBaselineKeyName: process.env.SERPER_BASELINE_KEY_NAME || '',
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  initialAdminEmail: process.env.INITIAL_ADMIN_EMAIL || 'admin@200m.website',
  initialAdminUsername: process.env.INITIAL_ADMIN_USERNAME || 'Admin',
  initialAdminPassword: process.env.INITIAL_ADMIN_PASSWORD || 'admin@1234',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  port: Number(process.env.PORT) || 4000,
};
