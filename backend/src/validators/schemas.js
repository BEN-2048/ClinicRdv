const { z } = require('zod');

exports.register = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Minimum 8 caractères'),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  phone: z.string().max(30).optional(),
});
exports.login = z.object({ email: z.string().email(), password: z.string().min(1) });
exports.slotsQuery = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format AAAA-MM-JJ') });
exports.book = z.object({
  doctorId: z.number().int().positive(),
  startsAt: z.string().datetime(),
  reason: z.string().max(500).optional(),
});
exports.reschedule = z.object({ startsAt: z.string().datetime() });
exports.notes = z.object({ notes: z.string().max(5000), prescription: z.string().max(5000).optional() });
exports.workingHours = z.object({
  hours: z.array(z.object({
    weekday: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
  })),
  consultationMinutes: z.number().int().refine((n) => [15, 30, 45, 60].includes(n)),
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
