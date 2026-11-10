const crypto = require('crypto');
const pool = require('../config/db');
const env = require('../config/env');
const storage = require('../storage');
const { assertAccess, logAccess } = require('./access.service');

const httpError = (status, message) =>
  Object.assign(new Error(message), { status });

const MAX_BYTES = 10 * 1024 * 1024;

const SIGNATURES = [
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
];

exports.detectMime = (buffer) => {
  const match = SIGNATURES.find(({ bytes }) =>
    buffer.length >= bytes.length && bytes.every((b, i) => buffer[i] === b));
  return match ? match.mime : null;
};

const PUBLIC_COLUMNS = `d.id, d.patient_id, d.facility_id, d.appointment_id, d.category, d.title,
  d.description, d.document_date, d.mime_type, d.size_bytes, d.source, d.confidential,
  d.released_at, d.uploaded_at, d.entered_in_error, d.error_reason,
  f.name AS facility_name, u.first_name || ' ' || u.last_name AS uploaded_by_name, u.role AS uploaded_by_role`;

const visibility = (access) => {
  if (access.basis === 'treating_doctor') {
    return {
      sql: `(d.facility_id = ANY($2::int[]) OR d.facility_id IS NULL${access.sharing?.fullAll ? ' OR true' : ''})`,
      params: [access.facilityIds],
    };
  }
  const base = 'NOT d.entered_in_error AND d.released_at IS NOT NULL';
  if (access.basis === 'guardian_verified') return { sql: `${base} AND NOT d.confidential`, params: [] };
  return { sql: base, params: [] };
};

const canSee = (access, doc) => {
  if (access.basis === 'treating_doctor') {
    return doc.facility_id === null || access.facilityIds.includes(doc.facility_id) || !!access.sharing?.fullAll;
  }
  if (doc.entered_in_error || !doc.released_at) return false;
  if (access.basis === 'guardian_verified' && doc.confidential) return false;
  return true;
};

exports.list = async (user, patientId, { ip } = {}) => {
  const access = await assertAccess(user, patientId, 'view_record', { ip, audit: true, resource: 'documents' });
  const filter = visibility(access);
  const r = await pool.query(
    `SELECT ${PUBLIC_COLUMNS}
       FROM medical_documents d
       LEFT JOIN facilities f ON f.id = d.facility_id
       LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE d.patient_id = $1 AND ${filter.sql}
      ORDER BY COALESCE(d.document_date::timestamptz, d.uploaded_at) DESC`,
    [patientId, ...filter.params]
  );
  return r.rows;
};

exports.upload = async (user, patientId, file, meta, { ip } = {}) => {
  if (!file?.buffer?.length) throw httpError(400, 'Aucun fichier reçu');
  if (file.buffer.length > MAX_BYTES) throw httpError(413, 'Fichier trop volumineux (10 Mo maximum)');

  const mime = exports.detectMime(file.buffer);
  if (!mime) throw httpError(415, 'Format non accepté : PDF, JPEG ou PNG uniquement');
  if (file.mimetype && file.mimetype !== mime && !(mime === 'image/jpeg' && file.mimetype === 'image/jpg')) {
    throw httpError(415, 'Le contenu du fichier ne correspond pas à son type déclaré');
  }

  const clinician = user.role === 'doctor';
  const access = await assertAccess(user, patientId, clinician ? 'write_clinical' : 'write_declared', {
    ip, audit: true, resource: 'documents_upload',
  });

  let facilityId = null;
  if (clinician) {
    if (meta.facilityId) {
      if (!access.facilityIds.includes(meta.facilityId)) throw httpError(403, 'Établissement hors de votre relation de soins');
      facilityId = meta.facilityId;
    } else if (access.facilityIds.length === 1) {
      facilityId = access.facilityIds[0];
    } else {
      throw httpError(400, 'Précisez l’établissement');
    }
  }

  if (meta.appointmentId) {
    const appt = await pool.query(
      'SELECT facility_id FROM appointments WHERE id = $1 AND patient_profile_id = $2',
      [meta.appointmentId, patientId]
    );
    if (!appt.rowCount) throw httpError(400, 'Rendez-vous inconnu pour ce patient');
    if (clinician && appt.rows[0].facility_id !== facilityId) {
      throw httpError(400, 'Le rendez-vous appartient à un autre établissement');
    }
  }

  const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const key = storage.newStorageKey();
  const driver = storage.getDriver();
  await driver.put(key, file.buffer, mime);

  const released = !clinician || meta.releaseNow !== false;
  let row;
  try {
    row = (await pool.query(
      `INSERT INTO medical_documents
         (patient_id, facility_id, appointment_id, category, title, description, document_date,
          storage_driver, storage_key, mime_type, size_bytes, sha256, source, confidential,
          released_at, uploaded_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
               CASE WHEN $15::boolean THEN now() ELSE NULL END, $16, $16)
       RETURNING id`,
      [patientId, facilityId, meta.appointmentId ?? null, meta.category, meta.title,
        meta.description ?? null, meta.documentDate ?? null, driver.name, key, mime,
        file.buffer.length, sha256, clinician ? 'clinician' : 'patient',
        clinician ? !!meta.confidential : false, released, user.id]
    )).rows[0];
  } catch (error) {
    await driver.remove?.(key).catch(() => {});
    throw error;
  }

  await logAccess({
    user, patientId, action: 'create', granted: true, basis: access.basis, ip,
    resource: 'medical_documents', resourceId: row.id,
  });
  return exports.getMeta(row.id);
};

exports.getMeta = async (id) => {
  const r = await pool.query(
    `SELECT ${PUBLIC_COLUMNS}
       FROM medical_documents d
       LEFT JOIN facilities f ON f.id = d.facility_id
       LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE d.id = $1`,
    [id]
  );
  return r.rows[0];
};

const loadDocument = async (id) => {
  const r = await pool.query('SELECT * FROM medical_documents WHERE id = $1', [id]);
  if (!r.rowCount) throw httpError(404, 'Document introuvable');
  return r.rows[0];
};

exports.downloadLink = async (user, id, { ip } = {}) => {
  const doc = await loadDocument(id);
  const access = await assertAccess(user, doc.patient_id, 'view_record', {
    ip, audit: true, resource: 'medical_documents', resourceId: doc.id,
  });
  if (!canSee(access, doc)) throw httpError(404, 'Document introuvable');

  const { token, expiresAt } = storage.createDownloadToken(doc.id, doc.storage_key);
  await logAccess({
    user, patientId: doc.patient_id, action: 'download_link', granted: true, basis: access.basis, ip,
    resource: 'medical_documents', resourceId: doc.id,
  });
  return {
    url: `${env.publicApiUrl || ''}/api/files/${token}`,
    expiresAt,
    mimeType: doc.mime_type,
  };
};

const loadEditable = async (user, id, ip) => {
  const doc = await loadDocument(id);
  const clinician = user.role === 'doctor';
  const access = await assertAccess(user, doc.patient_id, clinician ? 'write_clinical' : 'write_declared', {
    ip, audit: true, resource: 'medical_documents', resourceId: doc.id,
  });
  if (doc.entered_in_error) throw httpError(409, 'Ce document a été marqué comme erroné');
  const allowed = clinician
    ? doc.facility_id === null || access.facilityIds.includes(doc.facility_id)
    : doc.source === 'patient';
  if (!allowed) throw httpError(403, 'Vous ne pouvez pas modifier ce document');
  return { doc, access };
};

exports.release = async (user, id, { ip } = {}) => {
  if (user.role !== 'doctor') throw httpError(403, 'Acces refuse');
  const { doc, access } = await loadEditable(user, id, ip);
  if (doc.released_at) return exports.getMeta(id);
  await pool.query(
    'UPDATE medical_documents SET released_at = now(), updated_by = $2 WHERE id = $1',
    [id, user.id]
  );
  await logAccess({
    user, patientId: doc.patient_id, action: 'release', granted: true, basis: access.basis, ip,
    resource: 'medical_documents', resourceId: id,
  });
  return exports.getMeta(id);
};

exports.markEnteredInError = async (user, id, { reason }, { ip } = {}) => {
  const { doc, access } = await loadEditable(user, id, ip);
  await pool.query(
    `UPDATE medical_documents
        SET entered_in_error = true, error_reason = $2, updated_by = $3
      WHERE id = $1 AND NOT entered_in_error`,
    [id, reason, user.id]
  );
  await logAccess({
    user, patientId: doc.patient_id, action: 'entered_in_error', granted: true, basis: access.basis, ip,
    resource: 'medical_documents', resourceId: id,
  });
  return exports.getMeta(id);
};

exports.readByToken = async (token) => {
  const claim = storage.verifyDownloadToken(token);
  if (!claim) throw httpError(404, 'Lien invalide ou expiré');
  const r = await pool.query(
    'SELECT id, storage_key, mime_type, entered_in_error FROM medical_documents WHERE id = $1 AND storage_key = $2',
    [claim.documentId, claim.key]
  );
  const doc = r.rows[0];
  if (!doc) throw httpError(404, 'Lien invalide ou expiré');
  const buffer = await storage.getDriver().read(doc.storage_key);
  return { buffer, mimeType: doc.mime_type, id: doc.id };
};
