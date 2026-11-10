const pool = require('../config/db');
const { assertAccess, logAccess } = require('./access.service');
const { localDateString } = require('../utils/timezone');

const httpError = (status, message) =>
  Object.assign(new Error(message), { status });

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

const ITEMS_JSON = `COALESCE((
  SELECT json_agg(json_build_object(
           'id', i.id, 'position', i.position, 'medicationName', i.medication_name,
           'dosage', i.dosage, 'route', i.route, 'frequency', i.frequency,
           'duration', i.duration, 'quantity', i.quantity, 'instructions', i.instructions)
         ORDER BY i.position)
    FROM prescription_items i WHERE i.prescription_id = rx.id
), '[]'::json)`;

const PRESCRIPTION_SELECT = `
  SELECT rx.id, rx.patient_id, rx.appointment_id, rx.facility_id, rx.status, rx.notes,
         rx.confidential, rx.issued_at, rx.cancelled_at, rx.cancel_reason, rx.created_at,
         rx.prescriber_user_id, f.name AS facility_name,
         u.first_name || ' ' || u.last_name AS prescriber_name,
         ${ITEMS_JSON} AS items
    FROM prescriptions rx
    JOIN facilities f ON f.id = rx.facility_id
    LEFT JOIN users u ON u.id = rx.prescriber_user_id`;

const loadOwnAppointment = async (db, user, appointmentId) => {
  const r = await db.query(
    `SELECT a.id, a.status, a.patient_profile_id, a.facility_id, a.doctor_id, f.timezone
       FROM appointments a
       JOIN doctors d ON d.id = a.doctor_id
       JOIN facilities f ON f.id = a.facility_id
       JOIN doctor_affiliations da
         ON da.doctor_id = d.id AND da.facility_id = a.facility_id AND da.status = 'active'
      WHERE a.id = $1 AND d.user_id = $2`,
    [appointmentId, user.id]
  );
  if (!r.rowCount) throw httpError(404, 'Rendez-vous introuvable');
  if (r.rows[0].status === 'cancelled') throw httpError(409, 'Ce rendez-vous a été annulé');
  return r.rows[0];
};

const loadOwnPrescription = async (db, user, id, { lock = false } = {}) => {
  const r = await db.query(
    `SELECT rx.*, f.timezone FROM prescriptions rx
       JOIN facilities f ON f.id = rx.facility_id
      WHERE rx.id = $1 AND rx.prescriber_user_id = $2 ${lock ? 'FOR UPDATE OF rx' : ''}`,
    [id, user.id]
  );
  if (!r.rowCount) throw httpError(404, 'Ordonnance introuvable');
  return r.rows[0];
};

const insertItems = async (db, prescriptionId, items) => {
  let position = 1;
  for (const item of items) {
    await db.query(
      `INSERT INTO prescription_items
         (prescription_id, position, medication_name, dosage, route, frequency, duration, quantity, instructions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [prescriptionId, position, item.medicationName, item.dosage ?? null, item.route ?? null,
        item.frequency ?? null, item.duration ?? null, item.quantity ?? null, item.instructions ?? null]
    );
    position += 1;
  }
};

const getOne = async (db, id) => (await db.query(`${PRESCRIPTION_SELECT} WHERE rx.id = $1`, [id])).rows[0];

exports.listForAppointment = async (user, appointmentId) => {
  await loadOwnAppointment(pool, user, appointmentId);
  const r = await pool.query(
    `${PRESCRIPTION_SELECT} WHERE rx.appointment_id = $1 ORDER BY rx.created_at DESC`,
    [appointmentId]
  );
  return r.rows;
};

exports.createDraft = async (user, appointmentId, { items, notes, confidential }, { ip } = {}) => {
  const created = await withTransaction(async (db) => {
    const appt = await loadOwnAppointment(db, user, appointmentId);
    const rx = await db.query(
      `INSERT INTO prescriptions
         (patient_id, appointment_id, facility_id, doctor_id, prescriber_user_id, notes, confidential, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $5)
       RETURNING id`,
      [appt.patient_profile_id, appt.id, appt.facility_id, appt.doctor_id, user.id, notes ?? null, !!confidential]
    );
    await insertItems(db, rx.rows[0].id, items);
    return { id: rx.rows[0].id, patientId: appt.patient_profile_id };
  });
  await logAccess({
    user, patientId: created.patientId, action: 'create', granted: true, basis: 'treating_doctor', ip,
    resource: 'prescriptions', resourceId: created.id,
  });
  return getOne(pool, created.id);
};

exports.updateDraft = async (user, id, { items, notes, confidential }, { ip } = {}) => {
  const rx = await withTransaction(async (db) => {
    const current = await loadOwnPrescription(db, user, id, { lock: true });
    if (current.status !== 'draft') throw httpError(409, 'Seul un brouillon peut être modifié');
    await db.query(
      `UPDATE prescriptions
          SET notes = COALESCE($2, notes),
              confidential = COALESCE($3, confidential),
              updated_by = $4
        WHERE id = $1`,
      [id, notes ?? null, confidential ?? null, user.id]
    );
    if (items) {
      await db.query('DELETE FROM prescription_items WHERE prescription_id = $1', [id]);
      await insertItems(db, id, items);
    }
    return current;
  });
  await logAccess({
    user, patientId: rx.patient_id, action: 'update', granted: true, basis: 'treating_doctor', ip,
    resource: 'prescriptions', resourceId: id,
  });
  return getOne(pool, id);
};

exports.issue = async (user, id, { addToMedications = true } = {}, { ip } = {}) => {
  const rx = await withTransaction(async (db) => {
    const current = await loadOwnPrescription(db, user, id, { lock: true });
    if (current.status !== 'draft') throw httpError(409, 'Cette ordonnance a déjà été émise ou annulée');

    const items = (await db.query(
      'SELECT * FROM prescription_items WHERE prescription_id = $1 ORDER BY position',
      [id]
    )).rows;
    if (!items.length) throw httpError(400, 'Une ordonnance doit contenir au moins un médicament');

    await db.query(
      `UPDATE prescriptions SET status = 'issued', issued_at = now(), updated_by = $2 WHERE id = $1`,
      [id, user.id]
    );

    if (addToMedications) {
      const startDate = localDateString(new Date(), current.timezone);
      for (const item of items) {
        await db.query(
          `INSERT INTO patient_medications
             (patient_id, facility_id, name, dosage, frequency, start_date, status, notes,
              source, confidential, recorded_by, updated_by, prescription_item_id)
           VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, 'clinician', $8, $9, $9, $10)`,
          [current.patient_id, current.facility_id, item.medication_name, item.dosage, item.frequency,
            startDate, item.duration ? `Durée : ${item.duration}` : null, current.confidential, user.id, item.id]
        );
      }
    }
    return current;
  });
  await logAccess({
    user, patientId: rx.patient_id, action: 'issue', granted: true, basis: 'treating_doctor', ip,
    resource: 'prescriptions', resourceId: id,
  });
  return getOne(pool, id);
};

exports.cancel = async (user, id, { reason }, { ip } = {}) => {
  const rx = await withTransaction(async (db) => {
    const current = await loadOwnPrescription(db, user, id, { lock: true });
    if (current.status === 'cancelled') throw httpError(409, 'Cette ordonnance est déjà annulée');
    await db.query(
      `UPDATE prescriptions
          SET status = 'cancelled', cancelled_at = now(), cancel_reason = $2, updated_by = $3
        WHERE id = $1`,
      [id, reason, user.id]
    );
    if (current.status === 'issued') {
      await db.query(
        `UPDATE patient_medications
            SET status = 'stopped', end_date = $2, updated_by = $3,
                notes = concat_ws(' · ', notes, 'Ordonnance annulée')
          WHERE prescription_item_id IN (SELECT id FROM prescription_items WHERE prescription_id = $1)
            AND status = 'active' AND NOT entered_in_error`,
        [id, localDateString(new Date(), current.timezone), user.id]
      );
    }
    return current;
  });
  await logAccess({
    user, patientId: rx.patient_id, action: 'cancel', granted: true, basis: 'treating_doctor', ip,
    resource: 'prescriptions', resourceId: id,
  });
  return getOne(pool, id);
};

const visibleFilter = (access, user) => {
  if (access.basis === 'treating_doctor') {
    return { sql: "rx.facility_id = ANY($2::int[]) AND (rx.status <> 'draft' OR rx.prescriber_user_id = $3)", params: [access.facilityIds, user.id] };
  }
  if (access.basis === 'guardian_verified') {
    return { sql: "rx.status <> 'draft' AND NOT rx.confidential", params: [] };
  }
  return { sql: "rx.status <> 'draft'", params: [] };
};

exports.listForPatient = async (user, patientId, { ip } = {}) => {
  const access = await assertAccess(user, patientId, 'view_record', { ip, audit: true, resource: 'prescriptions' });
  const filter = visibleFilter(access, user);
  const r = await pool.query(
    `${PRESCRIPTION_SELECT}
      WHERE rx.patient_id = $1 AND ${filter.sql}
      ORDER BY COALESCE(rx.issued_at, rx.created_at) DESC`,
    [patientId, ...filter.params]
  );
  return r.rows;
};

exports.consultationHistory = async (user, patientId, { ip } = {}) => {
  if (user.role !== 'doctor') throw httpError(403, 'Acces refuse');
  const access = await assertAccess(user, patientId, 'view_record', { ip, audit: true, resource: 'consultations' });
  const r = await pool.query(
    `SELECT a.id AS appointment_id, a.starts_at, a.reason, a.facility_id, f.name AS facility_name,
            f.timezone AS facility_timezone,
            du.first_name || ' ' || du.last_name AS doctor_name, s.name AS specialty,
            c.chief_complaint, c.blood_pressure, c.heart_rate, c.temperature, c.oxygen_saturation,
            c.weight, c.height, c.medical_history, c.current_treatments, c.clinical_examination,
            c.diagnosis, c.notes, c.prescription, c.completed_at,
            COALESCE((SELECT json_agg(json_build_object(
                        'id', ad.id, 'content', ad.content, 'createdAt', ad.created_at,
                        'author', au.first_name || ' ' || au.last_name) ORDER BY ad.created_at)
                        FROM consultation_addenda ad LEFT JOIN users au ON au.id = ad.author_user_id
                       WHERE ad.appointment_id = a.id), '[]'::json) AS addenda
       FROM appointments a
       JOIN consultation_notes c ON c.appointment_id = a.id AND c.status = 'completed'
       JOIN facilities f ON f.id = a.facility_id
       JOIN doctors d ON d.id = a.doctor_id
       JOIN users du ON du.id = d.user_id
       JOIN specialties s ON s.id = d.specialty_id
      WHERE a.patient_profile_id = $1 AND a.facility_id = ANY($2::int[])
      ORDER BY a.starts_at DESC`,
    [patientId, access.facilityIds]
  );
  return r.rows;
};

exports.listAddenda = async (appointmentId) => {
  const r = await pool.query(
    `SELECT ad.id, ad.content, ad.created_at, u.first_name || ' ' || u.last_name AS author
       FROM consultation_addenda ad LEFT JOIN users u ON u.id = ad.author_user_id
      WHERE ad.appointment_id = $1 ORDER BY ad.created_at`,
    [appointmentId]
  );
  return r.rows;
};

exports.addAddendum = async (user, appointmentId, { content }, { ip } = {}) => {
  const appt = await loadOwnAppointment(pool, user, appointmentId);
  const note = await pool.query(
    `SELECT status FROM consultation_notes WHERE appointment_id = $1`,
    [appointmentId]
  );
  if (note.rows[0]?.status !== 'completed') {
    throw httpError(409, 'Un complément ne peut être ajouté qu’à une consultation terminée');
  }
  const r = await pool.query(
    `INSERT INTO consultation_addenda (appointment_id, author_user_id, content)
     VALUES ($1, $2, $3) RETURNING id`,
    [appointmentId, user.id, content]
  );
  await logAccess({
    user, patientId: appt.patient_profile_id, action: 'create', granted: true, basis: 'treating_doctor', ip,
    resource: 'consultation_addenda', resourceId: r.rows[0].id,
  });
  return exports.listAddenda(appointmentId);
};
