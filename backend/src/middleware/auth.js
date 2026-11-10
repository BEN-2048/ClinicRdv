const jwt = require('jsonwebtoken');
const env = require('../config/env');

exports.authenticate = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentification requise' });
  try {
    req.user = jwt.verify(token, env.jwtSecret);
    next();
  } catch (error) {
    const expired = error?.name === 'TokenExpiredError';
    res.status(401).json({
      error: expired ? 'Jeton expiré' : 'Jeton invalide ou expiré',
      code: expired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
    });
  }
};

exports.requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Accès refusé' });

exports.STAFF_ROLES = ['admin', 'secretary'];
exports.isStaff = (role) => exports.STAFF_ROLES.includes(role);
