import { api, errorMessage } from './client';

const mockStore = new Map<string, string>();
const mockRefresh = jest.fn();
const mockRejected = jest.fn();

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    mockStore.set(k, v);
  }),
  deleteItemAsync: jest.fn(async (k: string) => {
    mockStore.delete(k);
  }),
}));

jest.mock('../services/session', () => ({
  DEVICE_NAME: 'iPhone',
  refreshSession: (...args: unknown[]) => mockRefresh(...args),
  notifySessionRejected: (...args: unknown[]) => mockRejected(...args),
}));

type Reply = { status: number; data?: unknown };
let replies: Reply[];
let seen: { url?: string; auth?: string }[];

beforeEach(() => {
  mockStore.clear();
  mockRefresh.mockReset();
  mockRejected.mockReset();
  seen = [];
  api.defaults.adapter = async (config: any) => {
    seen.push({ url: config.url, auth: config.headers?.Authorization });
    const reply = replies.shift() ?? { status: 500 };
    const response = { data: reply.data ?? {}, status: reply.status, statusText: '', headers: {}, config };
    if (reply.status >= 400) {
      throw Object.assign(new Error(`HTTP ${reply.status}`), { config, response, isAxiosError: true });
    }
    return response;
  };
});

describe('Renouvellement automatique', () => {
  test('une 401 declenche un renouvellement puis rejoue la requete avec le nouveau jeton', async () => {
    mockStore.set('token', 'ancien');
    replies = [{ status: 401 }, { status: 200, data: { ok: true } }];
    mockRefresh.mockImplementation(async () => {
      mockStore.set('token', 'nouveau');
      return 'ok';
    });

    const res = await api.get('/users/me');

    expect(res.data).toEqual({ ok: true });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(seen.map((s) => s.auth)).toEqual(['Bearer ancien', 'Bearer nouveau']);
  });

  test('une session refusee previent l application et ne rejoue pas', async () => {
    replies = [{ status: 401 }];
    mockRefresh.mockResolvedValue('rejected');
    await expect(api.get('/users/me')).rejects.toMatchObject({ response: { status: 401 } });
    expect(mockRejected).toHaveBeenCalledTimes(1);
    expect(seen).toHaveLength(1);
  });

  test('sans reseau pendant le renouvellement, on ne deconnecte pas', async () => {
    replies = [{ status: 401 }];
    mockRefresh.mockResolvedValue('network');
    await expect(api.get('/users/me')).rejects.toBeTruthy();
    expect(mockRejected).not.toHaveBeenCalled();
  });

  test('pas de boucle infinie si la requete rejouee renvoie encore 401', async () => {
    replies = [{ status: 401 }, { status: 401 }];
    mockRefresh.mockResolvedValue('ok');
    await expect(api.get('/users/me')).rejects.toBeTruthy();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(seen).toHaveLength(2);
  });

  test.each(['/auth/login', '/auth/refresh', '/auth/logout'])('pas de renouvellement sur %s', async (url) => {
    replies = [{ status: 401 }];
    await expect(api.post(url, {})).rejects.toBeTruthy();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  test('les routes authentifiees de /auth se renouvellent aussi', async () => {
    replies = [{ status: 401 }, { status: 200 }];
    mockRefresh.mockResolvedValue('ok');
    await api.post('/auth/logout-all');
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  test('chaque requete annonce le nom de l appareil', async () => {
    replies = [{ status: 200 }];
    await api.get('/health');
    expect(api.defaults.headers['X-Device-Name']).toBe('iPhone');
  });
});

describe('Messages d erreur', () => {
  test('sans reseau, le message dit clairement que rien n a ete enregistre', () => {
    expect(errorMessage({ request: {}, message: 'Network Error' })).toMatch(/rien n’a été enregistré/);
  });

  test('le message du serveur est repris tel quel', () => {
    expect(errorMessage({ response: { data: { error: 'Créneau indisponible' } } })).toBe('Créneau indisponible');
  });
});
