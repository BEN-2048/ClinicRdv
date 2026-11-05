
const svc = require('../services/notifications.service');

const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

// GET /api/notifications
exports.list = wrap(async (req, res) => {
  const result = await svc.listForUser(req.user.id, {
    type: req.query.type,
  });

  res.json(result);
});

// PATCH /api/notifications/:id/read
exports.markAsRead = wrap(async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      error: 'Identifiant de notification invalide',
    });
  }

  const notification = await svc.markAsRead(id, req.user.id);
  res.json(notification);
});

// PATCH /api/notifications/read-all
exports.markAllAsRead = wrap(async (req, res) => {
  const result = await svc.markAllAsRead(req.user.id);
  res.json(result);
});

// GET /api/notifications/preferences
exports.getPreferences = wrap(async (req, res) => {
  const preferences = await svc.getPreferences(req.user.id);
  res.json(preferences);
});

// PUT /api/notifications/preferences
exports.updatePreferences = wrap(async (req, res) => {
  const { smsEnabled, emailEnabled } = req.body;

  if (
    typeof smsEnabled !== 'boolean' ||
    typeof emailEnabled !== 'boolean'
  ) {
    return res.status(400).json({
      error: 'Les préférences SMS et e-mail doivent être des valeurs booléennes',
    });
  }

  const preferences = await svc.updatePreferences(req.user.id, {
    smsEnabled,
    emailEnabled,
  });

  res.json(preferences);
});
