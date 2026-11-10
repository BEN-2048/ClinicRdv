process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/config/db', () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));

const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');
const { localToUtc, localDateString, offsetMinutes } = require('../src/utils/timezone');
const { getAvailableSlots, resolveFacility } = require('../src/services/slots.service');
const admin = require('../src/services/admin.service');

const facilityRow = (id, timezone, name = `Etablissement ${id}`) => ({ id, timezone, name });

const route = (routes) => {
  pool.query.mockImplementation(async (sql) => {
    for (const [part, result] of routes) {
      if (sql.includes(part)) return typeof result === 'function' ? result(sql) : result;
    }
    return { rows: [], rowCount: 0 };
  });
};

beforeEach(() => {
  pool.query.mockReset();
  pool.connect.mockReset();
});

describe('Fuseaux horaires de la RDC', () => {
  test('Kinshasa est a UTC+1 et Lubumbashi a UTC+2', () => {
    const date = new Date('2030-01-07T12:00:00Z');
    expect(offsetMinutes(date, 'Africa/Kinshasa')).toBe(60);
    expect(offsetMinutes(date, 'Africa/Lubumbashi')).toBe(120);
  });

  test('8h00 locale correspond a une heure UTC differente selon la ville', () => {
    expect(localToUtc(2030, 1, 7, 8 * 60, 'Africa/Kinshasa').toISOString()).toBe('2030-01-07T07:00:00.000Z');
    expect(localToUtc(2030, 1, 7, 8 * 60, 'Africa/Lubumbashi').toISOString()).toBe('2030-01-07T06:00:00.000Z');
  });

  test('la date locale tient compte du fuseau autour de minuit', () => {
    const instant = new Date('2030-01-07T22:30:00Z');
    expect(localDateString(instant, 'Africa/Kinshasa')).toBe('2030-01-07');
    expect(localDateString(instant, 'Africa/Lubumbashi')).toBe('2030-01-08');
  });
});

describe('Resolution de l etablissement d un medecin', () => {
  test('deduit l etablissement quand le medecin n en a qu un', async () => {
    route([['FROM doctor_affiliations a', { rows: [facilityRow(1, 'Africa/Lubumbashi')], rowCount: 1 }]]);
    await expect(resolveFacility(2)).resolves.toMatchObject({ id: 1 });
  });

  test('exige l etablissement quand le medecin en a plusieurs', async () => {
    route([['FROM doctor_affiliations a', {
      rows: [facilityRow(1, 'Africa/Lubumbashi'), facilityRow(2, 'Africa/Kinshasa')],
      rowCount: 2,
    }]]);
    await expect(resolveFacility(2)).rejects.toMatchObject({ status: 400 });
  });

  test('refuse un etablissement ou le medecin ne consulte pas', async () => {
    route([['FROM doctor_affiliations a', { rows: [], rowCount: 0 }]]);
    await expect(resolveFacility(2, 9)).rejects.toMatchObject({ status: 404 });
  });

  test('ignore les etablissements et rattachements inactifs', async () => {
    route([['FROM doctor_affiliations a', { rows: [], rowCount: 0 }]]);
    await resolveFacility(2);
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain("a.status = 'active'");
    expect(sql).toContain("f.status = 'active'");
  });
});

describe('Creneaux par etablissement', () => {
  const setup = (timezone) => route([
    ['SELECT consultation_minutes FROM doctors', { rows: [{ consultation_minutes: 30 }], rowCount: 1 }],
    ['FROM doctor_affiliations a', { rows: [facilityRow(4, timezone)], rowCount: 1 }],
    ['FROM working_hours', { rows: [{ start_time: '08:00', end_time: '09:00' }], rowCount: 1 }],
  ]);

  test('calcule les creneaux dans le fuseau de l etablissement (Kinshasa)', async () => {
    setup('Africa/Kinshasa');
    const slots = await getAvailableSlots(2, '2030-01-07');
    expect(slots.map((s) => s.startsAt)).toEqual(['2030-01-07T07:00:00.000Z', '2030-01-07T07:30:00.000Z']);
    expect(slots[0]).toMatchObject({ facilityId: 4, timezone: 'Africa/Kinshasa' });
  });

  test('calcule les creneaux dans le fuseau de l etablissement (Lubumbashi)', async () => {
    setup('Africa/Lubumbashi');
    const slots = await getAvailableSlots(2, '2030-01-07');
    expect(slots[0].startsAt).toBe('2030-01-07T06:00:00.000Z');
  });

  test('ne lit que les horaires de l etablissement choisi', async () => {
    setup('Africa/Lubumbashi');
    await getAvailableSlots(2, '2030-01-07', pool, null, 4);
    const [sql, params] = pool.query.mock.calls.find(([q]) => q.includes('FROM working_hours'));
    expect(sql).toContain('facility_id=$2');
    expect(params).toEqual([2, 4, 1]);
  });

  test('sans etablissement precise, regroupe les creneaux de tous les etablissements du medecin', async () => {
    route([
      ['SELECT consultation_minutes FROM doctors', { rows: [{ consultation_minutes: 60 }], rowCount: 1 }],
      ['FROM doctor_affiliations a', {
        rows: [facilityRow(1, 'Africa/Lubumbashi', 'A'), facilityRow(2, 'Africa/Kinshasa', 'B')],
        rowCount: 2,
      }],
      ['FROM working_hours', { rows: [{ start_time: '08:00', end_time: '09:00' }], rowCount: 1 }],
    ]);

    const slots = await getAvailableSlots(2, '2030-01-07');

    expect(slots.map((s) => [s.facilityId, s.startsAt])).toEqual([
      [1, '2030-01-07T06:00:00.000Z'],
      [2, '2030-01-07T07:00:00.000Z'],
    ]);
    expect(slots[1].facilityName).toBe('B');
  });

  test('les rendez-vous d un autre etablissement bloquent aussi le creneau', async () => {
    setup('Africa/Lubumbashi');
    await getAvailableSlots(2, '2030-01-07');
    const [sql] = pool.query.mock.calls.find(([q]) => q.includes('FROM appointments'));
    expect(sql).not.toContain('facility_id');
  });
});

describe('Horaires dans plusieurs etablissements', () => {
  const client = { query: jest.fn(), release: jest.fn() };
  const hours = [{ weekday: 1, startTime: '09:00', endTime: '12:00' }];

  beforeEach(() => {
    client.query.mockReset();
    client.release.mockReset();
    pool.connect.mockResolvedValue(client);
    route([
      ['FROM doctors WHERE id', { rows: [{ id: 2, consultation_minutes: 30 }], rowCount: 1 }],
      ['FROM doctor_affiliations a', { rows: [facilityRow(1, 'Africa/Lubumbashi', 'Clinique A')], rowCount: 1 }],
    ]);
  });

  test('refuse un chevauchement avec les horaires d un autre etablissement', async () => {
    client.query.mockImplementation(async (sql) =>
      sql.includes('w.facility_id <> $2')
        ? { rows: [{ weekday: 1, startTime: '11:00', endTime: '14:00', name: 'Hopital B' }] }
        : { rows: [] }
    );

    await expect(admin.setWorkingHours(2, { hours, consultationMinutes: 30 }))
      .rejects.toMatchObject({ status: 409, message: expect.stringContaining('Hopital B') });
    const sqls = client.query.mock.calls.map(([q]) => q);
    expect(sqls).toContain('ROLLBACK');
    expect(sqls.some((q) => q.startsWith('DELETE FROM working_hours'))).toBe(false);
  });

  test('ne remplace que les horaires de l etablissement concerne', async () => {
    client.query.mockResolvedValue({ rows: [] });

    await admin.setWorkingHours(2, { hours, consultationMinutes: 30 });

    const del = client.query.mock.calls.find(([q]) => q.startsWith('DELETE FROM working_hours'));
    expect(del).toEqual(['DELETE FROM working_hours WHERE doctor_id=$1 AND facility_id=$2', [2, 1]]);
  });

  test('refuse deux plages qui se chevauchent dans la meme demande', async () => {
    await expect(admin.setWorkingHours(2, {
      hours: [
        { weekday: 1, startTime: '08:00', endTime: '12:00' },
        { weekday: 1, startTime: '11:00', endTime: '13:00' },
      ],
      consultationMinutes: 30,
    })).rejects.toMatchObject({ status: 400 });
    expect(pool.connect).not.toHaveBeenCalled();
  });
});

describe('Migration 009_facilities', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '009_facilities.sql'), 'utf8');

  test('n autorise que les deux fuseaux de la RDC', () => {
    expect(sql).toContain("CHECK (timezone IN ('Africa/Kinshasa', 'Africa/Lubumbashi'))");
  });

  test('un seul etablissement par defaut', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX[^;]*facilities_single_default[^;]*WHERE is_default/);
  });

  test('un horaire doit correspondre a un rattachement du medecin', () => {
    expect(sql).toMatch(/FOREIGN KEY \(doctor_id, facility_id\)\s+REFERENCES doctor_affiliations \(doctor_id, facility_id\)/);
  });

  test('ne supprime aucune donnee', () => {
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b|\bDELETE\s+FROM\b|\bTRUNCATE\b/i);
  });
});
