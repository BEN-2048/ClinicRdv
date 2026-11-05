
const router = require('express').Router();

const notifications = require('../controllers/notifications.controller');

const {
  authenticate,
  requireRole,
  STAFF_ROLES,
} = require('../middleware/auth');

const validate = require('../middleware/validate');
const s = require('../validators/schemas');

const auth = require('../controllers/auth.controller');
const doctors = require('../controllers/doctors.controller');
const appts = require('../controllers/appointments.controller');
const admin = require('../controllers/admin.controller');
const users = require('../controllers/users.controller');
const medicalRecord = require('../controllers/medicalRecord.controller');
const waitingList = require('../controllers/waitingList.controller');


// =========================================
// AUTHENTIFICATION
// =========================================

router.post('/auth/register', validate(s.register), auth.register);
router.post('/auth/login', validate(s.login), auth.login);


// =========================================
// PROFIL UTILISATEUR
// =========================================

router.get('/users/me', authenticate, users.getMe);
router.get('/medical-record/me', authenticate, requireRole('patient'), medicalRecord.mine);

router.patch(
  '/users/me',
  authenticate,
  validate(s.updateProfile),
  users.updateMe
);


// =========================================
// MÉDECINS
// =========================================

router.get('/doctors', authenticate, doctors.list);

router.get(
  '/doctors/me/dashboard',
  authenticate,
  requireRole('doctor'),
  doctors.dashboard
);


// =========================================
// AGENDA PERSONNEL DU MÉDECIN
// =========================================

// Horaires de travail
router.get(
  '/doctors/me/working-hours',
  authenticate,
  requireRole('doctor'),
  doctors.myWorkingHours
);

router.put(
  '/doctors/me/working-hours',
  authenticate,
  requireRole('doctor'),
  validate(s.workingHours),
  doctors.updateMyWorkingHours
);


// Absences
router.get(
  '/doctors/me/leaves',
  authenticate,
  requireRole('doctor'),
  doctors.myLeaves
);

router.post(
  '/doctors/me/leaves',
  authenticate,
  requireRole('doctor'),
  validate(s.leave),
  doctors.addMyLeave
);

router.delete(
  '/doctors/me/leaves/:leaveId',
  authenticate,
  requireRole('doctor'),
  doctors.deleteMyLeave
);


// Créneaux bloqués
router.get(
  '/doctors/me/blocked-slots',
  authenticate,
  requireRole('doctor'),
  doctors.myBlockedSlots
);

router.post(
  '/doctors/me/blocked-slots',
  authenticate,
  requireRole('doctor'),
  validate(s.block),
  doctors.addMyBlockedSlot
);

router.delete(
  '/doctors/me/blocked-slots/:blockId',
  authenticate,
  requireRole('doctor'),
  doctors.deleteMyBlockedSlot
);


// Informations d'un médecin et ses créneaux
router.get('/doctors/:id', authenticate, doctors.get);

router.get(
  '/doctors/:id/slots',
  authenticate,
  validate(s.slotsQuery, 'query'),
  doctors.slots
);


// =========================================
// RENDEZ-VOUS
// =========================================

// Réserver
router.post(
  '/appointments',
  authenticate,
  requireRole('patient', 'admin'),
  validate(s.book),
  appts.book
);

// Liste des rendez-vous de l'utilisateur
router.get(
  '/appointments/mine',
  authenticate,
  appts.mine
);


// =========================================
// FICHE DE CONSULTATION MÉDICALE
// =========================================

// Consulter la fiche d'un rendez-vous
router.get(
  '/appointments/:id/consultation',
  authenticate,
  requireRole('doctor'),
  appts.getConsultation
);

// Enregistrer un brouillon
router.put(
  '/appointments/:id/consultation',
  authenticate,
  requireRole('doctor'),
  validate(s.consultation),
  appts.saveConsultation
);

// Terminer une consultation
router.patch(
  '/appointments/:id/complete',
  authenticate,
  requireRole('doctor'),
  validate(s.consultation),
  appts.completeConsultation
);


// =========================================
// ANNULATION ET DÉPLACEMENT
// =========================================

router.patch(
  '/appointments/:id/cancel',
  authenticate,
  appts.cancel
);

router.patch(
  '/appointments/:id/reschedule',
  authenticate,
  requireRole('patient'),
  validate(s.reschedule),
  appts.reschedule
);


// =========================================
// NOTIFICATIONS DU PATIENT
// =========================================

router.get(
  '/notifications',
  authenticate,
  requireRole('patient'),
  notifications.list
);

router.patch(
  '/notifications/read-all',
  authenticate,
  requireRole('patient'),
  notifications.markAllAsRead
);

router.patch(
  '/notifications/:id/read',
  authenticate,
  requireRole('patient'),
  notifications.markAsRead
);

router.get(
  '/notifications/preferences',
  authenticate,
  requireRole('patient'),
  notifications.getPreferences
);

router.put(
  '/notifications/preferences',
  authenticate,
  requireRole('patient'),
  notifications.updatePreferences
);


// =========================================
// ADMINISTRATION ET SECRÉTARIAT
// =========================================

const patientOnly = [authenticate, requireRole('patient')];
router.get('/waiting-list/mine', ...patientOnly, waitingList.mine);
router.get('/waiting-list/doctors/:doctorId', ...patientOnly, validate(s.waitingListParams, 'params'), waitingList.getForDoctor);
router.put('/waiting-list/doctors/:doctorId', ...patientOnly, validate(s.waitingListParams, 'params'), validate(s.waitingListAlert), waitingList.upsert);
router.delete('/waiting-list/doctors/:doctorId', ...patientOnly, validate(s.waitingListParams, 'params'), waitingList.deactivate);

const staff = require('express').Router();

staff.use(
  authenticate,
  requireRole(...STAFF_ROLES)
);


// Tableau de bord et statistiques
staff.get('/dashboard', admin.dashboard);

staff.get(
  '/stats',
  validate(s.statsQuery, 'query'),
  admin.stats
);

staff.get(
  '/patients',
  validate(s.patientsQuery, 'query'),
  admin.patients
);

staff.get('/specialties', admin.specialties);


// Gestion des médecins
staff.get('/doctors', admin.listDoctors);

staff.post(
  '/doctors',
  validate(s.createDoctor),
  admin.createDoctor
);

staff.get('/doctors/:id', admin.getDoctor);

staff.patch(
  '/doctors/:id',
  validate(s.updateDoctor),
  admin.updateDoctor
);


// Gestion des horaires
staff.get(
  '/doctors/:id/working-hours',
  admin.getWorkingHours
);

staff.put(
  '/doctors/:id/working-hours',
  validate(s.workingHours),
  admin.setWorkingHours
);


// Gestion des absences
staff.get('/doctors/:id/leaves', admin.listLeaves);

staff.post(
  '/doctors/:id/leaves',
  validate(s.leave),
  admin.addLeave
);

staff.delete(
  '/doctors/:id/leaves/:leaveId',
  admin.deleteLeave
);


// Gestion des créneaux bloqués
staff.get(
  '/doctors/:id/blocked-slots',
  admin.listBlocks
);

staff.post(
  '/doctors/:id/blocked-slots',
  validate(s.block),
  admin.addBlock
);

staff.delete(
  '/doctors/:id/blocked-slots/:blockId',
  admin.deleteBlock
);


// Gestion administrative des rendez-vous
staff.get(
  '/appointments',
  validate(s.adminAppointmentsQuery, 'query'),
  admin.listAppointments
);

staff.post(
  '/appointments',
  validate(s.adminBook),
  admin.bookAppointment
);

staff.patch(
  '/appointments/:id/cancel',
  admin.cancelAppointment
);

staff.patch(
  '/appointments/:id/reschedule',
  validate(s.reschedule),
  admin.rescheduleAppointment
);


router.use('/admin', staff);


// =========================================
// EXPORTATION
// =========================================

module.exports = router;
