const svc = require('../services/sharing.service');

const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

const ctx = (req) => ({ ip: req.ip });

exports.listConsents = wrap(async (req, res) => res.json(await svc.listConsents(req.user, req.params.patientId, ctx(req))));
exports.grantConsent = wrap(async (req, res) => res.status(201).json(await svc.grantConsent(req.user, req.params.patientId, req.body, ctx(req))));
exports.revokeConsent = wrap(async (req, res) => res.json(await svc.revokeConsent(req.user, req.params.id, ctx(req))));
exports.accessHistory = wrap(async (req, res) => res.json(await svc.accessHistory(req.user, req.params.patientId, ctx(req))));
exports.lookup = wrap(async (req, res) => res.json(await svc.lookupForEmergency(req.user, req.query.number, ctx(req))));
exports.startEmergency = wrap(async (req, res) => res.status(201).json(await svc.startEmergencyAccess(req.user, req.params.patientId, req.body, ctx(req))));
