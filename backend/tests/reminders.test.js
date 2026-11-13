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
  id: 1, patient_id: 7, starts_at: '2026-11-11T09:30:00Z', starts_at_exact: '2026-11-11 09:30:00.000000', doctor_last_name: 'Kabila',
  facility_name: 'Clinique A', timezone: 'Africa/Lubumbashi', profile_first_name: 'Marie',
  relationship: 'self', phone_e164: '+243810000001', phone_verified_at: '2026-01-01', sms_enabled: true, ...over,
});

const setup = ({ due24 = [], due2 = [], claimed = true } = {}) => {
  pool.query.mockReset();
  pool.query.mockImplementation(async (sql, params) => {
    if (sql.includes('SELECT EXISTS (') && sql.includes('FROM appointments')) return { rows: [{ valid: true }], rowCount: 1 };
    if (sql.includes('INSERT INTO appointment_reminders')) return { rows: claimed ? [{ starts_at_exact: params[2] }] : [], rowCount: claimed ? 1 : 0 };
    if (sql.includes('FROM appointments a')) {
      const rows = params[4] === '24h' ? due24 : due2;
      return { rows, rowCount: rows.length };
    }
    if (sql.includes('INSERT INTO notifications')) return { rows: [{ id: 99 }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  phoneOtp.notify.mockReset();
  phoneOtp.notify.mockResolvedValue('sent');
};

const calls = (part) => pool.query.mock.calls.filter(([sql]) => sql.includes(part));

describe('Rappels de rendez-vous', () => {
  test('la selection ne vise que les RDV actifs, dans la fenetre, sans rappel deja cree pour cette heure', async () => {
    setup();
    await reminders.runOnce(NOW);
    const [sql24, p24] = calls('FROM appointments a')[0];
    expect(sql24).toContain("a.status IN ('pending', 'confirmed')");
    expect(sql24).toContain("date_trunc('milliseconds', r.starts_at) = date_trunc('milliseconds', a.starts_at)");
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
    expect(calls('SET sms_status')[0][1][2]).toBe('sent');
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
    phoneOtp.notify.mockResolvedValueOnce('failed').mockResolvedValueOnce('sent');
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
  test('un SMS incertain conserve le statut unknown', async () => {
    setup({ due24: [row()] });
    phoneOtp.notify.mockResolvedValueOnce('unknown');
    const summary = await reminders.runOnce(NOW);
    expect(summary).toEqual({ created: 1, sms: 0, failed: 0 });
    expect(calls('SET sms_status')[0][1][2]).toBe('unknown');
  });
});
  test('la reservation revalide le statut et la date du rendez-vous', async () => {
    setup({ due24: [row()] });

    await reminders.runOnce(NOW);

    const claims = calls('INSERT INTO appointment_reminders');
    expect(claims).toHaveLength(1);

    const [sql, params] = claims[0];

    expect(sql).toContain("status IN ('pending', 'confirmed')");
    expect(sql).toContain("starts_at = ($3::timestamp AT TIME ZONE 'UTC')");
    expect(sql).toContain('FOR UPDATE');
    expect(params).toEqual([1, '24h', row().starts_at_exact]);
  });
test('aucun SMS si le rendez-vous est annule apres la creation du rappel', async () => {
  setup({ due24: [row()] });

  const base = pool.query.getMockImplementation();
  pool.query.mockImplementation(async (sql, params) => {
    if (sql.trimStart().startsWith('SELECT') && sql.includes('FROM appointments') &&
        sql.includes('starts_at') && !sql.includes('FROM appointments a')) {
      return { rows: [], rowCount: 0 };
    }
    return base(sql, params);
  });

  await reminders.runOnce(NOW);

  const checks = calls('FROM appointments').filter(([sql]) =>
    sql.trimStart().startsWith('SELECT') && sql.includes('status') && sql.includes('starts_at') &&
    !sql.includes('FROM appointments a')
  );

  expect(checks).toHaveLength(1);
  expect(phoneOtp.notify).not.toHaveBeenCalled();
});

test('conserve les microsecondes PostgreSQL pendant la reservation et le SMS', async () => {
  const exact = '2026-11-14 10:48:57.560130';
  setup({
    due24: [row({
      starts_at: new Date('2026-11-14T10:48:57.560Z'),
      starts_at_exact: exact,
    })],
  });

  const summary = await reminders.runOnce(NOW);

  expect(summary).toEqual({ created: 1, sms: 1, failed: 0 });

  const claim = calls('INSERT INTO appointment_reminders')[0];
  expect(claim[1][2]).toBe(exact);
  expect(claim[0]).toContain("AT TIME ZONE 'UTC'");

  const notificationUpdate = calls('SET notification_id')[0];
  expect(notificationUpdate[1][3]).toBe(exact);

  const validity = calls('SELECT EXISTS (')[0];
  expect(validity[1]).toEqual([1, exact]);
  expect(validity[0]).toContain("AT TIME ZONE 'UTC'");

  const smsUpdate = calls('SET sms_status')[0];
  expect(smsUpdate[1][3]).toBe(exact);

  expect(phoneOtp.notify).toHaveBeenCalledTimes(1);
});
