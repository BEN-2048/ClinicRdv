const jwt = require('jsonwebtoken');
const env = require('../config/env');

exports.authenticate = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentification requise' });
  try {
    req.user = jwt.verify(token, env.jwtSecret); // { id, role }
    next();
  } catch {
    res.status(401).json({ error: 'Jeton invalide ou expiré' });
  }
};

exports.requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Accès refusé' });
