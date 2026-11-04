const router = require('express').Router();
const { authenticate, requireRole, STAFF_ROLES } = require('../middleware/auth');
const validate = require('../middleware/validate');
const s = require('../validators/schemas');
const auth = require('../controllers/auth.controller');
const doctors = require('../controllers/doctors.controller');
const appts = require('../controllers/appointments.controller');
const admin = require('../controllers/admin.controller');

router.post('/auth/register', validate(s.register), auth.register);
router.post('/auth/login', validate(s.login), auth.login);

router.get('/doctors', authenticate, doctors.list);
router.get(
  '/doctors/me/dashboard',
  authenticate,
  requireRole('doctor'),
  doctors.dashboard
);
// Gestion personnelle de l'agenda du médecin
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
router.get('/doctors/:id', authenticate, doctors.get);
router.get('/doctors/:id/slots', authenticate, validate(s.slotsQuery, 'query'), doctors.slots);

router.post('/appointments', authenticate, requireRole('patient', 'admin'), validate(s.book), appts.book);
router.get('/appointments/mine', authenticate, appts.mine);
router.patch('/appointments/:id/cancel', authenticate, appts.cancel);
router.patch('/appointments/:id/reschedule', authenticate, requireRole('patient'), validate(s.reschedule), appts.reschedule);

const staff = require('express').Router();
staff.use(authenticate, requireRole(...STAFF_ROLES));
staff.get('/dashboard', admin.dashboard);
staff.get('/stats', validate(s.statsQuery, 'query'), admin.stats);
staff.get('/patients', validate(s.patientsQuery, 'query'), admin.patients);
staff.get('/specialties', admin.specialties);

staff.get('/doctors', admin.listDoctors);
staff.post('/doctors', validate(s.createDoctor), admin.createDoctor);
staff.get('/doctors/:id', admin.getDoctor);
staff.patch('/doctors/:id', validate(s.updateDoctor), admin.updateDoctor);
staff.get('/doctors/:id/working-hours', admin.getWorkingHours);
staff.put('/doctors/:id/working-hours', validate(s.workingHours), admin.setWorkingHours);
staff.get('/doctors/:id/leaves', admin.listLeaves);
staff.post('/doctors/:id/leaves', validate(s.leave), admin.addLeave);
staff.delete('/doctors/:id/leaves/:leaveId', admin.deleteLeave);
staff.get('/doctors/:id/blocked-slots', admin.listBlocks);
staff.post('/doctors/:id/blocked-slots', validate(s.block), admin.addBlock);
staff.delete('/doctors/:id/blocked-slots/:blockId', admin.deleteBlock);

staff.get('/appointments', validate(s.adminAppointmentsQuery, 'query'), admin.listAppointments);
staff.post('/appointments', validate(s.adminBook), admin.bookAppointment);
staff.patch('/appointments/:id/cancel', admin.cancelAppointment);
staff.patch('/appointments/:id/reschedule', validate(s.reschedule), admin.rescheduleAppointment);

router.use('/admin', staff);

// TODO (à répartir dans l'équipe) :
// - /doctors/me/working-hours, /leaves, /blocked-slots  (agenda médecin)
// - /appointments/:id/notes, /prescription.pdf          (dossier + ordonnance)
// - /waiting-list, /notifications                       (liste d'attente, rappels)
// - /agenda.ics                                         (export iCalendar)

module.exports = router;
