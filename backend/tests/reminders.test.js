jest.mock('../src/config/db', () => {
  const query = jest.fn();
  const client = { query, release: jest.fn() };
  return { query, connect: jest.fn(async () => client) };
});

jest.mock('../src/services/phoneOtp.service', () => ({ notify: jest.fn() }));

const pool = require('../src/config/db');
const phoneOtp = require('../src/services/phoneOtp.service');
const reminders = require('../src/services/reminders.service');

const NOW = new Date('2026-11-10T08:00:00Z');

const row = (over) => ({
  id: 1, patient_id: 7, starts_at: '2026-11-11T09:30:00Z', doctor_last_name: 'Kabila',
  facility_name: 'Clinique A', timezone: 'Africa/Lubumbashi', profile_first_name: 'Marie',
  relationship: 'self', phone_e164: '+243810000001', phone_verified_at: '2026-01-01', sms_enabled: true, ...over,
});

const setup = ({ due24 = [], due2 = [], claimed = true } = {}) => {
  pool.query.mockReset();
  pool.query.mockImplementation(async (sql, params) => {
    if (sql.includes('FROM appointments a')) {
      const rows = params[4] === '24h' ? due24 : due2;
      return { rows, rowCount: rows.length };
    }
    if (sql.includes('INSERT INTO appointment_reminders')) return { rows: claimed ? [{}] : [], rowCount: claimed ? 1 : 0 };
    if (sql.includes('INSERT INTO notifications')) return { rows: [{ id: 99 }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  phoneOtp.notify.mockReset();
  phoneOtp.notify.mockResolvedValue(true);
};

const calls = (part) => pool.query.mock.calls.filter(([sql]) => sql.includes(part));

describe('Rappels de rendez-vous', () => {
  test('la selection ne vise que les RDV actifs, dans la fenetre, sans rappel deja cree pour cette heure', async () => {
    setup();
    await reminders.runOnce(NOW);
    const [sql24, p24] = calls('FROM appointments a')[0];
    expect(sql24).toContain("a.status IN ('pending', 'confirmed')");
    expect(sql24).toContain('r.starts_at = a.starts_at');
    expect(p24).toEqual([NOW.toISOString(), 120, 1440, 60, '24h']);
    expect(calls('FROM appointments a')[1][1]).toEqual([NOW.toISOString(), 0, 120, 30, '2h']);
  });

  test('rappel de la veille : notification in-app et SMS au numero verifie', async () => {
    setup({ due24: [row()] });
    const summary = await reminders.runOnce(NOW);
    expect(summary).toEqual({ created: 1, sms: 1, failed: 0 });
    const [, params] = calls('INSERT INTO notifications')[0];
    expect(params[0]).toBe(7);
    expect(params[1]).toBe(1);
    expect(params[2]).toBe('Rappel de rendez-vous');
    expect(params[3]).toContain('Dr Kabila');
    expect(params[3]).toContain('11:30');
    expect(params[3]).toContain('mercredi 11 novembre');
    expect(phoneOtp.notify).toHaveBeenCalledWith('+243810000001', expect.stringContaining('ClinicRDV : rappel'));
    expect(calls('SET sms_status')[0][1][3]).toBe('sent');
  });

  test('rappel 2 h avant : in-app seulement, sans SMS', async () => {
    setup({ due2: [row({ starts_at: '2026-11-10T09:00:00Z' })] });
    const summary = await reminders.runOnce(NOW);
    expect(summary.created).toBe(1);
    expect(calls('INSERT INTO notifications')[0][1][2]).toBe('Votre rendez-vous approche');
    expect(calls('INSERT INTO notifications')[0][1][3]).toContain('aujourd’hui à 11:00');
    expect(phoneOtp.notify).not.toHaveBeenCalled();
  });

  test('pas de SMS sans numero verifie ou si le patient les a desactives', async () => {
    setup({ due24: [row({ id: 1, phone_verified_at: null }), row({ id: 2, sms_enabled: false })] });
    const summary = await reminders.runOnce(NOW);
    expect(summary).toEqual({ created: 2, sms: 0, failed: 0 });
    expect(phoneOtp.notify).not.toHaveBeenCalled();
  });

  test('un rappel deja reserve par une autre execution n est pas recree', async () => {
    setup({ due24: [row()], claimed: false });
    const summary = await reminders.runOnce(NOW);
    expect(summary.created).toBe(0);
    expect(calls('INSERT INTO notifications')).toHaveLength(0);
    expect(phoneOtp.notify).not.toHaveBeenCalled();
  });

  test('le rappel pour un enfant indique son prenom', async () => {
    setup({ due24: [row({ relationship: 'dependent', profile_first_name: 'Léa' })] });
    await reminders.runOnce(NOW);
    expect(calls('INSERT INTO notifications')[0][1][3]).toMatch(/^Rendez-vous pour Léa avec le Dr Kabila/);
  });

  test('un SMS en echec est compte sans bloquer les autres rappels', async () => {
    setup({ due24: [row({ id: 1 }), row({ id: 2 })] });
    phoneOtp.notify.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const summary = await reminders.runOnce(NOW);
    expect(summary).toEqual({ created: 2, sms: 1, failed: 1 });
  });

  test('une erreur en base annule le rappel concerne et passe au suivant', async () => {
    setup({ due24: [row({ id: 1 }), row({ id: 2 })] });
    const base = pool.query.getMockImplementation();
    let first = true;
    pool.query.mockImplementation(async (sql, params) => {
      if (sql.includes('INSERT INTO notifications') && first) {
        first = false;
        throw new Error('panne');
      }
      return base(sql, params);
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const summary = await reminders.runOnce(NOW);
    expect(summary.created).toBe(1);
    expect(summary.failed).toBe(1);
    expect(calls('ROLLBACK')).toHaveLength(1);
    console.error.mockRestore();
  });
});
