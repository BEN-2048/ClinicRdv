const svc = require('../services/admin.service');
const appts = require('../services/appointments.service');

const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };
const intParam = (req, name) => {
  const n = Number(req.params[name]);
  if (!Number.isInteger(n) || n <= 0) throw appts.httpError(404, 'Ressource introuvable');
  return n;
};

exports.scope = wrap(async (req, res) => res.json({
  platformAdmin: req.scope.all,
  facilities: req.scope.facilities,
}));
exports.dashboard = wrap(async (req, res) => res.json(await svc.dashboard(req.scope)));
exports.stats = wrap(async (req, res) => res.json(await svc.stats(req.scope, req.query)));
exports.patients = wrap(async (req, res) => res.json(await svc.searchPatients(req.scope, req.query)));
exports.specialties = wrap(async (req, res) => res.json(await svc.listSpecialties()));

exports.listDoctors = wrap(async (req, res) => res.json(await svc.listDoctors(req.scope)));
exports.getDoctor = wrap(async (req, res) => res.json(await svc.getDoctor(intParam(req, 'id'))));
exports.createDoctor = wrap(async (req, res) => res.status(201).json(await svc.createDoctor(req.scope, req.body)));
exports.updateDoctor = wrap(async (req, res) =>
  res.json(await svc.updateDoctor(intParam(req, 'id'), req.body, req.scope)));

exports.getWorkingHours = wrap(async (req, res) =>
  res.json(await svc.getWorkingHours(intParam(req, 'id'), req.query, req.scope)));
exports.setWorkingHours = wrap(async (req, res) =>
  res.json(await svc.setWorkingHours(intParam(req, 'id'), req.body, req.scope)));

exports.listLeaves = wrap(async (req, res) => res.json(await svc.listLeaves(intParam(req, 'id'))));
exports.addLeave = wrap(async (req, res) => res.status(201).json(await svc.addLeave(intParam(req, 'id'), req.body)));
exports.deleteLeave = wrap(async (req, res) => {
  await svc.deleteLeave(intParam(req, 'id'), intParam(req, 'leaveId'));
  res.status(204).end();
});

exports.listBlocks = wrap(async (req, res) => res.json(await svc.listBlocks(intParam(req, 'id'))));
exports.addBlock = wrap(async (req, res) => res.status(201).json(await svc.addBlock(intParam(req, 'id'), req.body)));
exports.deleteBlock = wrap(async (req, res) => {
  await svc.deleteBlock(intParam(req, 'id'), intParam(req, 'blockId'));
  res.status(204).end();
});

exports.listAppointments = wrap(async (req, res) => res.json(await appts.listAll(req.query, req.scope)));
exports.bookAppointment = wrap(async (req, res) => res.status(201).json(await appts.bookFor(req.body, req.scope)));
exports.cancelAppointment = wrap(async (req, res) => res.json(await appts.cancel(intParam(req, 'id'), req.user)));
exports.rescheduleAppointment = wrap(async (req, res) =>
  res.json(await appts.reschedule(intParam(req, 'id'), req.user, req.body.startsAt)));
