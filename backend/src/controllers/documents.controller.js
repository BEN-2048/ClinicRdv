const multer = require('multer');
const svc = require('../services/documents.service');

const MAX_BYTES = 10 * 1024 * 1024;

const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1, fields: 10, fieldSize: 2000 },
}).single('file');

exports.receiveFile = (req, res, next) =>
  parser(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Fichier trop volumineux (10 Mo maximum)' });
    if (error instanceof multer.MulterError) return res.status(400).json({ error: 'Envoi de fichier invalide' });
    return next(error);
  });

exports.list = wrap(async (req, res) => res.json(await svc.list(req.user, req.params.patientId, { ip: req.ip })));

exports.upload = wrap(async (req, res) =>
  res.status(201).json(await svc.upload(req.user, req.params.patientId, req.file, req.body, { ip: req.ip })));

exports.downloadLink = wrap(async (req, res) => res.json(await svc.downloadLink(req.user, req.params.id, { ip: req.ip })));
exports.release = wrap(async (req, res) => res.json(await svc.release(req.user, req.params.id, { ip: req.ip })));
exports.enteredInError = wrap(async (req, res) =>
  res.json(await svc.markEnteredInError(req.user, req.params.id, req.body, { ip: req.ip })));

const EXTENSIONS = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

exports.serveFile = wrap(async (req, res) => {
  const file = await svc.readByToken(req.params.token);
  res.set({
    'Content-Type': file.mimeType,
    'Content-Length': String(file.buffer.length),
    'Content-Disposition': `inline; filename="document-${file.id}.${EXTENSIONS[file.mimeType]}"`,
    'Cache-Control': 'private, no-store, max-age=0',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
  });
  res.end(file.buffer);
});
