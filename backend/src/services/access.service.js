const pool = require('../config/db');

const httpError = (status, message) =>
  Object.assign(new Error(message), { status });

const ACTIONS = ['view_record', 'view_appointments', 'book', 'write_clinical', 'write_declared'];

const RULES = {
  self: ['view_record', 'view_appointments', 'book', 'write_declared'],
  guardian_verified: ['view_record', 'view_appointments', 'book', 'write_declared'],
  guardian_pending: ['view_appointments', 'book'],
  treating_doctor: ['view_appointments', 'view_record', 'write_clinical'],
  staff: ['view_appointments', 'book'],
};

const resolveBasis = async (user, patientId, db = pool) => {
  if (user.role === 'patient') {
    const r = await db.query(
      `SELECT p.user_id, g.status AS link_status
         FROM patients p
         LEFT JOIN patient_guardians g
           ON g.patient_id = p.id AND g.guardian_user_id = $1
        WHERE p.id = $2`,
      [user.id, patientId]
    );
    const row = r.rows[0];
    if (!row) return { exists: false, basis: null };
    if (row.user_id === user.id) return { exists: true, basis: 'self' };
    if (row.link_status === 'verified') return { exists: true, basis: 'guardian_verified' };
    if (row.link_status === 'pending') return { exists: true, basis: 'guardian_pending' };
    return { exists: true, basis: null };
  }

  if (user.role === 'doctor') {
    const r = await db.query(
      `SELECT DISTINCT a.facility_id
         FROM appointments a
         JOIN doctors d ON d.id = a.doctor_id
         JOIN doctor_affiliations da
           ON da.doctor_id = d.id AND da.facility_id = a.facility_id AND da.status = 'active'
        WHERE d.user_id = $1
          AND a.patient_profile_id = $2
          AND a.status <> 'cancelled'`,
      [user.id, patientId]
    );
    const facilityIds = r.rows.map((x) => x.facility_id);
    return {
      exists: true,
      basis: facilityIds.length ? 'treating_doctor' : null,
      facilityIds,
    };
  }

  if (user.role === 'secretary' || user.role === 'admin') {
    return { exists: true, basis: 'staff' };
  }

  return { exists: true, basis: null };
};

exports.canAccessPatient = async (user, patientId, action, db = pool) => {
  if (!ACTIONS.includes(action)) throw new Error(`Action inconnue : ${action}`);
  const { exists, basis, facilityIds = null } = await resolveBasis(user, patientId, db);
  return {
    exists,
    basis,
    facilityIds,
    allowed: exists && !!basis && RULES[basis].includes(action),
  };
};

const logAccess = async ({ user, patientId, action, granted, basis, ip, resource = null, resourceId = null }, db = pool) => {
  try {
    await db.query(
      `INSERT INTO patient_access_logs (user_id, user_role, patient_id, action, granted, basis, ip, resource, resource_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [user.id, user.role, patientId, action, granted, basis, ip ?? null, resource, resourceId]
    );
  } catch (error) {
    console.error('Journalisation des acces impossible :', error.message);
    throw httpError(503, 'Service momentanement indisponible');
  }
};

exports.assertAccess = async (user, patientId, action, { ip, audit = false, db = pool, resource, resourceId } = {}) => {
  const result = await exports.canAccessPatient(user, patientId, action, db);

  if (audit && result.exists) {
    await logAccess(
      { user, patientId, action, granted: result.allowed, basis: result.basis, ip, resource, resourceId },
      db
    );
  }

  if (!result.allowed) {
    if (result.basis === 'guardian_pending' && action === 'view_record') {
      throw httpError(
        403,
        'Le dossier medical sera accessible apres verification du lien par la clinique'
      );
    }
    throw httpError(403, 'Acces refuse');
  }

  return result;
};

exports.logAccess = logAccess;
exports.RULES = RULES;
