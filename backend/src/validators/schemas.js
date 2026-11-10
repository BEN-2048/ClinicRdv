const { z } = require('zod');

exports.register = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Minimum 8 caractères'),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  phone: z.string().max(30).optional(),
});
exports.login = z.object({ email: z.string().email(), password: z.string().min(1) });
exports.slotsQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format AAAA-MM-JJ'),
  facilityId: z.coerce.number().int().positive().optional(),
});
exports.book = z.object({
  doctorId: z.number().int().positive(),
  startsAt: z.string().datetime(),
  reason: z.string().max(500).optional(),
  patientProfileId: z.number().int().positive().optional(),
  facilityId: z.number().int().positive().optional(),
});

exports.facilitySearchQuery = z.object({
  q: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  specialtyId: z.coerce.number().int().positive().optional(),
  service: z.string().regex(/^[a-z_]{2,30}$/).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
}).refine((o) => (o.lat === undefined) === (o.lng === undefined), {
  message: 'lat et lng doivent etre fournis ensemble',
});

exports.idParams = z.object({ id: z.coerce.number().int().positive() });

exports.doctorsQuery = z.object({
  q: z.string().trim().max(80).optional(),
  specialtyId: z.coerce.number().int().positive().optional(),
  facilityId: z.coerce.number().int().positive().optional(),
});

exports.addDependent = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  birthDate: z.string().date('Format AAAA-MM-JJ'),
  sex: z.enum(['female', 'male']).optional(),
  relationship: z.enum(['parent', 'legal_guardian']),
}).strict();

exports.guardianLinksQuery = z.object({
  status: z.enum(['pending', 'verified', 'rejected', 'revoked']).optional(),
});

exports.reviewGuardianLink = z.object({
  status: z.enum(['verified', 'rejected', 'revoked']),
  reason: z.string().trim().max(255).optional(),
}).strict().refine(
  (o) => o.status === 'verified' || (o.reason && o.reason.length > 0),
  { message: 'Un motif est obligatoire pour refuser ou revoquer un lien' }
);
exports.reschedule = z.object({ startsAt: z.string().datetime() });
exports.notes = z.object({ notes: z.string().max(5000), prescription: z.string().max(5000).optional() });
exports.workingHours = z.object({
  hours: z.array(z.object({
    weekday: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
  })),
  consultationMinutes: z.number().int().refine((n) => [15, 30, 45, 60].includes(n)),
  facilityId: z.number().int().positive().optional(),
});
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format AAAA-MM-JJ');
const consultationMinutes = z.number().int().refine((n) => [15, 30, 45, 60].includes(n), 'Durée : 15, 30, 45 ou 60');

exports.leave = z.object({ startDate: isoDate, endDate: isoDate, reason: z.string().max(255).optional() });
exports.block = z.object({ startsAt: z.string().datetime(), endsAt: z.string().datetime(), reason: z.string().max(255).optional() });

exports.createDoctor = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Minimum 8 caractères'),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  phone: z.string().max(30).optional(),
  specialtyId: z.number().int().positive(),
  bio: z.string().max(2000).optional(),
  fee: z.number().nonnegative().optional(),
  consultationMinutes: consultationMinutes.optional(),
  languages: z.string().max(100).optional(),
  facilityId: z.number().int().positive().optional(),
});
exports.updateDoctor = z.object({
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional(),
  phone: z.string().max(30).nullable().optional(),
  specialtyId: z.number().int().positive().optional(),
  bio: z.string().max(2000).nullable().optional(),
  fee: z.number().nonnegative().optional(),
  consultationMinutes: consultationMinutes.optional(),
  languages: z.string().max(100).optional(),
  active: z.boolean().optional(),
}).refine((o) => Object.keys(o).length > 0, 'Aucun champ à modifier');
exports.adminBook = exports.book.extend({ patientId: z.number().int().positive() });
exports.adminAppointmentsQuery = z.object({
  date: isoDate.optional(),
  doctorId: z.coerce.number().int().positive().optional(),
  patientId: z.coerce.number().int().positive().optional(),
  status: z.enum(['pending', 'confirmed', 'cancelled', 'done']).optional(),
  facilityId: z.coerce.number().int().positive().optional(),
});
exports.statsQuery = z.object({ from: isoDate.optional(), to: isoDate.optional() });
exports.patientsQuery = z.object({ q: z.string().max(80).optional() });

exports.updateProfile = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
}).strict().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Au moins un champ doit être fourni' }
);


// =========================================
// FICHE DE CONSULTATION MÉDICALE
// =========================================

const optionalText = z.string().max(5000).nullable().optional();

const optionalVital = z.number()
  .finite()
  .nonnegative()
  .nullable()
  .optional();

exports.consultation = z.object({
  chiefComplaint: optionalText,

  bloodPressure: z.string().max(20).nullable().optional(),
  heartRate: optionalVital,
  temperature: optionalVital,
  oxygenSaturation: optionalVital,
  weight: optionalVital,
  height: optionalVital,

  medicalHistory: optionalText,
  currentTreatments: optionalText,

  clinicalExamination: optionalText,
  diagnosis: optionalText,

  notes: optionalText,
  prescription: optionalText,
}).strict();

exports.waitingListParams = z.object({ doctorId: z.coerce.number().int().positive() });
exports.waitingListAlert = z.object({
  timeSlots: z.array(z.enum(['all_day', 'morning', 'afternoon', 'evening'])).min(1, 'Choisissez au moins une plage horaire'),
  weekdays: z.array(z.number().int().min(1).max(5)).min(1, 'Choisissez au moins un jour').transform((d) => [...new Set(d)].sort()),
  minNotice: z.enum(['2h', '24h', 'any']),
  notifyPush: z.boolean(),
  notifySms: z.boolean(),
}).refine((o) => o.notifyPush || o.notifySms, 'Activez au moins un canal de notification');

exports.verifyEmail = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/, 'Le code doit contenir 6 chiffres'),
}).strict();

exports.resendOtp = z.object({
  email: z.string().email(),
}).strict();

const facilityFields = {
  name: z.string().trim().min(2).max(150),
  type: z.enum(['hospital', 'clinic', 'medical_center', 'health_center']),
  description: z.string().trim().max(2000).nullable(),
  address: z.string().trim().max(255).nullable(),
  city: z.string().trim().max(80).nullable(),
  province: z.string().trim().max(80).nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  phone: z.string().trim().max(30).nullable(),
  emergencyPhone: z.string().trim().max(30).nullable(),
  email: z.string().trim().email().max(255).nullable(),
  timezone: z.enum(['Africa/Kinshasa', 'Africa/Lubumbashi']),
  status: z.enum(['pending', 'active', 'suspended']),
};

const coordinatesTogether = (o) =>
  (o.latitude === undefined) === (o.longitude === undefined);

exports.createFacility = z.object(facilityFields)
  .partial()
  .required({ name: true, type: true, timezone: true })
  .strict()
  .refine(coordinatesTogether, 'latitude et longitude doivent etre fournies ensemble');

exports.updateFacility = z.object(facilityFields)
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'Aucun champ a modifier')
  .refine(coordinatesTogether, 'latitude et longitude doivent etre fournies ensemble');

exports.facilityParams = z.object({ facilityId: z.coerce.number().int().positive() });

exports.facilityServices = z.object({
  services: z.array(z.object({
    code: z.string().regex(/^[a-z_]{2,30}$/),
    available24h: z.boolean().optional(),
  })).max(30),
}).strict();

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

exports.facilityOpeningHours = z.object({
  hours: z.array(z.object({
    weekday: z.number().int().min(0).max(6),
    opensAt: hhmm,
    closesAt: hhmm,
  })).max(28),
}).strict();

exports.facilitySpecialties = z.object({
  specialtyIds: z.array(z.number().int().positive()).max(100),
}).strict();

exports.addFacilityMember = z.object({
  email: z.string().trim().email(),
  role: z.enum(['facility_admin', 'secretary']),
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  password: z.string().min(8, 'Minimum 8 caractères').optional(),
}).strict();

exports.attachDoctor = z.object({
  doctorId: z.number().int().positive(),
  fee: z.number().nonnegative().nullable().optional(),
}).strict();

exports.updateAffiliation = z.object({
  status: z.enum(['active', 'inactive']).optional(),
  fee: z.number().nonnegative().nullable().optional(),
}).strict().refine((o) => Object.keys(o).length > 0, 'Aucun champ a modifier');

exports.workingHoursQuery = z.object({
  facilityId: z.coerce.number().int().positive().optional(),
});

const pastDate = z.string().date('Format AAAA-MM-JJ').refine(
  (d) => d <= new Date().toISOString().slice(0, 10),
  'La date ne peut pas être dans le futur'
);
const optionalNote = z.string().trim().max(2000).nullable().optional();

const recordShapes = {
  allergies: {
    substance: z.string().trim().min(1).max(150),
    reaction: z.string().trim().max(500).nullable().optional(),
    severity: z.enum(['mild', 'moderate', 'severe', 'unknown']).optional(),
    status: z.enum(['active', 'resolved']).optional(),
    notedOn: pastDate.nullable().optional(),
    notes: optionalNote,
  },
  conditions: {
    label: z.string().trim().min(1).max(200),
    icd10Code: z.string().trim().toUpperCase().regex(/^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/, 'Code CIM-10 invalide').nullable().optional(),
    onsetDate: pastDate.nullable().optional(),
    status: z.enum(['active', 'resolved']).optional(),
    notes: optionalNote,
  },
  medications: {
    name: z.string().trim().min(1).max(200),
    dosage: z.string().trim().max(100).nullable().optional(),
    frequency: z.string().trim().max(100).nullable().optional(),
    startDate: z.string().date().nullable().optional(),
    endDate: z.string().date().nullable().optional(),
    status: z.enum(['active', 'stopped']).optional(),
    notes: optionalNote,
  },
  immunizations: {
    vaccine: z.string().trim().min(1).max(150),
    doseLabel: z.string().trim().max(50).nullable().optional(),
    administeredOn: pastDate,
    lotNumber: z.string().trim().max(50).nullable().optional(),
    notes: optionalNote,
  },
};

const datesInOrder = (o) => !o.startDate || !o.endDate || o.endDate >= o.startDate;

exports.recordEntry = Object.fromEntries(Object.entries(recordShapes).map(([kind, shape]) => [kind, {
  create: z.object({
    ...shape,
    facilityId: z.number().int().positive().optional(),
    confidential: z.boolean().optional(),
  }).strict().refine(datesInOrder, 'La date de fin doit suivre la date de début'),
  update: z.object(shape).partial().extend({ confidential: z.boolean().optional() }).strict()
    .refine((o) => Object.keys(o).length > 0, 'Aucun champ a modifier')
    .refine(datesInOrder, 'La date de fin doit suivre la date de début'),
}]));

exports.recordParams = z.object({
  patientId: z.coerce.number().int().positive(),
  kind: z.enum(['allergies', 'conditions', 'medications', 'immunizations']).optional(),
  entryId: z.coerce.number().int().positive().optional(),
});

exports.recordQuery = z.object({
  includeErrors: z.enum(['true', 'false']).optional(),
});

exports.enteredInError = z.object({
  reason: z.string().trim().min(3).max(255),
}).strict();

const prescriptionItem = z.object({
  medicationName: z.string().trim().min(1).max(200),
  dosage: z.string().trim().max(100).nullable().optional(),
  route: z.string().trim().max(50).nullable().optional(),
  frequency: z.string().trim().max(100).nullable().optional(),
  duration: z.string().trim().max(100).nullable().optional(),
  quantity: z.string().trim().max(50).nullable().optional(),
  instructions: z.string().trim().max(500).nullable().optional(),
}).strict();

exports.createPrescription = z.object({
  items: z.array(prescriptionItem).min(1, 'Ajoutez au moins un médicament').max(30),
  notes: z.string().trim().max(2000).nullable().optional(),
  confidential: z.boolean().optional(),
}).strict();

exports.updatePrescription = z.object({
  items: z.array(prescriptionItem).min(1).max(30).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  confidential: z.boolean().optional(),
}).strict().refine((o) => Object.keys(o).length > 0, 'Aucun champ a modifier');

exports.issuePrescription = z.object({
  addToMedications: z.boolean().optional(),
}).strict();

exports.cancelPrescription = z.object({
  reason: z.string().trim().min(3).max(255),
}).strict();

exports.addendum = z.object({
  content: z.string().trim().min(1).max(5000),
}).strict();

exports.positiveIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

exports.patientIdParams = z.object({
  patientId: z.coerce.number().int().positive(),
});

const booleanField = z.enum(['true', 'false']).transform((v) => v === 'true');

exports.documentUpload = z.object({
  category: z.enum(['prescription', 'lab_result', 'imaging_report', 'medical_report', 'certificate', 'vaccination_card', 'other']),
  title: z.string().trim().min(1).max(150),
  description: z.string().trim().max(1000).optional(),
  documentDate: z.string().date().optional(),
  facilityId: z.coerce.number().int().positive().optional(),
  appointmentId: z.coerce.number().int().positive().optional(),
  confidential: booleanField.optional(),
  releaseNow: booleanField.optional(),
}).strict();

exports.fileTokenParams = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/).max(600),
});
