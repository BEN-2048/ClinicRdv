const mockStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    mockStore.set(k, v);
  }),
  deleteItemAsync: jest.fn(async (k: string) => {
    mockStore.delete(k);
  }),
}));

const mockPost = jest.fn();

jest.mock('axios', () => {
  const actual = jest.requireActual('axios');
  return {
    ...actual,
    __esModule: true,
    default: { ...actual.default, create: jest.fn(() => ({ post: (...args: unknown[]) => mockPost(...args) })) },
    create: jest.fn(() => ({ post: (...args: unknown[]) => mockPost(...args) })),
  };
});

import {
  classifyRefreshError,
  clearStoredSession,
  currentSessionKey,
  refreshSession,
  tokenExpiresInMs,
} from './session';

const jwtWithExp = (secondsFromNow: number) => {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + secondsFromNow })).toString('base64url');
  return `x.${payload}.y`;
};

const pair = (n: number) => ({
  token: jwtWithExp(900),
  refreshToken: `00000000-0000-4000-8000-00000000000${n}.${'a'.repeat(43)}`,
  sessionId: `00000000-0000-4000-8000-00000000000${n}`,
});

beforeEach(() => {
  mockStore.clear();
  mockPost.mockReset();
});

describe('refreshSession', () => {
  test('un seul renouvellement pour plusieurs demandes simultanees', async () => {
    mockStore.set('token', jwtWithExp(-10));
    mockStore.set('refreshToken', pair(1).refreshToken);
    let release: (v: unknown) => void = () => {};
    mockPost.mockImplementation(() => new Promise((resolve) => { release = resolve; }));

    const calls = [refreshSession(), refreshSession(), refreshSession()];
    while (!mockPost.mock.calls.length) await new Promise((r) => setTimeout(r, 0));
    release({ data: pair(2) });

    expect(await Promise.all(calls)).toEqual(['ok', 'ok', 'ok']);
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith('/auth/refresh', { refreshToken: pair(1).refreshToken });
    expect(mockStore.get('refreshToken')).toBe(pair(2).refreshToken);
    expect(mockStore.get('sessionId')).toBe(pair(2).sessionId);
  });

  test('une session refusee par le serveur donne rejected', async () => {
    mockStore.set('refreshToken', pair(1).refreshToken);
    mockPost.mockRejectedValue({ response: { status: 401 } });
    expect(await refreshSession()).toBe('rejected');
  });

  test('sans reseau, on reste connecte (network) et rien n est efface', async () => {
    mockStore.set('token', 'ancien');
    mockStore.set('refreshToken', pair(1).refreshToken);
    mockPost.mockRejectedValue({ message: 'Network Error', request: {} });
    expect(await refreshSession()).toBe('network');
    expect(mockStore.get('refreshToken')).toBe(pair(1).refreshToken);
    expect(mockStore.get('token')).toBe('ancien');
  });

  test('une erreur serveur temporaire ne deconnecte pas', async () => {
    mockStore.set('refreshToken', pair(1).refreshToken);
    mockPost.mockRejectedValue({ response: { status: 503 } });
    expect(await refreshSession()).toBe('network');
  });

  test('une ancienne session de 7 jours est convertie', async () => {
    mockStore.set('token', 'ancien-jeton');
    mockPost.mockResolvedValue({ data: pair(3) });
    expect(await refreshSession()).toBe('ok');
    expect(mockPost).toHaveBeenCalledWith('/auth/upgrade-session', { token: 'ancien-jeton' });
    expect(await currentSessionKey()).toBe(`sid:${pair(3).sessionId}`);
  });

  test('une deconnexion pendant le renouvellement n est pas annulee par la reponse', async () => {
    mockStore.set('refreshToken', pair(1).refreshToken);
    mockPost.mockImplementation(async () => {
      await clearStoredSession();
      return { data: pair(2) };
    });
    expect(await refreshSession()).toBe('rejected');
    expect(mockStore.size).toBe(0);
  });

  test('sans aucune session stockee, rien n est envoye', async () => {
    expect(await refreshSession()).toBe('rejected');
    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe('Outils de session', () => {
  test('la cle de session reste stable quand le jeton d acces change', async () => {
    mockStore.set('sessionId', 'abc');
    mockStore.set('token', 't1');
    const before = await currentSessionKey();
    mockStore.set('token', 't2');
    expect(await currentSessionKey()).toBe(before);
  });

  test.each([
    [{ response: { status: 400 } }, 'rejected'],
    [{ response: { status: 403 } }, 'rejected'],
    [{ response: { status: 429 } }, 'network'],
    [{ code: 'ECONNABORTED' }, 'network'],
  ])('classe %j en %s', (error, expected) => {
    expect(classifyRefreshError(error)).toBe(expected);
  });

  test('calcule le temps restant avant expiration', () => {
    expect(tokenExpiresInMs(jwtWithExp(600))).toBeGreaterThan(590 * 1000);
    expect(tokenExpiresInMs('pas-un-jwt')).toBe(-1);
    expect(tokenExpiresInMs(null)).toBe(-1);
  });
});
