process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/config/db', () => ({ query: jest.fn() }));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const pool = require('../src/config/db');
const app = require('../src/app');

const token = (role, id = 3) => `Bearer ${jwt.sign({ id, role }, 'test-secret')}`;

const validAlert = {
  timeSlots: ['all_day'],
  weekdays: [1, 2, 3, 4],
  minNotice: '24h',
  notifyPush: true,
  notifySms: false,
};

beforeEach(() => {
  pool.query.mockReset();
});

describe('liste d\'attente', () => {
  test.each(['doctor', 'secretary', 'admin'])('refuse le rôle %s', async (role) => {
    const res = await request(app).get('/api/waiting-list/mine').set('Authorization', token(role));
    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('exige une authentification', async () => {
    const res = await request(app).get('/api/waiting-list/doctors/1');
    expect(res.status).toBe(401);
  });

  test('rejette un identifiant de médecin invalide', async () => {
    const res = await request(app).get('/api/waiting-list/doctors/abc').set('Authorization', token('patient'));
    expect(res.status).toBe(400);
  });

  test('rejette des préférences sans canal de notification', async () => {
    const res = await request(app)
      .put('/api/waiting-list/doctors/1')
      .set('Authorization', token('patient'))
      .send({ ...validAlert, notifyPush: false });
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('rejette une plage horaire inconnue', async () => {
    const res = await request(app)
      .put('/api/waiting-list/doctors/1')
      .set('Authorization', token('patient'))
      .send({ ...validAlert, timeSlots: ['night'] });
    expect(res.status).toBe(400);
  });

  test('enregistre l\'alerte du patient connecté', async () => {
    pool.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1 }] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 9, doctor_id: 1, time_slots: ['all_day'], weekdays: [1, 2, 3, 4], min_notice: '24h',
          notify_push: true, notify_sms: false, active: true, created_at: 'x', updated_at: 'x',
        }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ total: 3, rank: 3 }] });

    const res = await request(app)
      .put('/api/waiting-list/doctors/1')
      .set('Authorization', token('patient', 3))
      .send(validAlert);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ position: 3, total: 3, alert: { doctorId: 1, minNotice: '24h' } });
    expect(pool.query.mock.calls[1][1].slice(0, 2)).toEqual([3, 1]);
  });

  test('renvoie 404 si aucune alerte à désactiver', async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const res = await request(app).delete('/api/waiting-list/doctors/1').set('Authorization', token('patient'));
    expect(res.status).toBe(404);
  });
});
