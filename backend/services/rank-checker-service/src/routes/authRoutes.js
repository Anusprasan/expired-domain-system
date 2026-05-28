const express = require('express');

const createAuthRoutes = (authController, authMiddleware) => {
  const router = express.Router();

  router.post('/login', authController.login);
  router.get('/me', authMiddleware.authenticate, authController.me);
  router.patch('/me', authMiddleware.authenticate, authController.updateProfile);
  router.patch('/me/password', authMiddleware.authenticate, authController.updatePassword);

  return router;
};

module.exports = createAuthRoutes;
