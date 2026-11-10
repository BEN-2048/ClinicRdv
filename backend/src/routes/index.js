
const router = require('express').Router();

const notifications = require('../controllers/notifications.controller');

const {
  authenticate,
  requireRole,
  STAFF_ROLES,
} = require('../middleware/auth');

const validate = require('../middleware/validate');
const { createAuthLimiters } = require('../middleware/rateLimit');
const s = require('../validators/schemas');

const auth = require('../controllers/auth.controller');
const doctors = require('../controllers/doctors.controller');
const appts = require('../controllers/appointments.controller');
const admin = require('../controllers/admin.controller');
const users = require('../controllers/users.controller');
const medicalRecord = require('../controllers/medicalRecord.controller');
const waitingList = require('../controllers/waitingList.controller');
const patients = require('../controllers/patients.controller');
const facilities = require('../controllers/facilities.controller');
const facilityAdmin = require('../controllers/facilityAdmin.controller');
const record = require('../controllers/record.controller');
const rx = require('../controllers/prescriptions.controller');
const documents = require('../controllers/documents.controller');
const sharing = require('../controllers/sharing.controller');
const { createUploadLimiter, createUserLimiter } = require('../middleware/rateLimit');
const {
  staffScopeMiddleware,
  doctorInScopeMiddleware,
  appointmentInScopeMiddleware,
} = require('../services/scope.service');


// =========================================
// AUTHENTIFICATION
// =========================================

const limits = createAuthLimiters();

router.post('/auth/register', ...limits.register, validate(s.register), auth.register);
router.post('/auth/login', ...limits.login, validate(s.login), auth.login);
router.post(
  '/auth/verify-email',
  ...limits.verifyEmail,
  validate(s.verifyEmail),
  auth.verifyEmail
);

router.post(
  '/auth/resend-otp',
  ...limits.resendOtp,
  validate(s.resendOtp),
  auth.resendOtp
);


// =========================================
// PROFIL UTILISATEUR
// =========================================

router.get('/users/me', authenticate, users.getMe);
router.get('/medical-record/me', authenticate, requireRole('patient'), medicalRecord.mine);
router.get(
  '/medical-record/patients/:patientId',
  authenticate,
  requireRole('patient'),
  medicalRecord.forPatient
);

router.patch(
  '/users/me',
  authenticate,
  validate(s.updateProfile),
  users.updateMe
);

router.get('/patients/mine', authenticate, requireRole('patient'), patients.mine);

const recordAccess = [authenticate, requireRole('patient', 'doctor'), validate(s.recordParams, 'params')];
router.get('/patients/:patientId/record', ...recordAccess, validate(s.recordQuery, 'query'), record.get);
router.post('/patients/:patientId/record/:kind', ...recordAccess, record.add);
router.patch('/patients/:patientId/record/:kind/:entryId', ...recordAccess, record.update);
router.post(
  '/patients/:patientId/record/:kind/:entryId/entered-in-error',
  ...recordAccess,
  validate(s.enteredInError),
  record.enteredInError
);
router.post(
  '/patients/dependents',
  authenticate,
  requireRole('patient'),
  validate(s.addDependent),
  patients.addDependent
);


// =========================================
// MÉDECINS
// =========================================

router.get('/facilities', authenticate, validate(s.facilitySearchQuery, 'query'), facilities.search);
router.get('/facilities/meta', authenticate, facilities.meta);
router.get('/facilities/:id', authenticate, validate(s.idParams, 'params'), facilities.get);

router.get('/doctors', authenticate, validate(s.doctorsQuery, 'query'), doctors.list);

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
router.get('/doctors/:id', authenticate, validate(s.idParams, 'params'), doctors.get);

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
// ORDONNANCES ET COMPLÉMENTS
// =========================================

const doctorById = [authenticate, requireRole('doctor'), validate(s.positiveIdParams, 'params')];

router.get('/appointments/:id/prescriptions', ...doctorById, rx.listForAppointment);
router.post('/appointments/:id/prescriptions', ...doctorById, validate(s.createPrescription), rx.create);
router.post('/appointments/:id/consultation/addenda', ...doctorById, validate(s.addendum), rx.addAddendum);
router.put('/prescriptions/:id', ...doctorById, validate(s.updatePrescription), rx.update);
router.post('/prescriptions/:id/issue', ...doctorById, validate(s.issuePrescription), rx.issue);
router.post('/prescriptions/:id/cancel', ...doctorById, validate(s.cancelPrescription), rx.cancel);

router.get(
  '/patients/:patientId/prescriptions',
  authenticate,
  requireRole('patient', 'doctor'),
  validate(s.patientIdParams, 'params'),
  rx.listForPatient
);

const uploadLimiter = createUploadLimiter();
const documentAccess = [authenticate, requireRole('patient', 'doctor')];

router.get('/patients/:patientId/documents', ...documentAccess, validate(s.patientIdParams, 'params'), documents.list);
router.post(
  '/patients/:patientId/documents',
  ...documentAccess,
  validate(s.patientIdParams, 'params'),
  uploadLimiter,
  documents.receiveFile,
  validate(s.documentUpload),
  documents.upload
);
router.post('/documents/:id/download-link', ...documentAccess, validate(s.positiveIdParams, 'params'), documents.downloadLink);
router.post('/documents/:id/release', ...documentAccess, validate(s.positiveIdParams, 'params'), documents.release);
router.post(
  '/documents/:id/entered-in-error',
  ...documentAccess,
  validate(s.positiveIdParams, 'params'),
  validate(s.enteredInError),
  documents.enteredInError
);
router.get('/files/:token', validate(s.fileTokenParams, 'params'), documents.serveFile);

const patientOwner = [authenticate, requireRole('patient')];
router.get('/patients/:patientId/consents', ...patientOwner, validate(s.patientIdParams, 'params'), sharing.listConsents);
router.post('/patients/:patientId/consents', ...patientOwner, validate(s.patientIdParams, 'params'), validate(s.grantConsent), sharing.grantConsent);
router.post('/consents/:id/revoke', ...patientOwner, validate(s.positiveIdParams, 'params'), sharing.revokeConsent);
router.get('/patients/:patientId/access-history', ...patientOwner, validate(s.patientIdParams, 'params'), sharing.accessHistory);

const emergencyLimiter = createUserLimiter('emergency-lookup', 20);
router.get(
  '/emergency/patient-lookup',
  authenticate,
  requireRole('doctor'),
  emergencyLimiter,
  validate(s.emergencyLookupQuery, 'query'),
  sharing.lookup
);
router.post(
  '/patients/:patientId/emergency-access',
  authenticate,
  requireRole('doctor'),
  validate(s.patientIdParams, 'params'),
  validate(s.startEmergencyAccess),
  sharing.startEmergency
);

router.get(
  '/patients/:patientId/consultations',
  authenticate,
  requireRole('doctor'),
  validate(s.patientIdParams, 'params'),
  rx.consultationHistory
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
  requireRole(...STAFF_ROLES),
  staffScopeMiddleware
);

staff.use('/doctors/:id', doctorInScopeMiddleware('id'));
staff.use('/appointments/:id', appointmentInScopeMiddleware('id'));

const platformOnly = requireRole('admin');
const facilityParams = validate(s.facilityParams, 'params');


// Périmètre du compte connecté
staff.get('/me/scope', admin.scope);


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

staff.get(
  '/guardian-links',
  validate(s.guardianLinksQuery, 'query'),
  patients.listGuardianLinks
);

staff.patch(
  '/guardian-links/:id',
  validate(s.reviewGuardianLink),
  patients.reviewGuardianLink
);


// Gestion des établissements
staff.get('/facilities', facilityAdmin.list);
staff.post('/facilities', platformOnly, validate(s.createFacility), facilityAdmin.create);
staff.get('/facilities/:facilityId', facilityParams, facilityAdmin.get);
staff.patch('/facilities/:facilityId', facilityParams, validate(s.updateFacility), facilityAdmin.update);
staff.put('/facilities/:facilityId/services', facilityParams, validate(s.facilityServices), facilityAdmin.setServices);
staff.put('/facilities/:facilityId/opening-hours', facilityParams, validate(s.facilityOpeningHours), facilityAdmin.setOpeningHours);
staff.put('/facilities/:facilityId/specialties', facilityParams, validate(s.facilitySpecialties), facilityAdmin.setSpecialties);
staff.post('/facilities/:facilityId/members', facilityParams, validate(s.addFacilityMember), facilityAdmin.addMember);
staff.delete('/facilities/:facilityId/members/:memberId', facilityAdmin.revokeMember);
staff.post('/facilities/:facilityId/doctors', facilityParams, validate(s.attachDoctor), facilityAdmin.attachDoctor);
staff.patch('/facilities/:facilityId/doctors/:doctorId', validate(s.updateAffiliation), facilityAdmin.updateAffiliation);


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
  validate(s.workingHoursQuery, 'query'),
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
