const jwt = require('jsonwebtoken');
const { User } = require('../models/User');

const pickUserPayload = (user) => ({
  _id: user._id,
  username: user.username,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
});

const createAuthController = ({ jwtSecret, jwtExpiresIn }) => {
  const signToken = (user) =>
    jwt.sign({ sub: user._id.toString(), role: user.role }, jwtSecret, { expiresIn: jwtExpiresIn });

  const login = async (req, res, next) => {
    try {
      const email = String(req.body.email || '').trim().toLowerCase();
      const password = String(req.body.password || '');

      if (!email || !password) {
        return res.status(400).json({ error: 'email and password are required' });
      }

      const user = await User.findOne({ email });
      if (!user || !user.isActive) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const ok = await user.verifyPassword(password);
      if (!ok) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      return res.json({
        token: signToken(user),
        user: pickUserPayload(user),
      });
    } catch (error) {
      return next(error);
    }
  };

  const me = async (req, res, next) => {
    try {
      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      return res.json(pickUserPayload(user));
    } catch (error) {
      return next(error);
    }
  };

  const updateProfile = async (req, res, next) => {
    try {
      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const nextUsername = typeof req.body.username === 'string' ? req.body.username.trim() : '';
      const nextEmail = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';

      if (!nextUsername || !nextEmail) {
        return res.status(400).json({ error: 'username and email are required' });
      }

      const existing = await User.findOne({ email: nextEmail, _id: { $ne: user._id } });
      if (existing) {
        return res.status(409).json({ error: 'Email already in use' });
      }

      user.username = nextUsername;
      user.email = nextEmail;
      await user.save();

      return res.json(pickUserPayload(user));
    } catch (error) {
      return next(error);
    }
  };

  const updatePassword = async (req, res, next) => {
    try {
      const currentPassword = String(req.body.currentPassword || '');
      const newPassword = String(req.body.newPassword || '');

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'currentPassword and newPassword are required' });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'newPassword must be at least 8 characters' });
      }

      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const ok = await user.verifyPassword(currentPassword);
      if (!ok) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      user.passwordHash = await User.hashPassword(newPassword);
      await user.save();

      return res.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  };

  return {
    login,
    me,
    updateProfile,
    updatePassword,
  };
};

module.exports = createAuthController;
