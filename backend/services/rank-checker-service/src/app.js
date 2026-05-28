const express = require('express');
const cors = require('cors');
const createAuthController = require('./controllers/authController');
const brandRoutes = require('./routes/brandRoutes');
const domainRoutes = require('./routes/domainRoutes');
const createSerpRoutes = require('./routes/serpRoutes');
const createGoogleRankRoutes = require('./routes/googleRankRoutes');
const createAuthRoutes = require('./routes/authRoutes');
const createUserRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const { createAuthMiddleware } = require('./middleware/auth');
const { USER_ROLES } = require('./models/User');

const buildAllowedOrigins = () => {
  return String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const isAllowedOrigin = (origin, allowedOrigins) => {
  if (!origin) return true;
  if (!allowedOrigins.length) return true;
  if (allowedOrigins.includes(origin)) return true;

  return false;
};

const createApp = ({ serpController, googleRankController, jwtSecret, jwtExpiresIn }) => {
  const app = express();
  const authMiddleware = createAuthMiddleware({ jwtSecret });
  const authController = createAuthController({ jwtSecret, jwtExpiresIn });
  const allowedOrigins = buildAllowedOrigins();

  app.use(
    cors({
      origin(origin, callback) {
        if (isAllowedOrigin(origin, allowedOrigins)) {
          callback(null, true);
          return;
        }
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    })
  );
  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', createAuthRoutes(authController, authMiddleware));

  app.use('/api/brands', authMiddleware.authenticate, brandRoutes);
  app.use('/api/domains', authMiddleware.authenticate, domainRoutes);
  app.use('/api/serp', authMiddleware.authenticate, createSerpRoutes(serpController));
  app.use('/api/google-rank', authMiddleware.authenticate, createGoogleRankRoutes(googleRankController));
  app.use(
    '/api/admin',
    authMiddleware.authenticate,
    authMiddleware.authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.MANAGER),
    adminRoutes
  );
  app.use(
    '/api/analytics',
    authMiddleware.authenticate,
    analyticsRoutes
  );
  app.use('/api/users', createUserRoutes(authMiddleware, USER_ROLES));

  app.use((err, req, res, next) => {
    console.error(err);
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        error: err.message || 'Request failed',
        code: err.errorCode || undefined,
        details: err.details || undefined,
        serperAvailability: err.serperAvailability || undefined,
      });
    }

    return res.status(500).json({ error: 'Internal server error', details: err.message });
  });

  return app;
};

module.exports = createApp;
