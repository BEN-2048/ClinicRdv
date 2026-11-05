jest.mock('../src/config/db', () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));

jest.mock('../src/services/slots.service', () => ({
  getAvailableSlots: jest.fn(),
}));

const pool = require('../src/config/db');
const { getAvailableSlots } = require('../src/services/slots.service');
const appointments = require('../src/services/appointments.service');

const startsAt = '2030-01-10T08:00:00.000Z';
const endsAt = '2030-01-10T08:30:00.000Z';
const user = { id: 7, role: 'patient' };

let client;

beforeEach(() => {
  jest.clearAllMocks();

  client = {
    query: jest.fn(async (sql) => {
      if (sql.includes('SELECT * FROM appointments')) {
        return {
          rowCount: 1,
          rows: [{ id: 5, patient_id: 7, doctor_id: 2, status: 'confirmed' }],
        };
      }

      if (sql.includes('UPDATE appointments')) {
        return {
          rowCount: 1,
          rows: [{ id: 5, patient_id: 7, starts_at: startsAt, ends_at: endsAt }],
        };
      }

      return { rows: [], rowCount: 0 };
    }),
    release: jest.fn(),
  };

  pool.connect.mockResolvedValue(client);
});

test('report reussi : conserve identifiant et valide transaction', async () => {
  getAvailableSlots.mockResolvedValue([
    { startsAt, endsAt, available: true },
  ]);

  const result = await appointments.reschedule(5, user, startsAt);

  expect(result.id).toBe(5);
  expect(client.query.mock.calls.map(([sql]) => sql)).toContain('COMMIT');
  expect(client.query.mock.calls.map(([sql]) => sql)).not.toContain('ROLLBACK');

  const update = client.query.mock.calls.find(([sql]) =>
    sql.includes('UPDATE appointments')
  );

  expect(update[1]).toEqual([startsAt, endsAt, 5]);
  expect(getAvailableSlots).toHaveBeenCalledWith(
    2, expect.any(String), client, 5
  );
  expect(client.release).toHaveBeenCalledTimes(1);
});

test('creneau indisponible : rollback sans modification', async () => {
  getAvailableSlots.mockResolvedValue([
    { startsAt, endsAt, available: false },
  ]);

  await expect(appointments.reschedule(5, user, startsAt))
    .rejects.toMatchObject({ status: 409 });

  const sql = client.query.mock.calls.map(([query]) => query);

  expect(sql).toContain('ROLLBACK');
  expect(sql).not.toContain('COMMIT');
  expect(sql.some((query) => query.includes('UPDATE appointments'))).toBe(false);
  expect(client.release).toHaveBeenCalledTimes(1);
});

test('conflit PostgreSQL : rollback et erreur 409', async () => {
  getAvailableSlots.mockResolvedValue([
    { startsAt, endsAt, available: true },
  ]);

  client.query.mockImplementation(async (sql) => {
    if (sql.includes('SELECT * FROM appointments')) {
      return {
        rowCount: 1,
        rows: [{ id: 5, patient_id: 7, doctor_id: 2, status: 'confirmed' }],
      };
    }

    if (sql.includes('UPDATE appointments')) {
      const error = new Error('exclusion constraint');
      error.code = '23P01';
      throw error;
    }

    return { rows: [], rowCount: 0 };
  });

  await expect(appointments.reschedule(5, user, startsAt))
    .rejects.toMatchObject({ status: 409 });

  const sql = client.query.mock.calls.map(([query]) => query);

  expect(sql).toContain('ROLLBACK');
  expect(sql).not.toContain('COMMIT');
  expect(client.release).toHaveBeenCalledTimes(1);
});
