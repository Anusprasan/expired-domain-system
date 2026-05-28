const jwt = require('jsonwebtoken');
const { User } = require('../models/User');

const createAuthMiddleware = ({ jwtSecret }) => {
  const buildProxyUser = (req) => {
    const sharedSecret = String(process.env.RANK_PROXY_SHARED_SECRET || '').trim();

    if (!sharedSecret) {
      return null;
    }

    const incomingSecret = String(req.headers['x-rank-proxy-secret'] || '').trim();

    if (!incomingSecret || incomingSecret !== sharedSecret) {
      return null;
    }

    const userId = String(req.headers['x-rank-proxy-user-id'] || '').trim();
    const email = String(req.headers['x-rank-proxy-user-email'] || '').trim().toLowerCase();
    const username = String(req.headers['x-rank-proxy-user-name'] || '').trim();
    const role = String(req.headers['x-rank-proxy-user-role'] || '').trim().toLowerCase();

    if (!userId || !email || !username || !role) {
      return null;
    }

    return {
      _id: userId,
      email,
      username,
      role,
      isProxyUser: true,
    };
  };

  const authenticate = async (req, res, next) => {
    try {
      const proxyUser = buildProxyUser(req);

      if (proxyUser) {
        req.user = proxyUser;
        return next();
      }

      const authHeader = req.headers.authorization || '';
      const [scheme, token] = authHeader.split(' ');

      if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const payload = jwt.verify(token, jwtSecret);
      const user = await User.findById(payload.sub);

      if (!user || !user.isActive) {
        return res.status(401).json({ error: 'Invalid or inactive user' });
      }

      req.user = {
        _id: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
      };

      return next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };

  const authorizeRoles = (...roles) => (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    return next();
  };

  return {
    authenticate,
    authorizeRoles,
  };
};

module.exports = {
  createAuthMiddleware,
};
