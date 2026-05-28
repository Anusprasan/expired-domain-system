const { User, USER_ROLES } = require('../models/User');

const ensureInitialAdmin = async ({ email, username, password }) => {
  const userCount = await User.countDocuments({});
  if (userCount > 0) return;

  const passwordHash = await User.hashPassword(password);
  await User.create({
    email: email.toLowerCase().trim(),
    username: username.trim(),
    passwordHash,
    role: USER_ROLES.ADMIN,
    isActive: true,
  });
};

module.exports = {
  ensureInitialAdmin,
};
