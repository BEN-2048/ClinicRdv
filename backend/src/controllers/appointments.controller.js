const svc = require('../services/appointments.service');
const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };

exports.book = wrap(async (req, res) => res.status(201).json(await svc.book(req.user.id, req.body)));
exports.mine = wrap(async (req, res) => res.json(await svc.listForUser(req.user, { scope: req.query.scope })));
exports.cancel = wrap(async (req, res) => res.json(await svc.cancel(+req.params.id, req.user)));
exports.reschedule = wrap(async (req, res) => res.json(await svc.reschedule(+req.params.id, req.user, req.body.startsAt)));
