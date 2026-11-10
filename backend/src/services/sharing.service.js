const pool = require('../config/db');
const { assertAccess, logAccess } = require('./access.service');

const httpError = (status, message) =>
  Object.assign(new Error(message), { status });

const EMERGENCY_HOURS = 24;
const MAX_EMERGENCY_PER_DAY = 5;

const CONSENT_SELECT = `
  SELECT c.id, c.patient_id, c.facility_id, f.name AS facility_name, f.city AS facility_city,
         c.scope, c.granted_at, c.expires_at, c.revoked_at,
         gu.first_name || ' ' || gu.last_name AS granted_by_name,
         (c.revoked_at IS NULL AND (c.expires_at IS NULL OR c.expires_at > now())) AS active
    FROM record_consents c
    JOIN facilities f ON f.id = c.facility_id
    LEFT JOIN users gu ON gu.id = c.granted_by`;

exports.listConsents = async (user, patientId, { ip } = {}) => {
  await assertAccess(user, patientId, 'manage_consent', { ip, audit: true, resource: 'consents' });
  const r = await pool.query(`${CONSENT_SELECT} WHERE c.patient_id = $1 ORDER BY active DESC, c.granted_at DESC`, [patientId]);
  return r.rows;
};

exports.grantConsent = async (user, patientId, { facilityId, scope, durationDays }, { ip } = {}) => {
  const access = await assertAccess(user, patientId, 'manage_consent', { ip, audit: true, resource: 'consents' });

  const facility = await pool.query("SELECT id FROM facilities WHERE id = $1 AND status = 'active'", [facilityId]);
  if (!facility.rowCount) throw httpError(404, 'Établissement introuvable');

  const client = await pool.connect();
  let id;
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE record_consents SET revoked_at = now(), revoked_by = $3
        WHERE patient_id = $1 AND facility_id = $2 AND revoked_at IS NULL`,
      [patientId, facilityId, user.id]
    );
    id = (await client.query(
      `INSERT INTO record_consents (patient_id, facility_id, scope, granted_by, expires_at)
       VALUES ($1, $2, $3, $4, CASE WHEN $5::int IS NULL THEN NULL ELSE now() + make_interval(days => $5::int) END)
       RETURNING id`,
      [patientId, facilityId, scope, user.id, durationDays ?? null]
    )).rows[0].id;
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  await logAccess({ user, patientId, action: 'consent_grant', granted: true, basis: access.basis, ip, resource: 'record_consents', resourceId: id });
  return (await pool.query(`${CONSENT_SELECT} WHERE c.id = $1`, [id])).rows[0];
};

exports.revokeConsent = async (user, consentId, { ip } = {}) => {
  const consent = (await pool.query('SELECT patient_id FROM record_consents WHERE id = $1', [consentId])).rows[0];
  if (!consent) throw httpError(404, 'Consentement introuvable');
  const access = await assertAccess(user, consent.patient_id, 'manage_consent', { ip, audit: true, resource: 'consents' });

  const r = await pool.query(
    'UPDATE record_consents SET revoked_at = now(), revoked_by = $2 WHERE id = $1 AND revoked_at IS NULL RETURNING id',
    [consentId, user.id]
  );
  if (!r.rowCount) throw httpError(409, 'Ce consentement est déjà révoqué');

  await logAccess({ user, patientId: consent.patient_id, action: 'consent_revoke', granted: true, basis: access.basis, ip, resource: 'record_consents', resourceId: consentId });
  return (await pool.query(`${CONSENT_SELECT} WHERE c.id = $1`, [consentId])).rows[0];
};

exports.accessHistory = async (user, patientId, { ip, limit = 100 } = {}) => {
  await assertAccess(user, patientId, 'manage_consent', { ip, audit: false });
  const r = await pool.query(
    `SELECT l.id, l.created_at, l.action, l.granted, l.basis, l.resource, l.user_role,
            CASE WHEN l.user_id = $2 THEN 'Vous'
                 WHEN l.user_role = 'doctor' THEN 'Dr. ' || u.first_name || ' ' || u.last_name
                 ELSE u.first_name || ' ' || u.last_name END AS actor,
            (l.user_id = $2) AS is_me
       FROM patient_access_logs l
       LEFT JOIN users u ON u.id = l.user_id
      WHERE l.patient_id = $1
        AND l.action NOT IN ('write_clinical', 'write_declared', 'manage_consent')
      ORDER BY l.created_at DESC
      LIMIT $3`,
    [patientId, user.id, limit]
  );
  return r.rows;
};

exports.lookupForEmergency = async (user, patientNumber, { ip } = {}) => {
  const facilities = await emergencyFacilities(user);
  if (!facilities.length) throw httpError(403, 'Réservé aux médecins d’un établissement disposant d’un service d’urgences');
  const r = await pool.query(
    `SELECT id, patient_number, first_name, last_name, birth_date, sex
       FROM patients WHERE patient_number = upper($1)`,
    [patientNumber.trim()]
  );
  if (!r.rowCount) throw httpError(404, 'Aucun patient avec ce numéro');
  await logAccess({ user, patientId: r.rows[0].id, action: 'emergency_lookup', granted: true, basis: null, ip, resource: 'patients' });
  return { patient: r.rows[0], facilities };
};

const emergencyFacilities = async (user) => (await pool.query(
  `SELECT f.id, f.name
     FROM doctor_affiliations da
     JOIN doctors d ON d.id = da.doctor_id
     JOIN facilities f ON f.id = da.facility_id
     JOIN facility_services fs ON fs.facility_id = f.id AND fs.service_code = 'emergency'
    WHERE d.user_id = $1 AND da.status = 'active' AND d.active AND f.status = 'active'
    ORDER BY f.name`,
  [user.id]
)).rows;

const notifyPatient = async (db, patientId, title, body) => {
  await db.query(
    `INSERT INTO notifications (user_id, title, body, type)
     SELECT recipient, $2, $3, 'record_emergency_access'
       FROM (
         SELECT user_id AS recipient FROM patients WHERE id = $1 AND user_id IS NOT NULL
         UNION
         SELECT guardian_user_id FROM patient_guardians WHERE patient_id = $1 AND status = 'verified'
       ) r`,
    [patientId, title, body]
  );
};

exports.startEmergencyAccess = async (user, patientId, { reason, facilityId }, { ip } = {}) => {
  const facilities = await emergencyFacilities(user);
  if (!facilities.length) throw httpError(403, 'Réservé aux médecins d’un établissement disposant d’un service d’urgences');
  const facility = facilityId ? facilities.find((f) => f.id === facilityId) : facilities.length === 1 ? facilities[0] : null;
  if (!facility) throw httpError(400, 'Précisez l’établissement d’urgences depuis lequel vous intervenez');

  const patient = await pool.query('SELECT id FROM patients WHERE id = $1', [patientId]);
  if (!patient.rowCount) throw httpError(404, 'Patient introuvable');

  const recent = await pool.query(
    `SELECT count(*)::int AS n FROM emergency_access_sessions
      WHERE doctor_user_id = $1 AND started_at > now() - interval '24 hours'`,
    [user.id]
  );
  if (recent.rows[0].n >= MAX_EMERGENCY_PER_DAY) {
    throw httpError(429, 'Nombre maximal d’accès d’urgence atteint pour 24 heures');
  }

  const doctor = (await pool.query('SELECT first_name, last_name FROM users WHERE id = $1', [user.id])).rows[0];
  const client = await pool.connect();
  let session;
  try {
    await client.query('BEGIN');
    session = (await client.query(
      `INSERT INTO emergency_access_sessions (patient_id, doctor_user_id, facility_id, reason, expires_at)
       VALUES ($1, $2, $3, $4, now() + make_interval(hours => $5))
       RETURNING id, started_at, expires_at`,
      [patientId, user.id, facility.id, reason, EMERGENCY_HOURS]
    )).rows[0];
    await notifyPatient(
      client,
      patientId,
      'Accès d’urgence à votre dossier',
      `Dr. ${doctor.first_name} ${doctor.last_name} (${facility.name}) a consulté la synthèse de votre dossier en situation d’urgence. Motif : ${reason}`
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  await logAccess({ user, patientId, action: 'emergency_access', granted: true, basis: 'emergency_access', ip, resource: 'emergency_access_sessions', resourceId: session.id });
  return { ...session, facility };
};
