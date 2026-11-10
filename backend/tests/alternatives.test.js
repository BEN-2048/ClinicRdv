process.env.JWT_SECRET = 'test-secret';
process.env.OTP_SECRET = 'test-otp-secret';
process.env.SMS_DRIVER = 'console';
process.env.EMAIL_DRIVER = 'console';

jest.mock('../src/config/db', () => {
  const query = jest.fn();
  const client = { query, release: jest.fn() };
  return { query, connect: jest.fn(async () => client) };
});

jest.mock('../src/services/slots.service', () => ({
  ...jest.requireActual('../src/services/slots.service'),
  getAvailableSlots: jest.fn(),
  resolveFacility: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const pool = require('../src/config/db');
const slots = require('../src/services/slots.service');
const app = require('../src/app');
const alternatives = require('../src/services/alternatives.service');

const token = (role, id) => `Bearer ${jwt.sign({ id, role }, 'test-secret')}`;
const P = token('patient', 3);
const TZ = 'Africa/Lubumbashi';
const at = (days, hour) => {
  const d = new Date(Date.now() + days * 86400000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

const setup = (routes = []) => {
  pool.query.mockReset();
  pool.query.mockImplementation(async (sql, params) => {
    for (const [part, result] of routes) {
      if (sql.includes(part)) return typeof result === 'function' ? result(sql, params) : result;
    }
    return { rows: [], rowCount: 0 };
  });
};
const calls = (part) => pool.query.mock.calls.filter(([sql]) => sql.includes(part));
const one = (row) => ({ rows: [row], rowCount: 1 });
const many = (rows) => ({ rows, rowCount: rows.length });

const ALL_DAYS = many([0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday })));
const ORIGIN = {
  doctor_id: 12, specialty_id: 2, first_name: 'Paul', last_name: 'Kabila', specialty: 'Pédiatrie',
  facility_id: 1, facility_name: 'Clinique Lumière', city: 'Lubumbashi', timezone: TZ, latitude: -11.66, longitude: 27.48,
};
const CANDIDATE = (over = {}) => ({
  doctor_id: 20, first_name: 'Awa', last_name: 'Mbuyi', specialty: 'Pédiatrie', fee: '20', facility_id: 1,
  facility_name: 'Clinique Lumière', city: 'Lubumbashi', address: null, timezone: TZ, phone: null,
  distance_km: null, same_facility: true, same_city: true, ...over,
});

let logSpy;
let errorSpy;
beforeEach(() => {
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  slots.getAvailableSlots.mockReset();
  slots.resolveFacility.mockReset();
});
afterEach(() => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
});

describe('Recherche des prochains créneaux', () => {
  test('ne consulte que les jours travailles et s arrete au nombre demande', async () => {
    setup([['FROM working_hours', many([{ weekday: 1 }])]]);
    slots.getAvailableSlots.mockImplementation(async () => [
      { startsAt: at(1, 7), endsAt: at(1, 8), available: false },
      { startsAt: at(1, 8), endsAt: at(1, 9), available: true },
      { startsAt: at(1, 9), endsAt: at(1, 10), available: true },
    ]);
    const found = await alternatives.nextSlots(12, { id: 1, timezone: TZ }, { count: 3 });
    const mondays = slots.getAvailableSlots.mock.calls.map(([, date]) => new Date(`${date}T12:00:00Z`).getUTCDay());
    expect(mondays.every((d) => d === 1)).toBe(true);
    expect(slots.getAvailableSlots.mock.calls.length).toBeLessThanOrEqual(2);
    expect(found).toHaveLength(3);
  });

  test('ignore le creneau du rendez-vous actuel', async () => {
    setup([['FROM working_hours', ALL_DAYS]]);
    slots.getAvailableSlots.mockResolvedValue([{ startsAt: at(1, 8), endsAt: at(1, 9), available: true }]);
    const found = await alternatives.nextSlots(12, { id: 1, timezone: TZ }, { count: 1, skip: at(1, 8) });
    expect(found).toHaveLength(0);
    expect(slots.getAvailableSlots).toHaveBeenCalledTimes(14);
  });

  test('un medecin sans horaires n est pas interroge', async () => {
    setup();
    expect(await alternatives.nextSlots(12, { id: 1, timezone: TZ })).toEqual([]);
    expect(slots.getAvailableSlots).not.toHaveBeenCalled();
  });
});

describe('Solutions proposées pour un rendez-vous', () => {
  const OWN = 'patient_profile_id IN';
  const appointment = (over = {}) => ({
    id: 41, patient_id: 3, patient_profile_id: 5, doctor_id: 12, facility_id: 1, starts_at: at(3, 8),
    status: 'cancelled', cancel_reason: 'doctor_unavailable', replaced_by_appointment_id: null, reason: 'Fièvre', ...over,
  });

  const base = (appt, candidates) => [
    [OWN, appt ? one(appt) : many([])],
    ['JOIN facilities f ON f.id = $2', one(ORIGIN)],
    ['FROM working_hours', ALL_DAYS],
    ['FROM doctor_affiliations da', many(candidates)],
  ];

  test('propose uniquement des medecins et creneaux reels, avec une raison lisible', async () => {
    setup(base(appointment(), [
      CANDIDATE(),
      CANDIDATE({ doctor_id: 21, facility_id: 2, facility_name: 'Hôpital Sendwe', same_facility: false, distance_km: '3.2' }),
      CANDIDATE({ doctor_id: 22, facility_id: 3, same_facility: false, same_city: false, city: 'Likasi' }),
      CANDIDATE({ doctor_id: 12, facility_id: 4, facility_name: 'Centre Kenya', same_facility: false }),
    ]));
    slots.getAvailableSlots.mockImplementation(async (doctorId) =>
      doctorId === 22 ? [] : [{ startsAt: at(2, 8), endsAt: at(2, 9), available: true }]);

    const res = await request(app).get('/api/appointments/41/alternatives').set('Authorization', P);
    expect(res.status).toBe(200);
    expect(res.body.origin).toMatchObject({ appointmentId: 41, doctorName: 'Dr Paul Kabila', cancelReason: 'doctor_unavailable' });
    const byKind = res.body.options.map((o) => [o.kind, o.doctorId, o.reason]);
    expect(byKind).toEqual([
      ['same_doctor', 12, 'Même médecin, même établissement'],
      ['same_facility', 20, 'Même spécialité (Pédiatrie), même établissement'],
      ['other_facility', 21, 'Même spécialité, à 3.2 km'],
      ['other_facility', 12, 'Même médecin, dans un autre établissement'],
    ]);
    expect(res.body.options.every((o) => o.slots.length > 0)).toBe(true);
    expect(res.body.options.find((o) => o.doctorId === 22)).toBeUndefined();
  });

  test('la recherche se limite a la meme specialite et exclut le rendez-vous d origine', async () => {
    setup(base(appointment(), []));
    slots.getAvailableSlots.mockResolvedValue([]);
    await request(app).get('/api/appointments/41/alternatives').set('Authorization', P);
    const [sql, params] = calls('FROM doctor_affiliations da')[0];
    expect(sql).toContain('d.specialty_id = $1');
    expect(sql).toContain('NOT (d.id = $2 AND f.id = $3)');
    expect(sql).toContain("f.status = 'active'");
    expect(params.slice(0, 4)).toEqual([2, 12, 1, 'Lubumbashi']);
    expect(params.slice(4)).toEqual([-11.66, 27.48]);
  });

  test('la position du patient, si elle est donnee, sert au classement par distance', async () => {
    setup(base(appointment(), []));
    slots.getAvailableSlots.mockResolvedValue([]);
    await request(app).get('/api/appointments/41/alternatives?lat=-11.7&lng=27.5').set('Authorization', P);
    expect(calls('FROM doctor_affiliations da')[0][1].slice(4)).toEqual([-11.7, 27.5]);
  });

  test('sans coordonnees, le classement se fait par ville', async () => {
    setup(base(appointment(), []));
    pool.query.mockImplementation(async (sql) => {
      if (sql.includes('patient_profile_id IN')) return one(appointment());
      if (sql.includes('JOIN facilities f ON f.id = $2')) return one({ ...ORIGIN, latitude: null, longitude: null });
      return many([]);
    });
    slots.getAvailableSlots.mockResolvedValue([]);
    await request(app).get('/api/appointments/41/alternatives').set('Authorization', P);
    const [sql, params] = calls('FROM doctor_affiliations da')[0];
    expect(sql).toContain('NULL::numeric AS distance_km');
    expect(params).toHaveLength(4);
  });

  test('un rendez-vous d un autre patient est introuvable', async () => {
    setup(base(null, []));
    const res = await request(app).get('/api/appointments/41/alternatives').set('Authorization', P);
    expect(res.status).toBe(404);
  });

  test.each([
    [{ status: 'done' }, 'APPOINTMENT_DONE'],
    [{ replaced_by_appointment_id: 50 }, 'ALREADY_REPLACED'],
  ])('refuse %p', async (over, code) => {
    setup(base(appointment(over), []));
    const res = await request(app).get('/api/appointments/41/alternatives').set('Authorization', P);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe(code);
  });

  test('reserve aux patients', async () => {
    setup();
    const res = await request(app).get('/api/appointments/41/alternatives').set('Authorization', token('doctor', 4));
    expect(res.status).toBe(403);
  });

  test('pour un medecin sans rendez-vous, l etablissement est determine', async () => {
    slots.resolveFacility.mockResolvedValue({ id: 1, timezone: TZ, name: 'Clinique Lumière' });
    setup(base(null, []));
    slots.getAvailableSlots.mockResolvedValue([]);
    const res = await request(app).get('/api/doctors/12/alternatives?facilityId=1').set('Authorization', P);
    expect(res.status).toBe(200);
    expect(slots.resolveFacility).toHaveBeenCalledWith(12, 1);
    expect(res.body.options).toEqual([]);
  });
});

describe('Réservation de remplacement', () => {
  const OWN = 'patient_profile_id IN';
  const NEW_SLOT = at(4, 9);
  const body = { doctorId: 20, startsAt: NEW_SLOT, facilityId: 2 };
  const original = (over = {}) => ({
    id: 41, patient_id: 3, patient_profile_id: 5, doctor_id: 12, facility_id: 1, starts_at: at(3, 8),
    status: 'confirmed', replaced_by_appointment_id: null, reason: 'Fièvre', ...over,
  });
  const flow = (appt, extra = []) => [
    [OWN, one(appt)],
    ['INSERT INTO appointments', one({ id: 77, starts_at: NEW_SLOT, doctor_id: 20, facility_id: 2 })],
    ['consent_scope', one({ doctor_last_name: 'Mbuyi', facility_name: 'Hôpital Sendwe', timezone: TZ, consent_scope: null })],
    ...extra,
  ];

  beforeEach(() => {
    slots.resolveFacility.mockResolvedValue({ id: 2, timezone: TZ, name: 'Hôpital Sendwe' });
    slots.getAvailableSlots.mockResolvedValue([{ startsAt: NEW_SLOT, endsAt: at(4, 10), available: true }]);
  });

  test('annule l ancien rendez-vous, reserve le nouveau et les relie, en une seule transaction', async () => {
    setup(flow(original()));
    const res = await request(app).post('/api/appointments/41/redirect').set('Authorization', P).send(body);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ replaced: 41, appointment: { id: 77 } });
    const order = pool.query.mock.calls.map(([sql]) => sql.trim().split(/\s+/).slice(0, 2).join(' '));
    expect(order.indexOf('UPDATE appointments')).toBeLessThan(order.indexOf('INSERT INTO'));
    const [cancelSql, cancelParams] = calls("cancel_reason = 'redirected'")[0];
    expect(cancelSql).toContain("cancelled_by_role = 'patient'");
    expect(cancelParams).toEqual([41, 3]);
    const [, insert] = calls('INSERT INTO appointments')[0];
    expect(insert).toEqual([3, 5, 20, 2, NEW_SLOT, at(4, 10), 'Fièvre']);
    expect(calls('SET replaced_by_appointment_id = $2')[0][1]).toEqual([41, 77]);
    expect(calls('COMMIT')).toHaveLength(1);
    expect(calls("'Nouveau rendez-vous confirmé'")).toHaveLength(1);
  });

  test('le dossier n est pas partage automatiquement avec le nouvel etablissement', async () => {
    setup(flow(original()));
    const res = await request(app).post('/api/appointments/41/redirect').set('Authorization', P).send(body);
    expect(res.body.recordSharing).toEqual({ facilityId: 2, facilityName: 'Hôpital Sendwe', sameFacility: false, consentScope: null });
    expect(calls('INSERT INTO record_consents')).toHaveLength(0);
    expect(calls('consent_scope')[0][1]).toEqual([20, 2, 5]);
  });

  test('si le creneau n est plus libre, rien n est modifie', async () => {
    slots.getAvailableSlots.mockResolvedValue([{ startsAt: NEW_SLOT, available: false }]);
    setup(flow(original()));
    const res = await request(app).post('/api/appointments/41/redirect').set('Authorization', P).send(body);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SLOT_TAKEN');
    expect(calls('INSERT INTO appointments')).toHaveLength(0);
    expect(calls('COMMIT')).toHaveLength(0);
    expect(calls('ROLLBACK').length).toBeGreaterThan(0);
  });

  test('une reservation concurrente est signalee clairement', async () => {
    setup(flow(original(), []));
    pool.query.mockImplementation(async (sql) => {
      if (sql.includes(OWN)) return one(original());
      if (sql.includes('INSERT INTO appointments')) throw Object.assign(new Error('x'), { code: '23P01' });
      return many([]);
    });
    const res = await request(app).post('/api/appointments/41/redirect').set('Authorization', P).send(body);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SLOT_TAKEN');
  });

  test('depuis un rendez-vous deja annule par le medecin : pas de seconde annulation, mais le lien est garde', async () => {
    setup(flow(original({ status: 'cancelled', cancel_reason: 'doctor_unavailable' })));
    const res = await request(app).post('/api/appointments/41/redirect').set('Authorization', P).send(body);
    expect(res.status).toBe(201);
    expect(calls("cancel_reason = 'redirected'")).toHaveLength(0);
    expect(calls('SET replaced_by_appointment_id = $2')).toHaveLength(1);
  });

  test.each([
    [{ status: 'done' }, 'APPOINTMENT_DONE'],
    [{ replaced_by_appointment_id: 60 }, 'ALREADY_REPLACED'],
  ])('refuse %p', async (over, code) => {
    setup(flow(original(over)));
    const res = await request(app).post('/api/appointments/41/redirect').set('Authorization', P).send(body);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe(code);
    expect(calls('INSERT INTO appointments')).toHaveLength(0);
  });

  test('valide le corps de la demande', async () => {
    setup();
    const res = await request(app).post('/api/appointments/41/redirect').set('Authorization', P).send({ doctorId: 20 });
    expect(res.status).toBe(400);
  });
});

describe('Affichage du nom du médecin', () => {
  test('ne double pas le titre quand il est deja saisi dans le prenom', async () => {
    setup([
      ['patient_profile_id IN', one({ id: 41, patient_id: 3, patient_profile_id: 5, doctor_id: 12, facility_id: 1, starts_at: at(3, 8), status: 'cancelled', replaced_by_appointment_id: null })],
      ['JOIN facilities f ON f.id = $2', one({ ...ORIGIN, first_name: 'Dr.', last_name: 'Kabila' })],
      ['FROM doctor_affiliations da', many([CANDIDATE({ first_name: 'Drake', last_name: 'Mumba' })])],
      ['FROM working_hours', ALL_DAYS],
    ]);
    slots.getAvailableSlots.mockResolvedValue([{ startsAt: at(2, 8), endsAt: at(2, 9), available: true }]);
    const res = await request(app).get('/api/appointments/41/alternatives').set('Authorization', P);
    expect(res.body.origin.doctorName).toBe('Dr Kabila');
    expect(res.body.options.find((o) => o.doctorId === 20).doctorName).toBe('Dr Drake Mumba');
  });
});
