const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const s = require('../validators/schemas');
const auth = require('../controllers/auth.controller');
const doctors = require('../controllers/doctors.controller');
const appts = require('../controllers/appointments.controller');

router.post('/auth/register', validate(s.register), auth.register);
router.post('/auth/login', validate(s.login), auth.login);

router.get('/doctors', authenticate, doctors.list);
router.get('/doctors/:id', authenticate, doctors.get);
router.get('/doctors/:id/slots', authenticate, validate(s.slotsQuery, 'query'), doctors.slots);

router.post('/appointments', authenticate, requireRole('patient', 'admin'), validate(s.book), appts.book);
router.get('/appointments/mine', authenticate, appts.mine);
router.patch('/appointments/:id/cancel', authenticate, appts.cancel);
router.patch('/appointments/:id/reschedule', authenticate, requireRole('patient'), validate(s.reschedule), appts.reschedule);

// TODO (à répartir dans l'équipe) :
// - /doctors/me/working-hours, /leaves, /blocked-slots  (agenda médecin)
// - /appointments/:id/notes, /prescription.pdf          (dossier + ordonnance)
// - /waiting-list, /notifications                       (liste d'attente, rappels)
// - /admin/doctors, /admin/appointments, /agenda.ics    (administration, export iCalendar)

module.exports = router;
