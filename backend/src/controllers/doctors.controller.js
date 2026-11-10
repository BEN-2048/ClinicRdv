
const pool = require('../config/db');
const { getAvailableSlots } = require('../services/slots.service');
const adminService = require('../services/admin.service');

// Liste des médecins
exports.list = async (req, res, next) => {
  try {
    const { q, specialtyId } = req.query;

    const r = await pool.query(
      `SELECT d.id, u.first_name, u.last_name,
              s.name AS specialty, d.fee,
              d.consultation_minutes, d.languages
         FROM doctors d
         JOIN users u ON u.id = d.user_id
         JOIN specialties s ON s.id = d.specialty_id
        WHERE d.active
          AND ($1::text IS NULL OR u.last_name ILIKE '%'||$1||'%'
               OR s.name ILIKE '%'||$1||'%')
          AND ($2::int IS NULL OR d.specialty_id = $2)
        ORDER BY u.last_name`,
      [q || null, specialtyId ? +specialtyId : null]
    );

    res.json(r.rows);
  } catch (e) {
    next(e);
  }
};

// Détails d'un médecin
exports.get = async (req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT d.*, u.first_name, u.last_name,
              s.name AS specialty
         FROM doctors d
         JOIN users u ON u.id = d.user_id
         JOIN specialties s ON s.id = d.specialty_id
        WHERE d.id = $1`,
      [req.params.id]
    );

    if (!r.rowCount) {
      return res.status(404).json({
        error: 'Médecin introuvable'
      });
    }

    res.json(r.rows[0]);
  } catch (e) {
    next(e);
  }
};

// Créneaux disponibles
exports.slots = async (req, res, next) => {
  try {
    const slots = await getAvailableSlots(
      +req.params.id,
      req.query.date,
      undefined,
      null,
      req.query.facilityId ?? null
    );

    if (!slots) {
      return res.status(404).json({
        error: 'Médecin introuvable'
      });
    }

    res.json(slots);
  } catch (e) {
    next(e);
  }
};

// Tableau de bord du médecin
exports.dashboard = async (req, res, next) => {
  try {
    const doctorResult = await pool.query(
      `SELECT d.id, d.user_id, u.first_name, u.last_name,
              u.email, s.name AS specialty, d.fee, d.active
         FROM doctors d
         JOIN users u ON u.id = d.user_id
         JOIN specialties s ON s.id = d.specialty_id
        WHERE d.user_id = $1`,
      [req.user.id]
    );

    if (!doctorResult.rowCount) {
      return res.status(404).json({
        error: 'Profil médecin introuvable'
      });
    }

    const doctor = doctorResult.rows[0];

    const appointmentsResult = await pool.query(
      `SELECT a.id, a.starts_at, a.ends_at, a.status,
              a.reason, a.patient_id, a.patient_profile_id,
              p.patient_number,
              p.first_name AS patient_first_name,
              p.last_name AS patient_last_name
         FROM appointments a
         JOIN patients p ON p.id = a.patient_profile_id
        WHERE a.doctor_id = $1
        ORDER BY a.starts_at ASC`,
      [doctor.id]
    );

    res.json({
      doctor,
      appointments: appointmentsResult.rows
    });
  } catch (e) {
    next(e);
  }
};

// Récupérer l'identifiant du médecin connecté
const getCurrentDoctorId = async (userId) => {
  const result = await pool.query(
    'SELECT id FROM doctors WHERE user_id = $1',
    [userId]
  );

  if (!result.rowCount) {
    const error = new Error('Profil médecin introuvable');
    error.status = 404;
    throw error;
  }

  return result.rows[0].id;
};

// Gestion centralisée des requêtes de l'agenda
const handleAgendaRequest = (action) => async (req, res, next) => {
  try {
    const doctorId = await getCurrentDoctorId(req.user.id);
    const result = await action(doctorId, req);

    if (result === undefined) {
      return res.status(204).end();
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
};

// HORAIRES DE TRAVAIL
exports.myWorkingHours = handleAgendaRequest(
  (doctorId, req) => adminService.getWorkingHours(doctorId, req.query)
);

exports.updateMyWorkingHours = handleAgendaRequest(
  (doctorId, req) =>
    adminService.setWorkingHours(doctorId, req.body)
);

// ABSENCES
exports.myLeaves = handleAgendaRequest(
  (doctorId) => adminService.listLeaves(doctorId)
);

exports.addMyLeave = handleAgendaRequest(
  (doctorId, req) =>
    adminService.addLeave(doctorId, req.body)
);

exports.deleteMyLeave = handleAgendaRequest(
  async (doctorId, req) => {
    await adminService.deleteLeave(
      doctorId,
      Number(req.params.leaveId)
    );
    return undefined;
  }
);

// CRÉNEAUX BLOQUÉS
exports.myBlockedSlots = handleAgendaRequest(
  (doctorId) => adminService.listBlocks(doctorId)
);

exports.addMyBlockedSlot = handleAgendaRequest(
  (doctorId, req) =>
    adminService.addBlock(doctorId, req.body)
);

exports.deleteMyBlockedSlot = handleAgendaRequest(
  async (doctorId, req) => {
    await adminService.deleteBlock(
      doctorId,
      Number(req.params.blockId)
    );
    return undefined;
  }
);
