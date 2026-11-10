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
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const pool = require('../src/config/db');
const slots = require('../src/services/slots.service');
const app = require('../src/app');
const unavailability = require('../src/services/unavailability.service');

const token = (role, id) => `Bearer ${jwt.sign({ id, role }, 'test-secret')}`;
const PHONE = '+243812345678';
const IN_3_DAYS = new Date(Date.now() + 3 * 24 * 3600 * 1000);
IN_3_DAYS.setUTCHours(8, 0, 0, 0);
const SLOT = IN_3_DAYS.toISOString();

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

let logSpy;
let errorSpy;
const sms = () => logSpy.mock.calls.map((c) => c.join(' ')).filter((l) => l.includes('SMS de développement'));

beforeEach(() => {
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  slots.getAvailableSlots.mockReset();
  slots.getAvailableSlots.mockResolvedValue([]);
});
afterEach(() => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
});

const NOTIFY_ROW = (over = {}) => ({
  id: 41, patient_id: 3, starts_at: SLOT, cancel_reason: 'doctor_unavailable', cancel_note: null,
  cancelled_by_role: 'doctor', facility_name: 'Clinique Lumière', timezone: 'Africa/Lubumbashi',
  doctor_last_name: 'Mukendi', profile_first_name: 'Amina', profile_user_id: 3,
  phone_e164: PHONE, phone_verified_at: new Date().toISOString(), sms_enabled: true, ...over,
});
const NOTIFY_SQL = 'LEFT JOIN notification_preferences np ON np.user_id = a.patient_id';

describe('Règles de la liste d attente', () => {
  const at = (h, m = 0) => h * 60 + m;
  test.each([
    [['all_day'], 'any', at(7), 1, true],
    [['morning'], '24h', at(9), 48, true],
    [['morning'], '24h', at(9), 5, false],
    [['morning'], '2h', at(13), 48, false],
    [['afternoon'], 'any', at(15, 30), 1, true],
    [['evening'], 'any', at(17, 30), 1, true],
    [['morning', 'evening'], '2h', at(18), 3, true],
  ])('%p, delai %s, %i min, dans %i h -> %p', (timeSlots, notice, minutes, hoursAhead, expected) => {
    expect(unavailability.matchesWaitingPreferences({ time_slots: timeSlots, min_notice: notice }, { minutes, hoursAhead }))
      .toBe(expected);
  });

  test('un patient ne peut pas invoquer une indisponibilite du medecin', () => {
    expect(unavailability.resolveReason('patient', 'doctor_unavailable')).toBe('patient_request');
    expect(unavailability.resolveReason('doctor', 'redirected')).toBe('other');
    expect(unavailability.resolveReason('secretary', 'facility_closed')).toBe('facility_closed');
    expect(unavailability.actorRole('admin')).toBe('facility');
  });
});

describe('Rendez-vous touchés par un congé ou une plage bloquée', () => {
  const DOCTOR = 'SELECT id FROM doctors WHERE user_id = $1';
  const CONFLICT = 'LEFT JOIN LATERAL';

  test('le medecin voit ses rendez-vous a venir qui tombent pendant ses absences', async () => {
    setup([[DOCTOR, one({ id: 12 })], [CONFLICT, many([{ id: 41, cause: 'leave' }])]]);
    const res = await request(app).get('/api/doctors/me/conflicts').set('Authorization', token('doctor', 4));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 41, cause: 'leave' }]);
    const [sql, params] = calls(CONFLICT)[0];
    expect(sql).toContain('AT TIME ZONE f.timezone');
    expect(sql).toContain('a.starts_at > now()');
    expect(params).toEqual([12, null]);
  });

  test('un patient ne peut pas consulter cette liste', async () => {
    setup();
    const res = await request(app).get('/api/doctors/me/conflicts').set('Authorization', token('patient', 3));
    expect(res.status).toBe(403);
  });

  test('seuls les rendez-vous encore en conflit sont annules, puis les patients prevenus', async () => {
    setup([
      [DOCTOR, one({ id: 12 })],
      [CONFLICT, many([{ id: 41 }])],
      ['UPDATE appointments', one({ id: 41 })],
      [NOTIFY_SQL, many([NOTIFY_ROW({ cancel_note: 'Formation à Kinshasa' })])],
    ]);
    const res = await request(app).post('/api/doctors/me/conflicts/cancel').set('Authorization', token('doctor', 4))
      .send({ appointmentIds: [41, 99], note: 'Formation à Kinshasa' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ cancelled: 1, skipped: 1 });
    const [selectSql, selectParams] = calls(CONFLICT)[0];
    expect(selectSql).toContain('FOR UPDATE OF a');
    expect(selectParams).toEqual([12, null, [41, 99]]);
    const [, update] = calls('UPDATE appointments')[0];
    expect(update).toEqual([[41], 4, 'doctor', 'Formation à Kinshasa']);
    const [, notification] = calls('INSERT INTO notifications')[0];
    expect(notification[3]).toContain('le médecin est indisponible');
    expect(notification[3]).toContain('Formation à Kinshasa');
    expect(notification[3]).toContain('Ouvrez ClinicRDV');
    expect(sms()).toHaveLength(1);
    expect(sms()[0]).toContain('est annule (le medecin est indisponible)');
    expect(sms()[0]).not.toContain('Formation');
  });

  test('aucun SMS si le patient a desactive les SMS ou n a pas de numero verifie', async () => {
    setup([
      [DOCTOR, one({ id: 12 })],
      [CONFLICT, many([{ id: 41 }, { id: 42 }])],
      ['UPDATE appointments', many([{ id: 41 }, { id: 42 }])],
      [NOTIFY_SQL, many([NOTIFY_ROW({ sms_enabled: false }), NOTIFY_ROW({ id: 42, phone_verified_at: null })])],
    ]);
    await request(app).post('/api/doctors/me/conflicts/cancel').set('Authorization', token('doctor', 4))
      .send({ appointmentIds: [41, 42] });
    expect(calls('INSERT INTO notifications')).toHaveLength(2);
    expect(sms()).toHaveLength(0);
  });

  test('le message precise le proche concerne quand le rendez-vous est pour un enfant', async () => {
    setup([
      [DOCTOR, one({ id: 12 })],
      [CONFLICT, many([{ id: 41 }])],
      ['UPDATE appointments', one({ id: 41 })],
      [NOTIFY_SQL, many([NOTIFY_ROW({ profile_first_name: 'Léa', profile_user_id: null })])],
    ]);
    await request(app).post('/api/doctors/me/conflicts/cancel').set('Authorization', token('doctor', 4))
      .send({ appointmentIds: [41] });
    expect(calls('INSERT INTO notifications')[0][1][3]).toMatch(/^Le rendez-vous de Léa du /);
    expect(sms()[0]).toContain('le RDV de Lea');
  });

  test('refuse une liste vide', async () => {
    setup([[DOCTOR, one({ id: 12 })]]);
    const res = await request(app).post('/api/doctors/me/conflicts/cancel').set('Authorization', token('doctor', 4))
      .send({ appointmentIds: [] });
    expect(res.status).toBe(400);
  });

  test('le secretariat ne traite que les rendez-vous de ses etablissements', async () => {
    setup([
      ['FROM facility_members m', one({ id: 1, name: 'E', city: 'L', status: 'active', role: 'secretary' })],
      ['FROM doctor_affiliations', one({ '?column?': 1 })],
      [CONFLICT, many([])],
    ]);
    const res = await request(app).post('/api/admin/doctors/12/conflicts/cancel').set('Authorization', token('secretary', 9))
      .send({ appointmentIds: [41] });
    expect(res.status).toBe(200);
    expect(calls(CONFLICT)[0][1]).toEqual([12, [1], [41]]);
    expect(res.body).toEqual({ cancelled: 0, skipped: 1 });
  });
});

describe('Annulation expliquée', () => {
  test('le patient annule : motif impose, sa note ignoree, pas de SMS', async () => {
    setup([
      ['UPDATE appointments', one({ id: 41, patient_id: 3, doctor_id: 12, facility_id: 1, starts_at: SLOT })],
      [NOTIFY_SQL, many([NOTIFY_ROW({ cancel_reason: 'patient_request', cancelled_by_role: 'patient' })])],
    ]);
    const res = await request(app).patch('/api/appointments/41/cancel').set('Authorization', token('patient', 3))
      .send({ reason: 'doctor_unavailable', note: 'x' });
    expect(res.status).toBe(200);
    const [, params] = calls('UPDATE appointments')[0];
    expect(params.slice(4)).toEqual(['patient', 'patient_request', null]);
    const body = calls('INSERT INTO notifications')[0][1][3];
    expect(body).not.toContain('Ouvrez');
    expect(sms()).toHaveLength(0);
  });

  test('le medecin annule avec un motif et un message', async () => {
    setup([
      ['UPDATE appointments', one({ id: 41, patient_id: 3, doctor_id: 12, facility_id: 1, starts_at: SLOT })],
      [NOTIFY_SQL, many([NOTIFY_ROW({ cancel_reason: 'service_unavailable', cancel_note: 'Panne du scanner' })])],
    ]);
    const res = await request(app).patch('/api/appointments/41/cancel').set('Authorization', token('doctor', 4))
      .send({ reason: 'service_unavailable', note: 'Panne du scanner' });
    expect(res.status).toBe(200);
    expect(calls('UPDATE appointments')[0][1].slice(4)).toEqual(['doctor', 'service_unavailable', 'Panne du scanner']);
    expect(sms()[0]).toContain('le service est momentanement indisponible');
  });

  test('un motif inconnu est refuse', async () => {
    setup();
    const res = await request(app).patch('/api/appointments/41/cancel').set('Authorization', token('doctor', 4))
      .send({ reason: 'redirected' });
    expect(res.status).toBe(400);
  });

  test('sans corps, l annulation fonctionne toujours', async () => {
    setup([['UPDATE appointments', one({ id: 41, patient_id: 3, doctor_id: 12, facility_id: 1, starts_at: SLOT })]]);
    const res = await request(app).patch('/api/appointments/41/cancel').set('Authorization', token('patient', 3));
    expect(res.status).toBe(200);
  });
});

describe('Liste d attente déclenchée par un créneau libéré', () => {
  const appointment = { id: 41, patient_id: 3, doctor_id: 12, facility_id: 1, starts_at: SLOT };
  const CANDIDATES = 'FROM waiting_list w';
  const waiting = (over = {}) => ({
    id: 7, patient_id: 20, time_slots: ['all_day'], min_notice: '24h', notify_push: true, notify_sms: true,
    phone_e164: '+243998877665', phone_verified_at: new Date().toISOString(), sms_enabled: true, ...over,
  });
  const base = (candidates, claim = one({ id: 7 })) => [
    ['SELECT id, name, timezone FROM facilities', one({ id: 1, name: 'Clinique Lumière', timezone: 'Africa/Lubumbashi' })],
    [CANDIDATES, many(candidates)],
    ['UPDATE waiting_list SET last_alert_at', claim],
    ['SELECT u.last_name FROM doctors', one({ last_name: 'Mukendi' })],
  ];

  test('previent les patients dont les preferences correspondent, sans exclure personne d autre', async () => {
    slots.getAvailableSlots.mockResolvedValue([{ startsAt: SLOT, available: true }]);
    setup(base([waiting(), waiting({ id: 8, patient_id: 21, time_slots: ['evening'] })]));
    const sent = await unavailability.dispatchFreedSlot(appointment);

    expect(sent).toBe(1);
    const [sql, params] = calls(CANDIDATES)[0];
    expect(sql).toContain('w.patient_id <> $2');
    expect(params[0]).toBe(12);
    expect(params[1]).toBe(3);
    expect(calls('UPDATE waiting_list SET last_alert_at')).toHaveLength(1);
    expect(calls("'waiting_list'")[0][1][2]).toContain('Premier arrivé, premier servi');
    expect(sms()).toHaveLength(1);
  });

  test('rien n est envoye si le creneau n est pas reellement libre (conge, plage bloquee)', async () => {
    slots.getAvailableSlots.mockResolvedValue([{ startsAt: SLOT, available: false }]);
    setup(base([waiting()]));
    expect(await unavailability.dispatchFreedSlot(appointment)).toBe(0);
    expect(calls(CANDIDATES)).toHaveLength(0);
  });

  test('un patient deja alerte recemment n est pas relance', async () => {
    slots.getAvailableSlots.mockResolvedValue([{ startsAt: SLOT, available: true }]);
    setup(base([waiting()], { rows: [], rowCount: 0 }));
    expect(await unavailability.dispatchFreedSlot(appointment)).toBe(0);
    expect(calls('INSERT INTO notifications')).toHaveLength(0);
  });

  test('respecte les choix de canal du patient', async () => {
    slots.getAvailableSlots.mockResolvedValue([{ startsAt: SLOT, available: true }]);
    setup(base([waiting({ notify_sms: false })]));
    await unavailability.dispatchFreedSlot(appointment);
    expect(calls('INSERT INTO notifications')).toHaveLength(1);
    expect(sms()).toHaveLength(0);
  });

  test('un creneau passe ne declenche rien et une erreur ne casse pas l annulation', async () => {
    expect(await unavailability.dispatchFreedSlot({ ...appointment, starts_at: '2020-01-01T08:00:00Z' })).toBe(0);
    slots.getAvailableSlots.mockRejectedValue(new Error('panne'));
    setup(base([waiting()]));
    expect(await unavailability.dispatchFreedSlot(appointment)).toBe(0);
  });

  test('l annulation par le patient libere le creneau pour la liste d attente', async () => {
    slots.getAvailableSlots.mockResolvedValue([{ startsAt: SLOT, available: true }]);
    setup([
      ['UPDATE appointments', one(appointment)],
      ...base([waiting()]),
    ]);
    await request(app).patch('/api/appointments/41/cancel').set('Authorization', token('patient', 3));
    expect(calls("'waiting_list'")).toHaveLength(1);
  });
});

describe('Service temporairement indisponible', () => {
  test('la recherche par service ignore les services indisponibles', async () => {
    setup();
    await request(app).get('/api/facilities?service=radiology').set('Authorization', token('patient', 3));
    const [sql] = calls('FROM facilities f')[0];
    expect(sql).toContain('AND (fs.unavailable_until IS NULL OR fs.unavailable_until <= now())))');
    expect(sql).toContain('AS unavailable_services');
  });

  test('enregistrer la liste des services conserve une indisponibilite en cours si elle n est pas renvoyee', async () => {
    const until = new Date(Date.now() + 86400000).toISOString();
    setup([
      ['SELECT service_code, unavailable_until', many([{ service_code: 'radiology', unavailable_until: until, unavailable_reason: 'Panne' }])],
      ['SELECT * FROM facilities WHERE id', one({ id: 1 })],
    ]);
    const res = await request(app).put('/api/admin/facilities/1/services').set('Authorization', token('admin', 1))
      .send({ services: [{ code: 'radiology' }, { code: 'emergency', available24h: true }] });
    expect(res.status).toBe(200);
    const inserts = calls('INSERT INTO facility_services').map(([, p]) => p);
    expect(inserts[0]).toEqual([1, 'radiology', false, until, 'Panne']);
    expect(inserts[1]).toEqual([1, 'emergency', true, null, null]);
  });

  test('une date de fin explicite a null remet le service en service', async () => {
    setup([
      ['SELECT service_code, unavailable_until', many([{ service_code: 'radiology', unavailable_until: 'x', unavailable_reason: 'Panne' }])],
      ['SELECT * FROM facilities WHERE id', one({ id: 1 })],
    ]);
    await request(app).put('/api/admin/facilities/1/services').set('Authorization', token('admin', 1))
      .send({ services: [{ code: 'radiology', unavailableUntil: null }] });
    expect(calls('INSERT INTO facility_services')[0][1]).toEqual([1, 'radiology', false, null, null]);
  });
});
