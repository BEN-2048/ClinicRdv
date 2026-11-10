exports.notFound = (req, res) => res.status(404).json({ error: 'Route introuvable' });

// eslint-disable-next-line no-unused-vars
exports.errorHandler = (err, req, res, next) => {
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600
    ? err.status
    : 500;

  if (status >= 500 && !err.expose) {
    console.error(err);
    return res.status(status).json({ error: 'Erreur serveur' });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Corps de requete JSON invalide' });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Corps de requete trop volumineux' });
  }

  res.status(status).json({
    error: err.message || 'Requete invalide',
    ...(typeof err.code === 'string' && /^[A-Z_]+$/.test(err.code) ? { code: err.code } : {}),
    ...(Number.isInteger(err.waitSeconds) ? { waitSeconds: err.waitSeconds } : {}),
    ...(Array.isArray(err.details) ? { details: err.details } : {}),
  });
};
