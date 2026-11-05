
const pool = require('../config/db');
const { getAvailableSlots } = require('./slots.service');
const { isStaff } = require('../middleware/auth');

const httpError = (status, message) =>
  Object.assign(new Error(message), { status });

const clinicDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Lubumbashi',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const getClinicDate = (date) => {
  const parts = clinicDateFormatter.formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
};

// Création d'une notification pour un patient
const createPatientNotification = async ({
  patientId,
  appointmentId,
  title,
  body,
  type,
}) => {
  await pool.query(
    `INSERT INTO notifications
      (user_id, appointment_id, title, body, type)
     VALUES ($1, $2, $3, $4, $5)`,
    [patientId, appointmentId, title, body, type]
  );
};

// Réserver un rendez-vous
exports.book = async (patientId, { doctorId, startsAt, reason }) => {
  const iso = new Date(startsAt).toISOString();

  const slots = await getAvailableSlots(
    doctorId,
    getClinicDate(new Date(iso))
  );

  if (!slots) {
    throw httpError(404, 'Médecin introuvable');
  }

  const slot = slots.find((s) => s.startsAt === iso);

  if (!slot || !slot.available) {
    throw httpError(409, 'Créneau indisponible');
  }

  try {
    const r = await pool.query(
      `INSERT INTO appointments
        (patient_id, doctor_id, starts_at, ends_at, status, reason)
       VALUES ($1, $2, $3, $4, 'confirmed', $5)
       RETURNING *`,
      [patientId, doctorId, slot.startsAt, slot.endsAt, reason || null]
    );

    const appointment = r.rows[0];

    // Notification de confirmation
    await createPatientNotification({
      patientId,
      appointmentId: appointment.id,
      title: 'Rendez-vous confirmé',
      body: 'Votre rendez-vous a été réservé avec succès.',
      type: 'appointment_confirmed',
    });

    return appointment;
  } catch (e) {
    // 23P01 = violation de la contrainte d'exclusion
    if (e.code === '23P01') {
      throw httpError(409, "Ce créneau vient d'être réservé");
    }

    throw e;
  }
};

// Annuler un rendez-vous
exports.cancel = async (id, user) => {
  const r = await pool.query(
    `UPDATE appointments
        SET status = 'cancelled'
      WHERE id = $1
        AND status IN ('pending', 'confirmed')
        AND (
          $2::boolean
          OR patient_id = $3
          OR doctor_id = (
            SELECT id FROM doctors WHERE user_id = $3
          )
        )
      RETURNING *`,
    [id, isStaff(user.role), user.id]
  );

  if (!r.rowCount) {
    throw httpError(404, 'Rendez-vous introuvable');
  }

  const appointment = r.rows[0];

  // Notification d'annulation
  await createPatientNotification({
    patientId: appointment.patient_id,
    appointmentId: appointment.id,
    title: 'Rendez-vous annulé',
    body: 'Votre rendez-vous a été annulé.',
    type: 'appointment_cancelled',
  });

  // TODO : notifier les patients de la liste d'attente
  return appointment;
};

// Déplacer un rendez-vous
exports.reschedule = async (id, user, startsAt) => {
  const cur = await pool.query(
    `SELECT *
       FROM appointments
      WHERE id = $1
        AND ($3::boolean OR patient_id = $2)
        AND status IN ('pending', 'confirmed')`,
    [id, user.id, isStaff(user.role)]
  );

  if (!cur.rowCount) {
    throw httpError(404, 'Rendez-vous introuvable');
  }

  const appointment = cur.rows[0];

  await exports.cancel(id, user);

  try {
    return await exports.book(
      appointment.patient_id,
      {
        doctorId: appointment.doctor_id,
        startsAt,
        reason: appointment.reason,
      }
    );
  } catch (e) {
    await pool.query(
      `UPDATE appointments
          SET status = 'confirmed'
        WHERE id = $1`,
      [id]
    );

    throw e;
  }
};

// Liste des rendez-vous d'un utilisateur
exports.listForUser = async (user, { scope } = {}) => {
  const base = user.role === 'doctor'
    ? 'a.doctor_id = (SELECT id FROM doctors WHERE user_id = $1)'
    : 'a.patient_id = $1';

  const time = scope === 'past'
    ? 'a.starts_at < now()'
    : scope === 'upcoming'
      ? 'a.starts_at >= now()'
      : 'true';

  const r = await pool.query(
    `SELECT a.*,
            u.first_name || ' ' || u.last_name AS doctor_name,
            s.name AS specialty
       FROM appointments a
       JOIN doctors d ON d.id = a.doctor_id
       JOIN users u ON u.id = d.user_id
       JOIN specialties s ON s.id = d.specialty_id
      WHERE ${base}
        AND ${time}
      ORDER BY a.starts_at`,
    [user.id]
  );

  return r.rows;
};

// Liste de tous les rendez-vous (administration)
exports.listAll = async ({
  date,
  doctorId,
  status,
  patientId,
} = {}) => {
  const r = await pool.query(
    `SELECT a.*,
            du.first_name || ' ' || du.last_name AS doctor_name,
            s.name AS specialty,
            pu.first_name || ' ' || pu.last_name AS patient_name,
            pu.phone AS patient_phone
       FROM appointments a
       JOIN doctors d ON d.id = a.doctor_id
       JOIN users du ON du.id = d.user_id
       JOIN specialties s ON s.id = d.specialty_id
       JOIN users pu ON pu.id = a.patient_id
      WHERE (
        $1::date IS NULL
        OR (a.starts_at AT TIME ZONE 'Africa/Lubumbashi')::date = $1::date
      )
        AND ($2::int IS NULL OR a.doctor_id = $2)
        AND ($3::appt_status IS NULL OR a.status = $3)
        AND ($4::int IS NULL OR a.patient_id = $4)
      ORDER BY a.starts_at`,
    [date || null, doctorId || null, status || null, patientId || null]
  );

  return r.rows;
};

// Réservation effectuée par un membre du personnel
exports.bookFor = async ({ patientId, ...data }) => {
  const p = await pool.query(
    `SELECT 1
       FROM users
      WHERE id = $1 AND role = 'patient'`,
    [patientId]
  );

  if (!p.rowCount) {
    throw httpError(404, 'Patient introuvable');
  }

  return exports.book(patientId, data);
};

exports.httpError = httpError;



// =========================================
// FICHE DE CONSULTATION MÉDICALE
// =========================================

// Récupérer une fiche de consultation
exports.getConsultation = async (appointmentId, userId) => {
  const result = await pool.query(
    `SELECT
        a.id AS appointment_id,
        a.starts_at,
        a.ends_at,
        a.status AS appointment_status,
        a.reason AS appointment_reason,

        p.id AS patient_id,
        p.first_name AS patient_first_name,
        p.last_name AS patient_last_name,
        p.email AS patient_email,
        p.phone AS patient_phone,

        d.id AS doctor_id,

        c.id AS consultation_id,
        c.chief_complaint,
        c.blood_pressure,
        c.heart_rate,
        c.temperature,
        c.oxygen_saturation,
        c.weight,
        c.height,
        c.medical_history,
        c.current_treatments,
        c.clinical_examination,
        c.diagnosis,
        c.notes,
        c.prescription,
        c.status AS consultation_status,
        c.created_at AS consultation_created_at,
        c.updated_at AS consultation_updated_at,
        c.completed_at

     FROM appointments a
     JOIN doctors d ON d.id = a.doctor_id
     JOIN users p ON p.id = a.patient_id
     LEFT JOIN consultation_notes c ON c.appointment_id = a.id

     WHERE a.id = $1
       AND d.user_id = $2`,
    [appointmentId, userId]
  );

  if (!result.rowCount) {
    throw httpError(404, 'Rendez-vous introuvable');
  }

  return result.rows[0];
};


// Enregistrer ou mettre à jour un brouillon
exports.saveConsultation = async (appointmentId, userId, data) => {
  const appointment = await pool.query(
    `SELECT a.id, a.status
       FROM appointments a
       JOIN doctors d ON d.id = a.doctor_id
      WHERE a.id = $1
        AND d.user_id = $2`,
    [appointmentId, userId]
  );

  if (!appointment.rowCount) {
    throw httpError(404, 'Rendez-vous introuvable');
  }

  if (appointment.rows[0].status === 'cancelled') {
    throw httpError(409, 'Impossible de modifier un rendez-vous annulé');
  }

  if (appointment.rows[0].status === 'done') {
    throw httpError(409, 'Cette consultation est déjà terminée');
  }

  const result = await pool.query(
    `INSERT INTO consultation_notes (
       appointment_id,
       chief_complaint,
       blood_pressure,
       heart_rate,
       temperature,
       oxygen_saturation,
       weight,
       height,
       medical_history,
       current_treatments,
       clinical_examination,
       diagnosis,
       notes,
       prescription,
       status,
       updated_at
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8,
       $9, $10, $11, $12, $13, $14, 'draft', now()
     )
     ON CONFLICT (appointment_id)
     DO UPDATE SET
       chief_complaint = EXCLUDED.chief_complaint,
       blood_pressure = EXCLUDED.blood_pressure,
       heart_rate = EXCLUDED.heart_rate,
       temperature = EXCLUDED.temperature,
       oxygen_saturation = EXCLUDED.oxygen_saturation,
       weight = EXCLUDED.weight,
       height = EXCLUDED.height,
       medical_history = EXCLUDED.medical_history,
       current_treatments = EXCLUDED.current_treatments,
       clinical_examination = EXCLUDED.clinical_examination,
       diagnosis = EXCLUDED.diagnosis,
       notes = EXCLUDED.notes,
       prescription = EXCLUDED.prescription,
       status = 'draft',
       updated_at = now(),
       completed_at = NULL
     RETURNING *`,
    [
      appointmentId,
      data.chiefComplaint ?? null,
      data.bloodPressure ?? null,
      data.heartRate ?? null,
      data.temperature ?? null,
      data.oxygenSaturation ?? null,
      data.weight ?? null,
      data.height ?? null,
      data.medicalHistory ?? null,
      data.currentTreatments ?? null,
      data.clinicalExamination ?? null,
      data.diagnosis ?? null,
      data.notes ?? null,
      data.prescription ?? null,
    ]
  );

  return result.rows[0];
};


// Terminer une consultation
exports.completeConsultation = async (appointmentId, userId, data) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const appointment = await client.query(
      `SELECT a.id, a.status
         FROM appointments a
         JOIN doctors d ON d.id = a.doctor_id
        WHERE a.id = $1
          AND d.user_id = $2
        FOR UPDATE OF a`,
      [appointmentId, userId]
    );

    if (!appointment.rowCount) {
      throw httpError(404, 'Rendez-vous introuvable');
    }

    if (appointment.rows[0].status === 'cancelled') {
      throw httpError(409, 'Impossible de terminer un rendez-vous annulé');
    }

    if (appointment.rows[0].status === 'done') {
      throw httpError(409, 'Cette consultation est déjà terminée');
    }

    const consultation = await client.query(
      `INSERT INTO consultation_notes (
         appointment_id,
         chief_complaint,
         blood_pressure,
         heart_rate,
         temperature,
         oxygen_saturation,
         weight,
         height,
         medical_history,
         current_treatments,
         clinical_examination,
         diagnosis,
         notes,
         prescription,
         status,
         updated_at,
         completed_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12, $13, $14,
         'completed', now(), now()
       )
       ON CONFLICT (appointment_id)
       DO UPDATE SET
         chief_complaint = EXCLUDED.chief_complaint,
         blood_pressure = EXCLUDED.blood_pressure,
         heart_rate = EXCLUDED.heart_rate,
         temperature = EXCLUDED.temperature,
         oxygen_saturation = EXCLUDED.oxygen_saturation,
         weight = EXCLUDED.weight,
         height = EXCLUDED.height,
         medical_history = EXCLUDED.medical_history,
         current_treatments = EXCLUDED.current_treatments,
         clinical_examination = EXCLUDED.clinical_examination,
         diagnosis = EXCLUDED.diagnosis,
         notes = EXCLUDED.notes,
         prescription = EXCLUDED.prescription,
         status = 'completed',
         updated_at = now(),
         completed_at = now()
       RETURNING *`,
      [
        appointmentId,
        data.chiefComplaint ?? null,
        data.bloodPressure ?? null,
        data.heartRate ?? null,
        data.temperature ?? null,
        data.oxygenSaturation ?? null,
        data.weight ?? null,
        data.height ?? null,
        data.medicalHistory ?? null,
        data.currentTreatments ?? null,
        data.clinicalExamination ?? null,
        data.diagnosis ?? null,
        data.notes ?? null,
        data.prescription ?? null,
      ]
    );

    await client.query(
      `UPDATE appointments
          SET status = 'done'
        WHERE id = $1`,
      [appointmentId]
    );

    await client.query('COMMIT');

    return consultation.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
