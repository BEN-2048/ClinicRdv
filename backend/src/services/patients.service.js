const pool = require('../config/db');

const httpError = (status, message) =>
  Object.assign(new Error(message), { status });

const MAX_DEPENDENTS = 10;
const ADULT_AGE = 18;

const accessibleProfilesSql = (param) => `(
  SELECT p.id FROM patients p WHERE p.user_id = ${param}
  UNION
  SELECT g.patient_id FROM patient_guardians g
   WHERE g.guardian_user_id = ${param}
     AND g.status IN ('pending', 'verified')
)`;

const ageOn = (birthDate, today = new Date()) => {
  const birth = new Date(`${birthDate}T00:00:00Z`);
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < birth.getUTCMonth() ||
    (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
};

exports.listMine = async (userId) => {
  const r = await pool.query(
    `SELECT p.id, p.patient_number, p.first_name, p.last_name, p.birth_date, p.sex,
            'self' AS relationship, 'self' AS link_status
       FROM patients p
      WHERE p.user_id = $1
     UNION ALL
     SELECT p.id, p.patient_number, p.first_name, p.last_name, p.birth_date, p.sex,
            g.relationship, g.status AS link_status
       FROM patient_guardians g
       JOIN patients p ON p.id = g.patient_id
      WHERE g.guardian_user_id = $1
        AND g.status IN ('pending', 'verified', 'rejected')
      ORDER BY relationship DESC, first_name`,
    [userId]
  );
  return r.rows;
};

exports.addDependent = async (userId, { firstName, lastName, birthDate, sex, relationship }) => {
  if (new Date(`${birthDate}T00:00:00Z`) > new Date()) {
    throw httpError(400, 'La date de naissance ne peut pas etre dans le futur');
  }
  if (relationship === 'parent' && ageOn(birthDate) >= ADULT_AGE) {
    throw httpError(
      400,
      'Une personne majeure doit creer son propre compte ClinicRDV'
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const owner = await client.query(
      `SELECT id FROM users WHERE id = $1 AND role = 'patient' FOR UPDATE`,
      [userId]
    );
    if (!owner.rowCount) throw httpError(403, 'Acces refuse');

    const count = await client.query(
      `SELECT count(*)::int AS n FROM patient_guardians
        WHERE guardian_user_id = $1 AND status IN ('pending', 'verified')`,
      [userId]
    );
    if (count.rows[0].n >= MAX_DEPENDENTS) {
      throw httpError(409, `Nombre maximal de profils rattaches atteint (${MAX_DEPENDENTS})`);
    }

    const patient = await client.query(
      `INSERT INTO patients (first_name, last_name, birth_date, sex, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, patient_number, first_name, last_name, birth_date, sex`,
      [firstName, lastName, birthDate, sex ?? null, userId]
    );

    const link = await client.query(
      `INSERT INTO patient_guardians (guardian_user_id, patient_id, relationship)
       VALUES ($1, $2, $3)
       RETURNING relationship, status AS link_status`,
      [userId, patient.rows[0].id, relationship]
    );

    await client.query('COMMIT');
    return { ...patient.rows[0], ...link.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

exports.resolveBookingProfile = async (userId, patientId, db = pool) => {
  const r = patientId
    ? await db.query(
      `SELECT id FROM patients
        WHERE id = $2 AND id IN ${accessibleProfilesSql('$1')}`,
      [userId, patientId]
    )
    : await db.query('SELECT id FROM patients WHERE user_id = $1', [userId]);

  if (!r.rowCount) {
    throw httpError(
      patientId ? 403 : 404,
      patientId ? 'Vous ne pouvez pas reserver pour ce patient' : 'Profil patient introuvable'
    );
  }
  return r.rows[0].id;
};

exports.listGuardianLinks = async ({ status = 'pending' } = {}) => {
  const r = await pool.query(
    `SELECT g.id, g.relationship, g.status, g.status_reason, g.created_at, g.reviewed_at,
            gu.id AS guardian_user_id,
            gu.first_name || ' ' || gu.last_name AS guardian_name,
            gu.email AS guardian_email, gu.phone AS guardian_phone,
            p.id AS patient_id, p.patient_number,
            p.first_name AS patient_first_name, p.last_name AS patient_last_name,
            p.birth_date,
            (SELECT count(*)::int FROM patients d
              WHERE d.id <> p.id
                AND lower(d.last_name) = lower(p.last_name)
                AND lower(d.first_name) = lower(p.first_name)
                AND d.birth_date IS NOT DISTINCT FROM p.birth_date) AS possible_duplicates
       FROM patient_guardians g
       JOIN users gu ON gu.id = g.guardian_user_id
       JOIN patients p ON p.id = g.patient_id
      WHERE g.status = $1
      ORDER BY g.created_at`,
    [status]
  );
  return r.rows;
};

const ALLOWED_TRANSITIONS = {
  verified: ['pending'],
  rejected: ['pending'],
  revoked: ['verified', 'pending'],
};

exports.reviewGuardianLink = async (linkId, staffUserId, { status, reason }) => {
  const from = ALLOWED_TRANSITIONS[status];
  if (!from) throw httpError(400, 'Statut invalide');

  const r = await pool.query(
    `UPDATE patient_guardians
        SET status = $1,
            status_reason = $2,
            reviewed_by = $3,
            reviewed_at = now(),
            updated_at = now()
      WHERE id = $4
        AND status = ANY($5::text[])
      RETURNING id, guardian_user_id, patient_id, relationship, status, status_reason, reviewed_at`,
    [status, reason ?? null, staffUserId, linkId, from]
  );

  if (!r.rowCount) {
    throw httpError(409, 'Lien introuvable ou deja traite');
  }
  return r.rows[0];
};

exports.accessibleProfilesSql = accessibleProfilesSql;
exports.ageOn = ageOn;
