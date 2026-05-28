const express = require('express');
const { listUsers, createUser, updateUser, deleteUser } = require('../controllers/userController');

const createUserRoutes = (authMiddleware, roles) => {
  const router = express.Router();

  router.use(authMiddleware.authenticate);
  router.use(authMiddleware.authorizeRoles(roles.ADMIN));

  router.get('/', listUsers);
  router.post('/', createUser);
  router.patch('/:id', updateUser);
  router.delete('/:id', deleteUser);

  return router;
};

module.exports = createUserRoutes;
