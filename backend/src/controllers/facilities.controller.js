const svc = require('../services/facilities.service');

const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

exports.search = wrap(async (req, res) => {
  res.json(await svc.search(req.query));
});

exports.meta = wrap(async (req, res) => {
  res.json(await svc.meta());
});

exports.get = wrap(async (req, res) => {
  res.json(await svc.get(req.params.id));
});
