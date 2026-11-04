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
exports.leave = z.object({ startDate: z.string(), endDate: z.string(), reason: z.string().optional() });
exports.block = z.object({ startsAt: z.string().datetime(), endsAt: z.string().datetime(), reason: z.string().optional() });

exports.updateProfile = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
}).strict().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Au moins un champ doit être fourni' }
);
