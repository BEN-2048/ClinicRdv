const svc = require('../services/triage.service');

exports.catalog = (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(svc.catalog());
};

exports.orient = async (req, res, next) => {
  try {
    res.json(await svc.orient(req.body));
  } catch (error) {
    next(error);
  }
};
