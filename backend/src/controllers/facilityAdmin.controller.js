const svc = require('../services/facilityAdmin.service');

const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

const fid = (req) => req.params.facilityId;
const positive = (value) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw Object.assign(new Error('Ressource introuvable'), { status: 404 });
  return n;
};

exports.list = wrap(async (req, res) => res.json(await svc.list(req.scope)));
exports.get = wrap(async (req, res) => res.json(await svc.get(req.scope, fid(req))));
exports.create = wrap(async (req, res) => res.status(201).json(await svc.create(req.scope, req.body)));
exports.update = wrap(async (req, res) => res.json(await svc.update(req.scope, fid(req), req.body)));
exports.setServices = wrap(async (req, res) => res.json(await svc.setServices(req.scope, fid(req), req.body)));
exports.setOpeningHours = wrap(async (req, res) => res.json(await svc.setOpeningHours(req.scope, fid(req), req.body)));
exports.setSpecialties = wrap(async (req, res) => res.json(await svc.setSpecialties(req.scope, fid(req), req.body)));
exports.addMember = wrap(async (req, res) => res.status(201).json(await svc.addMember(req.scope, fid(req), req.body)));
exports.revokeMember = wrap(async (req, res) =>
  res.json(await svc.revokeMember(req.scope, fid(req), positive(req.params.memberId))));
exports.attachDoctor = wrap(async (req, res) => res.status(201).json(await svc.attachDoctor(req.scope, fid(req), req.body)));
exports.updateAffiliation = wrap(async (req, res) =>
  res.json(await svc.updateAffiliation(req.scope, fid(req), positive(req.params.doctorId), req.body)));
