process.env.OTP_SECRET = 'test-otp-secret';

const crypto = require('crypto');
const { generateCode, hashCode } = require('../src/controllers/otp.controller');

describe('OTP - Generation et securite', () => {
  test('genere un code compose exactement de 6 chiffres', () => {
    const code = generateCode();

    expect(code).toMatch(/^\d{6}$/);
  });

  test('genere des codes aleatoires', () => {
    const codes = new Set(
      Array.from({ length: 100 }, () => generateCode())
    );

    expect(codes.size).toBeGreaterThan(1);
  });

  test('produit un hash HMAC SHA-256 de 64 caracteres hexadecimaux', () => {
    const hash = hashCode('123456');

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  test('produit toujours le meme hash pour le meme code et secret', () => {
    expect(hashCode('123456')).toBe(hashCode('123456'));
  });

  test('produit des hashes differents pour deux codes differents', () => {
    expect(hashCode('123456')).not.toBe(hashCode('654321'));
  });

  test('correspond au calcul HMAC SHA-256 attendu', () => {
    const expected = crypto
      .createHmac('sha256', 'test-otp-secret')
      .update('123456')
      .digest('hex');

    expect(hashCode('123456')).toBe(expected);
  });
});

jest.mock('../src/config/db', () => {
  const clientQuery = jest.fn();
  const client = { query: clientQuery, release: jest.fn() };

  return {
    query: jest.fn(),
    connect: jest.fn(async () => client),
    __clientQuery: clientQuery,
    __client: client,
  };
});

jest.mock('@getbrevo/brevo', () => ({
  BrevoClient: jest.fn().mockImplementation(() => ({
    transactionalEmails: {
      sendTransacEmail: jest.fn().mockResolvedValue({
        data: { messageId: 'test-message-id' },
      }),
    },
  })),
}));

const pool = require('../src/config/db');
const otp = require('../src/controllers/otp.controller');

describe('OTP - Verification du code', () => {
  const validCode = '123456';

  const user = {
    user_id: 1,
    email: 'patient@example.com',
    role: 'patient',
    first_name: 'Jean',
    last_name: 'Test',
    is_verified: false,
    code_hash: otp.hashCode(validCode),
    attempts: 0,
    expires_at: new Date(Date.now() + 600000),
    consumed_at: null,
  };

  beforeEach(() => {
    pool.__clientQuery.mockReset();
    pool.__client.release.mockClear();

    pool.__clientQuery.mockResolvedValue({ rows: [], rowCount: 1 });
  });

  test('accepte un code correct et verifie le compte', async () => {
    pool.__clientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [user], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 1 });

    const result = await otp.verifyCode(user.email, validCode);

    expect(result.ok).toBe(true);
    expect(result.user.email).toBe(user.email);

    expect(pool.__clientQuery).toHaveBeenCalledWith(
      'UPDATE users SET is_verified = TRUE WHERE id = $1',
      [1]
    );

    expect(pool.__clientQuery).toHaveBeenCalledWith(
      'UPDATE email_verifications SET consumed_at = NOW() WHERE user_id = $1',
      [1]
    );

    expect(pool.__client.release).toHaveBeenCalled();
  });

  test('rejette un code incorrect et incremente les tentatives', async () => {
    pool.__clientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ ...user }], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 1 });

    const result = await otp.verifyCode(user.email, '654321');

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Code incorrect.');

    expect(pool.__clientQuery).toHaveBeenCalledWith(
      'UPDATE email_verifications SET attempts = attempts + 1 WHERE user_id = $1',
      [1]
    );
  });

  test('rejette un code expire', async () => {
    pool.__clientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [{
          ...user,
          expires_at: new Date(Date.now() - 1000),
        }],
        rowCount: 1,
      });

    const result = await otp.verifyCode(user.email, validCode);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Le code a expire.');
  });

  test('rejette un code deja utilise', async () => {
    pool.__clientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [{ ...user, consumed_at: new Date() }],
        rowCount: 1,
      });

    const result = await otp.verifyCode(user.email, validCode);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Ce code a deja ete utilise.');
  });

  test('bloque apres cinq tentatives', async () => {
    pool.__clientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [{ ...user, attempts: 5 }],
        rowCount: 1,
      });

    const result = await otp.verifyCode(user.email, validCode);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Nombre maximal de tentatives atteint.');
  });
});

const { BrevoClient } = require('@getbrevo/brevo');

describe('OTP - Renvoi du code', () => {
  const email = 'patient@example.com';

  const unverifiedUser = {
    user_id: 1,
    email,
    is_verified: false,
    last_sent_at: new Date(),
  };

  beforeEach(() => {
    pool.__clientQuery.mockReset();
    pool.__client.release.mockClear();
  });

  test('refuse le renvoi avant la fin du delai', async () => {
    pool.__clientQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [unverifiedUser], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ seconds: 30 }], rowCount: 1 });

    const result = await otp.resendCode(email);

    expect(result.ok).toBe(false);
    expect(result.waitSeconds).toBe(30);
    expect(pool.__clientQuery).toHaveBeenLastCalledWith('ROLLBACK');
    expect(pool.__client.release).toHaveBeenCalled();
  });

  test('refuse le renvoi pour un compte deja verifie', async () => {
    pool.__clientQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [{ ...unverifiedUser, is_verified: true }],
        rowCount: 1,
      });

    const result = await otp.resendCode(email);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Ce compte est deja verifie.');
    expect(pool.__clientQuery).toHaveBeenLastCalledWith('ROLLBACK');
  });

  test('refuse une demande de verification inexistante', async () => {
    pool.__clientQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await otp.resendCode(email);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Demande de verification introuvable.');
    expect(pool.__clientQuery).toHaveBeenLastCalledWith('ROLLBACK');
  });

  test('autorise le renvoi apres le delai et valide la transaction', async () => {
    pool.__clientQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [unverifiedUser], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ seconds: 0 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await otp.resendCode(email);

    expect(result.ok).toBe(true);
    expect(result.expiresIn).toBe(600);

    const update = pool.__clientQuery.mock.calls.find(
      ([sql]) => sql.includes('UPDATE email_verifications')
    );

    expect(update).toBeDefined();
    expect(update[1][0]).toMatch(/^[a-f0-9]{64}$/);
    expect(update[1][1]).toBe(10);
    expect(update[1][2]).toBe(1);

    const instance = BrevoClient.mock.results[
      BrevoClient.mock.results.length - 1
    ].value;

    expect(instance.transactionalEmails.sendTransacEmail)
      .toHaveBeenCalledTimes(1);

    expect(pool.__clientQuery).toHaveBeenLastCalledWith('COMMIT');
  });

  test('annule la transaction si Brevo refuse le renvoi', async () => {
    BrevoClient.mockImplementationOnce(() => ({
      transactionalEmails: {
        sendTransacEmail: jest.fn().mockRejectedValue(
          new Error('Erreur Brevo simulee')
        ),
      },
    }));

    pool.__clientQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [unverifiedUser], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ seconds: 0 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(otp.resendCode(email))
      .rejects.toThrow('Erreur Brevo simulee');

    expect(pool.__clientQuery).toHaveBeenLastCalledWith('ROLLBACK');
    expect(pool.__client.release).toHaveBeenCalled();
  });
});
