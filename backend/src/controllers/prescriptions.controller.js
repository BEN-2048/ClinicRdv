const svc = require('../services/prescriptions.service');

const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

const ctx = (req) => ({ ip: req.ip });

exports.listForAppointment = wrap(async (req, res) => res.json(await svc.listForAppointment(req.user, req.params.id)));
exports.create = wrap(async (req, res) => res.status(201).json(await svc.createDraft(req.user, req.params.id, req.body, ctx(req))));
exports.update = wrap(async (req, res) => res.json(await svc.updateDraft(req.user, req.params.id, req.body, ctx(req))));
exports.issue = wrap(async (req, res) => res.json(await svc.issue(req.user, req.params.id, req.body, ctx(req))));
exports.cancel = wrap(async (req, res) => res.json(await svc.cancel(req.user, req.params.id, req.body, ctx(req))));
exports.listForPatient = wrap(async (req, res) => res.json(await svc.listForPatient(req.user, req.params.patientId, ctx(req))));
exports.consultationHistory = wrap(async (req, res) => res.json(await svc.consultationHistory(req.user, req.params.patientId, ctx(req))));
exports.addAddendum = wrap(async (req, res) => res.status(201).json(await svc.addAddendum(req.user, req.params.id, req.body, ctx(req))));
