const svc = require('../services/waitingList.service');

const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };

exports.mine = wrap(async (req, res) => res.json(await svc.listMine(req.user.id)));
exports.getForDoctor = wrap(async (req, res) => res.json(await svc.getForDoctor(req.user.id, +req.params.doctorId)));
exports.upsert = wrap(async (req, res) => res.json(await svc.upsert(req.user.id, +req.params.doctorId, req.body)));
exports.deactivate = wrap(async (req, res) => res.json(await svc.deactivate(req.user.id, +req.params.doctorId)));
