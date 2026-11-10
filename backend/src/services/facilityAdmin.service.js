const bcrypt = require('bcrypt');
const pool = require('../config/db');
const scopes = require('./scope.service');

const httpError = (status, message) =>
  Object.assign(new Error(message), { status });

const FIELDS = {
  name: 'name',
  type: 'type',
  description: 'description',
  address: 'address',
  city: 'city',
  province: 'province',
  latitude: 'latitude',
  longitude: 'longitude',
  phone: 'phone',
  emergencyPhone: 'emergency_phone',
  email: 'email',
  timezone: 'timezone',
  status: 'status',
};

const PLATFORM_ONLY_FIELDS = ['status', 'timezone'];

const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

exports.list = async (scope) => {
  const r = await pool.query(
    `SELECT f.id, f.code, f.name, f.type, f.city, f.status, f.is_default, f.timezone,
            (SELECT count(*)::int FROM doctor_affiliations da
              WHERE da.facility_id = f.id AND da.status = 'active') AS doctors_count,
            (SELECT count(*)::int FROM facility_members m
              WHERE m.facility_id = f.id AND m.status = 'active') AS members_count
       FROM facilities f
      WHERE $1::int[] IS NULL OR f.id = ANY($1::int[])
      ORDER BY f.status, f.name`,
    [scopes.scopeParam(scope)]
  );
  return r.rows.map((f) => ({ ...f, can_manage: scopes.canAdministerFacility(scope, f.id) }));
};

exports.get = async (scope, id) => {
  scopes.assertFacilityInScope(scope, id);
  const f = await pool.query('SELECT * FROM facilities WHERE id = $1', [id]);
  if (!f.rowCount) throw httpError(404, 'Établissement introuvable');

  const [hours, services, specialties, members, doctors] = await Promise.all([
    pool.query(
      `SELECT weekday, to_char(opens_at,'HH24:MI') AS "opensAt", to_char(closes_at,'HH24:MI') AS "closesAt"
         FROM facility_opening_hours WHERE facility_id = $1 ORDER BY weekday, opens_at`, [id]),
    pool.query(
      `SELECT service_code AS code, available_24h AS "available24h",
              CASE WHEN unavailable_until > now() THEN unavailable_until END AS "unavailableUntil",
              CASE WHEN unavailable_until > now() THEN unavailable_reason END AS "unavailableReason"
         FROM facility_services WHERE facility_id = $1 ORDER BY service_code`, [id]),
    pool.query('SELECT specialty_id FROM facility_specialties WHERE facility_id = $1', [id]),
    pool.query(
      `SELECT m.id, m.role, m.status, u.id AS user_id, u.email, u.first_name, u.last_name
         FROM facility_members m JOIN users u ON u.id = m.user_id
        WHERE m.facility_id = $1 ORDER BY m.status, u.last_name`, [id]),
    pool.query(
      `SELECT da.doctor_id, da.status, da.fee, u.first_name, u.last_name, s.name AS specialty
         FROM doctor_affiliations da
         JOIN doctors d ON d.id = da.doctor_id
         JOIN users u ON u.id = d.user_id
         JOIN specialties s ON s.id = d.specialty_id
        WHERE da.facility_id = $1 ORDER BY da.status, u.last_name`, [id]),
  ]);

  return {
    ...f.rows[0],
    can_manage: scopes.canAdministerFacility(scope, id),
    opening_hours: hours.rows,
    services: services.rows,
    specialty_ids: specialties.rows.map((r) => r.specialty_id),
    members: members.rows,
    doctors: doctors.rows,
  };
};

exports.create = async (scope, data) => {
  if (!scope.all) throw httpError(403, 'Réservé à l’administration de la plateforme');
  const cols = [];
  const values = [];
  for (const [key, col] of Object.entries(FIELDS)) {
    if (data[key] === undefined) continue;
    cols.push(col);
    values.push(data[key]);
  }
  const r = await pool.query(
    `INSERT INTO facilities (${cols.join(', ')})
     VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})
     RETURNING id`,
    values
  );
  return exports.get(scope, r.rows[0].id);
};

exports.update = async (scope, id, data) => {
  scopes.assertCanAdministerFacility(scope, id);
  if (!scope.all && PLATFORM_ONLY_FIELDS.some((k) => data[k] !== undefined)) {
    throw httpError(403, 'Le statut et le fuseau horaire sont gérés par la plateforme');
  }
  const sets = [];
  const values = [id];
  for (const [key, col] of Object.entries(FIELDS)) {
    if (data[key] === undefined) continue;
    values.push(data[key]);
    sets.push(`${col} = $${values.length}`);
  }
  if (sets.length) {
    const r = await pool.query(
      `UPDATE facilities SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`,
      values
    );
    if (!r.rowCount) throw httpError(404, 'Établissement introuvable');
  }
  return exports.get(scope, id);
};

exports.setServices = async (scope, id, { services }) => {
  scopes.assertCanAdministerFacility(scope, id);
  await withTransaction(async (db) => {
    const previous = new Map((await db.query(
      'SELECT service_code, unavailable_until, unavailable_reason FROM facility_services WHERE facility_id = $1',
      [id]
    )).rows.map((r) => [r.service_code, r]));
    await db.query('DELETE FROM facility_services WHERE facility_id = $1', [id]);
    for (const s of services) {
      const kept = previous.get(s.code);
      const until = s.unavailableUntil !== undefined ? s.unavailableUntil : kept?.unavailable_until ?? null;
      const reason = s.unavailableReason !== undefined ? s.unavailableReason : kept?.unavailable_reason ?? null;
      await db.query(
        `INSERT INTO facility_services (facility_id, service_code, available_24h, unavailable_until, unavailable_reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, s.code, s.available24h ?? false, until, until ? reason || null : null]
      );
    }
  }).catch((e) => {
    if (e.code === '23503') throw httpError(400, 'Service inconnu');
    throw e;
  });
  return exports.get(scope, id);
};

exports.setOpeningHours = async (scope, id, { hours }) => {
  scopes.assertCanAdministerFacility(scope, id);
  for (const h of hours) {
    if (h.closesAt <= h.opensAt) throw httpError(400, 'L’heure de fermeture doit suivre l’ouverture');
  }
  await withTransaction(async (db) => {
    await db.query('DELETE FROM facility_opening_hours WHERE facility_id = $1', [id]);
    for (const h of hours) {
      await db.query(
        'INSERT INTO facility_opening_hours (facility_id, weekday, opens_at, closes_at) VALUES ($1, $2, $3, $4)',
        [id, h.weekday, h.opensAt, h.closesAt]
      );
    }
  });
  return exports.get(scope, id);
};

exports.setSpecialties = async (scope, id, { specialtyIds }) => {
  scopes.assertCanAdministerFacility(scope, id);
  await withTransaction(async (db) => {
    await db.query('DELETE FROM facility_specialties WHERE facility_id = $1', [id]);
    for (const sid of [...new Set(specialtyIds)]) {
      await db.query(
        'INSERT INTO facility_specialties (facility_id, specialty_id) VALUES ($1, $2)',
        [id, sid]
      );
    }
  }).catch((e) => {
    if (e.code === '23503') throw httpError(400, 'Spécialité inconnue');
    throw e;
  });
  return exports.get(scope, id);
};

exports.addMember = async (scope, id, { email, role, firstName, lastName, password }) => {
  scopes.assertCanAdministerFacility(scope, id);
  if (role === 'facility_admin' && !scope.all) {
    throw httpError(403, 'Seule la plateforme peut nommer un administrateur d’établissement');
  }

  await withTransaction(async (db) => {
    const normalized = email.trim().toLowerCase();
    let user = (await db.query('SELECT id, role FROM users WHERE lower(email) = $1', [normalized])).rows[0];

    if (user && user.role !== 'secretary') {
      throw httpError(409, 'Ce compte n’est pas un compte du personnel administratif');
    }

    if (!user) {
      if (!firstName || !lastName || !password) {
        throw httpError(400, 'Compte inexistant : prénom, nom et mot de passe sont requis pour le créer');
      }
      const hash = await bcrypt.hash(password, 10);
      user = (await db.query(
        `INSERT INTO users (email, password_hash, role, first_name, last_name)
         VALUES ($1, $2, 'secretary', $3, $4) RETURNING id, role`,
        [normalized, hash, firstName, lastName]
      )).rows[0];
    }

    await db.query(
      `INSERT INTO facility_members (facility_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (facility_id, user_id)
       DO UPDATE SET role = EXCLUDED.role, status = 'active'`,
      [id, user.id, role]
    );
  });
  return exports.get(scope, id);
};

exports.revokeMember = async (scope, id, memberId) => {
  scopes.assertCanAdministerFacility(scope, id);
  const r = await pool.query(
    `UPDATE facility_members SET status = 'revoked'
      WHERE id = $1 AND facility_id = $2 AND status = 'active'
        AND ($3::boolean OR role = 'secretary')
      RETURNING id`,
    [memberId, id, scope.all]
  );
  if (!r.rowCount) throw httpError(404, 'Membre introuvable ou non modifiable');
  return exports.get(scope, id);
};

exports.attachDoctor = async (scope, id, { doctorId, fee }) => {
  scopes.assertCanAdministerFacility(scope, id);
  await scopes.assertDoctorInScope(scope, doctorId);
  try {
    await pool.query(
      `INSERT INTO doctor_affiliations (doctor_id, facility_id, fee)
       VALUES ($1, $2, $3)
       ON CONFLICT (doctor_id, facility_id)
       DO UPDATE SET status = 'active', fee = EXCLUDED.fee`,
      [doctorId, id, fee ?? null]
    );
  } catch (e) {
    if (e.code === '23503') throw httpError(404, 'Médecin introuvable');
    throw e;
  }
  await pool.query(
    `INSERT INTO facility_specialties (facility_id, specialty_id)
     SELECT $1, specialty_id FROM doctors WHERE id = $2
     ON CONFLICT DO NOTHING`,
    [id, doctorId]
  );
  return exports.get(scope, id);
};

exports.updateAffiliation = async (scope, id, doctorId, { status, fee }) => {
  scopes.assertCanAdministerFacility(scope, id);
  const r = await pool.query(
    `UPDATE doctor_affiliations
        SET status = COALESCE($3, status),
            fee = CASE WHEN $4::boolean THEN $5 ELSE fee END
      WHERE facility_id = $1 AND doctor_id = $2
      RETURNING status`,
    [id, doctorId, status ?? null, fee !== undefined, fee ?? null]
  );
  if (!r.rowCount) throw httpError(404, 'Rattachement introuvable');

  const upcoming = await pool.query(
    `SELECT count(*)::int AS n FROM appointments
      WHERE facility_id = $1 AND doctor_id = $2
        AND status IN ('pending', 'confirmed') AND starts_at > now()`,
    [id, doctorId]
  );
  return { ...(await exports.get(scope, id)), upcoming_appointments: upcoming.rows[0].n };
};
