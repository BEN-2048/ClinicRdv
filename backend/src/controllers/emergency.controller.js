const svc = require('../services/emergencyDirectory.service');

const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};

exports.directory = wrap(async (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json(await svc.directory(req.query));
});

exports.listNumbers = wrap(async (req, res) => res.json(await svc.listNumbers()));

exports.createNumber = wrap(async (req, res) => res.status(201).json(await svc.createNumber(req.user, req.body)));

exports.updateNumber = wrap(async (req, res) => res.json(await svc.updateNumber(req.user, Number(req.params.id), req.body)));

exports.deleteNumber = wrap(async (req, res) => {
  await svc.deleteNumber(Number(req.params.id));
  res.status(204).end();
});
