const parseOrigins = (value) =>
  String(value || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

exports.parseOrigins = parseOrigins;

exports.corsOptions = ({ corsOrigins, nodeEnv }) => {
  const origins = parseOrigins(corsOrigins);
  const production = nodeEnv === 'production';

  if (origins.includes('*')) {
    if (production) throw new Error('CORS_ORIGINS=* est interdit en production : listez les origines autorisées');
    return { origin: true };
  }
  if (!origins.length) return { origin: !production };

  const allowed = new Set(origins);
  return {
    origin: (origin, callback) => callback(null, !origin || allowed.has(origin)),
  };
};
