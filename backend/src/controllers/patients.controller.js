const svc = require('../services/patients.service');

const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

exports.mine = wrap(async (req, res) => {
  res.json(await svc.listMine(req.user.id));
});

exports.addDependent = wrap(async (req, res) => {
  res.status(201).json(await svc.addDependent(req.user.id, req.body));
});

exports.listGuardianLinks = wrap(async (req, res) => {
  res.json(await svc.listGuardianLinks(req.query));
});

exports.reviewGuardianLink = wrap(async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Identifiant invalide' });
  }
  res.json(await svc.reviewGuardianLink(id, req.user.id, req.body));
});
