const pool = require('../config/db');

const httpError = (status, message) =>
  Object.assign(new Error(message), { status });

const PLATFORM_SCOPE = Object.freeze({ all: true, facilityIds: null, adminOf: null, facilities: null });

exports.loadStaffScope = async (user, db = pool) => {
  if (user.role === 'admin') return PLATFORM_SCOPE;
  if (user.role !== 'secretary') return { all: false, facilityIds: [], adminOf: [], facilities: [] };

  const r = await db.query(
    `SELECT f.id, f.name, f.city, f.status, m.role
       FROM facility_members m
       JOIN facilities f ON f.id = m.facility_id
      WHERE m.user_id = $1 AND m.status = 'active'
      ORDER BY f.name`,
    [user.id]
  );

  return {
    all: false,
    facilityIds: r.rows.map((f) => f.id),
    adminOf: r.rows.filter((f) => f.role === 'facility_admin').map((f) => f.id),
    facilities: r.rows,
  };
};

exports.scopeParam = (scope) => (scope.all ? null : scope.facilityIds);

exports.inScope = (scope, facilityId) =>
  scope.all || scope.facilityIds.includes(Number(facilityId));

exports.canAdministerFacility = (scope, facilityId) =>
  scope.all || scope.adminOf.includes(Number(facilityId));

exports.assertFacilityInScope = (scope, facilityId) => {
  if (!exports.inScope(scope, facilityId)) throw httpError(403, 'Établissement hors de votre périmètre');
};

exports.assertCanAdministerFacility = (scope, facilityId) => {
  if (!exports.canAdministerFacility(scope, facilityId)) {
    throw httpError(403, 'Réservé aux administrateurs de cet établissement');
  }
};

exports.doctorFacilityIds = async (doctorId, db = pool) => {
  const r = await db.query(
    `SELECT facility_id FROM doctor_affiliations WHERE doctor_id = $1 AND status = 'active'`,
    [doctorId]
  );
  return r.rows.map((x) => x.facility_id);
};

exports.assertDoctorInScope = async (scope, doctorId, db = pool) => {
  if (scope.all) return;
  const r = await db.query(
    `SELECT 1 FROM doctor_affiliations
      WHERE doctor_id = $1 AND facility_id = ANY($2::int[])`,
    [doctorId, scope.facilityIds]
  );
  if (!r.rowCount) throw httpError(404, 'Médecin introuvable');
};

exports.assertAppointmentInScope = async (scope, appointmentId, db = pool) => {
  if (scope.all) return;
  const r = await db.query(
    'SELECT 1 FROM appointments WHERE id = $1 AND facility_id = ANY($2::int[])',
    [appointmentId, scope.facilityIds]
  );
  if (!r.rowCount) throw httpError(404, 'Rendez-vous introuvable');
};

exports.pickFacilityInScope = async (scope, doctorId, facilityId, db = pool) => {
  if (facilityId) {
    exports.assertFacilityInScope(scope, facilityId);
    return facilityId;
  }
  if (scope.all) return null;
  const mine = (await exports.doctorFacilityIds(doctorId, db)).filter((id) => scope.facilityIds.includes(id));
  if (mine.length === 1) return mine[0];
  if (!mine.length) throw httpError(404, 'Médecin introuvable');
  throw httpError(400, 'Précisez l’établissement');
};

exports.staffScopeMiddleware = async (req, res, next) => {
  try {
    req.scope = await exports.loadStaffScope(req.user);
    if (!req.scope.all && !req.scope.facilityIds.length) {
      return res.status(403).json({ error: 'Aucun établissement n’est rattaché à votre compte' });
    }
    next();
  } catch (error) {
    next(error);
  }
};

exports.doctorInScopeMiddleware = (param = 'id') => async (req, res, next) => {
  try {
    const id = Number(req.params[param]);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Ressource introuvable' });
    await exports.assertDoctorInScope(req.scope, id);
    next();
  } catch (error) {
    next(error);
  }
};

exports.appointmentInScopeMiddleware = (param = 'id') => async (req, res, next) => {
  try {
    const id = Number(req.params[param]);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Ressource introuvable' });
    await exports.assertAppointmentInScope(req.scope, id);
    next();
  } catch (error) {
    next(error);
  }
};
