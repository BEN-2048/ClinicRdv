exports.notFound = (req, res) => res.status(404).json({ error: 'Route introuvable' });
// eslint-disable-next-line no-unused-vars
exports.errorHandler = (err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Erreur serveur' });
};
