const svc = require('../services/admin.service');
const appts = require('../services/appointments.service');

const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };
const intParam = (req, name) => {
  const n = Number(req.params[name]);
  if (!Number.isInteger(n) || n <= 0) throw appts.httpError(404, 'Ressource introuvable');
  return n;
};

exports.dashboard = wrap(async (req, res) => res.json(await svc.dashboard()));
exports.stats = wrap(async (req, res) => res.json(await svc.stats(req.query)));
exports.patients = wrap(async (req, res) => res.json(await svc.searchPatients(req.query)));
exports.specialties = wrap(async (req, res) => res.json(await svc.listSpecialties()));

exports.listDoctors = wrap(async (req, res) => res.json(await svc.listDoctors()));
exports.getDoctor = wrap(async (req, res) => res.json(await svc.getDoctor(intParam(req, 'id'))));
exports.createDoctor = wrap(async (req, res) => res.status(201).json(await svc.createDoctor(req.body)));
exports.updateDoctor = wrap(async (req, res) => res.json(await svc.updateDoctor(intParam(req, 'id'), req.body)));

exports.getWorkingHours = wrap(async (req, res) => res.json(await svc.getWorkingHours(intParam(req, 'id'), req.query)));
exports.setWorkingHours = wrap(async (req, res) => res.json(await svc.setWorkingHours(intParam(req, 'id'), req.body)));

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

exports.listAppointments = wrap(async (req, res) => res.json(await appts.listAll(req.query)));
exports.bookAppointment = wrap(async (req, res) => res.status(201).json(await appts.bookFor(req.body)));
exports.cancelAppointment = wrap(async (req, res) => res.json(await appts.cancel(intParam(req, 'id'), req.user)));
exports.rescheduleAppointment = wrap(async (req, res) =>
  res.json(await appts.reschedule(intParam(req, 'id'), req.user, req.body.startsAt)));
