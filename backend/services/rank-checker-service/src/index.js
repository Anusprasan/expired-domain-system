const http = require('http');
const { Server } = require('socket.io');
const createApp = require('./app');
const connectDb = require('./config/db');
const env = require('./config/env');
const createSerpController = require('./controllers/serpController');
const createGoogleRankController = require('./controllers/googleRankController');
const { InMemoryCache } = require('./services/cacheService');
const { parseEnvKeys, ensureSettings, applyBaselineFromEnv } = require('./services/adminSettingsService');
const { createKeyRotationService } = require('./services/keyRotationService');
const {
  searchGoogleRankForBrand,
  getGoogleRankAvailability,
  startAutoGoogleRankRun,
  getAutoGoogleRankRun,
  stopAutoGoogleRankRun,
} = require('./services/googleRankService');
const { createSerpRunService } = require('./services/serpRunService');
const { createAutoCheckScheduler } = require('./services/autoCheckScheduler');
const { createBackupScheduler } = require('./services/backupScheduler');
const { createNotificationService } = require('./services/notificationService');
const { getSystemBrandConnection } = require('./services/systemBrandService');
const { migrateLegacyBrandReferences } = require('./services/legacyBrandMigrationService');
const { ensureInitialAdmin } = require('./services/userBootstrapService');

const bootstrap = async () => {
  await connectDb(env.mongoUri);
  await getSystemBrandConnection();

  const envKeys = parseEnvKeys(env.serperApiKeysRaw);
  await ensureSettings({ envKeys });
  await applyBaselineFromEnv({
    baselineRemaining: env.serperBaselineRemaining,
    baselineKeyName: env.serperBaselineKeyName,
  });
  await ensureInitialAdmin({
    email: env.initialAdminEmail,
    username: env.initialAdminUsername,
    password: env.initialAdminPassword,
  });
  const brandMigrationResult = await migrateLegacyBrandReferences();
  if (brandMigrationResult.migrated) {
    console.log('Migrated legacy rank-checker brand references:', brandMigrationResult.updated);
  }

  const cache = new InMemoryCache();
  const keyRotationService = createKeyRotationService({ monthlyLimit: env.serperMonthlyLimit });
  const serpRunService = createSerpRunService({ cache, keyRotationService });
  const notificationService = createNotificationService({ telegramBotToken: env.telegramBotToken });
  const serpController = createSerpController({ serpRunService, keyRotationService });
  const googleRankController = createGoogleRankController({
    googleRankService: {
      searchGoogleRankForBrand,
      getGoogleRankAvailability,
      startAutoGoogleRankRun,
      getAutoGoogleRankRun,
      stopAutoGoogleRankRun,
    },
  });

  const app = createApp({
    serpController,
    googleRankController,
    jwtSecret: env.jwtSecret,
    jwtExpiresIn: env.jwtExpiresIn,
  });
  app.locals.serpRunService = serpRunService;
  app.locals.serperMonthlyLimit = env.serperMonthlyLimit;

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  const emitAdminUpdate = (payload = {}) => {
    io.emit('admin:dashboard-updated', { at: new Date().toISOString(), ...payload });
  };
  app.locals.emitAdminUpdate = emitAdminUpdate;

  const scheduler = createAutoCheckScheduler({
    serpRunService,
    notificationService,
    onStatusChange: () => emitAdminUpdate({ source: 'scheduler' }),
  });
  app.locals.autoCheckScheduler = scheduler;
  scheduler.start();

  const backupScheduler = createBackupScheduler({
    onStatusChange: () => emitAdminUpdate({ source: 'backup-scheduler' }),
    telegramBotToken: env.telegramBotToken,
  });
  app.locals.backupScheduler = backupScheduler;
  backupScheduler.start();

  server.listen(env.port, () => {
    console.log(`Server running on port ${env.port}`);
  });
};

bootstrap().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
