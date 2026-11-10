const svc = require('../services/record.service');
const s = require('../validators/schemas');

const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

const parseBody = (schema, body) => {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw Object.assign(new Error('Données invalides'), {
      status: 400,
      details: result.error.issues.map((i) => ({ champ: i.path.join('.'), message: i.message })),
    });
  }
  return result.data;
};

exports.get = wrap(async (req, res) => {
  res.json(await svc.getRecord(req.user, req.params.patientId, {
    ip: req.ip,
    includeErrors: req.query.includeErrors === 'true',
  }));
});

exports.add = wrap(async (req, res) => {
  const data = parseBody(s.recordEntry[req.params.kind].create, req.body);
  res.status(201).json(await svc.addEntry(req.user, req.params.patientId, req.params.kind, data, { ip: req.ip }));
});

exports.update = wrap(async (req, res) => {
  const data = parseBody(s.recordEntry[req.params.kind].update, req.body);
  res.json(await svc.updateEntry(req.user, req.params.patientId, req.params.kind, req.params.entryId, data, { ip: req.ip }));
});

exports.enteredInError = wrap(async (req, res) => {
  res.json(await svc.markEnteredInError(
    req.user, req.params.patientId, req.params.kind, req.params.entryId, req.body, { ip: req.ip }
  ));
});
