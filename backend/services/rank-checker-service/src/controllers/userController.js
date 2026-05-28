const { User, USER_ROLES } = require('../models/User');

const ensureNotLastActiveAdmin = async ({ targetUser, nextRole, nextIsActive }) => {
  const isCurrentlyActiveAdmin = targetUser.role === USER_ROLES.ADMIN && targetUser.isActive;
  const willRemainActiveAdmin = nextRole === USER_ROLES.ADMIN && nextIsActive;

  if (!isCurrentlyActiveAdmin || willRemainActiveAdmin) return;

  const activeAdminCount = await User.countDocuments({
    role: USER_ROLES.ADMIN,
    isActive: true,
  });

  if (activeAdminCount <= 1) {
    const error = new Error('At least one active admin is required');
    error.statusCode = 400;
    throw error;
  }
};

const listUsers = async (req, res, next) => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 }).select('username email role isActive createdAt');
    return res.json(users);
  } catch (error) {
    return next(error);
  }
};

const createUser = async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const role = String(req.body.role || '').trim();
    const password = String(req.body.password || '');

    if (!username || !email || !role || !password) {
      return res.status(400).json({ error: 'username, email, role and password are required' });
    }

    if (!Object.values(USER_ROLES).includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const passwordHash = await User.hashPassword(password);
    const user = await User.create({
      username,
      email,
      role,
      passwordHash,
      isActive: true,
      createdBy: req.user._id,
    });

    return res.status(201).json({
      _id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
    });
  } catch (error) {
    return next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const username = req.body.username !== undefined ? String(req.body.username || '').trim() : user.username;
    const email = req.body.email !== undefined ? String(req.body.email || '').trim().toLowerCase() : user.email;
    const role = req.body.role !== undefined ? String(req.body.role || '').trim() : user.role;
    const password = req.body.password !== undefined ? String(req.body.password || '') : '';
    const isActive = typeof req.body.isActive === 'boolean' ? req.body.isActive : user.isActive;

    if (!username || !email || !role) {
      return res.status(400).json({ error: 'username, email and role are required' });
    }

    if (!Object.values(USER_ROLES).includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    if (password && password.length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }

    if (email !== user.email) {
      const exists = await User.findOne({ email, _id: { $ne: user._id } });
      if (exists) {
        return res.status(409).json({ error: 'Email already exists' });
      }
    }

    if (req.user._id.toString() === user._id.toString() && role !== USER_ROLES.ADMIN) {
      return res.status(400).json({ error: 'You cannot remove your own admin role' });
    }

    await ensureNotLastActiveAdmin({
      targetUser: user,
      nextRole: role,
      nextIsActive: isActive,
    });

    user.username = username;
    user.email = email;
    user.role = role;
    user.isActive = isActive;

    if (password) {
      user.passwordHash = await User.hashPassword(password);
    }

    await user.save();

    return res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    return next(error);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (req.user._id.toString() === user._id.toString()) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    await ensureNotLastActiveAdmin({
      targetUser: user,
      nextRole: user.role,
      nextIsActive: false,
    });

    await user.deleteOne();
    return res.json({ ok: true });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    return next(error);
  }
};

module.exports = {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
};
