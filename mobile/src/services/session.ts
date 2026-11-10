import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { jwtDecode } from 'jwt-decode';
import { Platform } from 'react-native';

export type RefreshResult = 'ok' | 'rejected' | 'network';

export type SessionTokens = {
  token: string;
  refreshToken?: string | null;
  sessionId?: string | null;
};

const KEYS = { token: 'token', refreshToken: 'refreshToken', sessionId: 'sessionId', user: 'user' } as const;

export const DEVICE_NAME = Platform.OS === 'ios' ? 'iPhone' : Platform.OS === 'android' ? 'Android' : 'Appareil';

const raw = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  timeout: 10000,
  headers: { 'X-Device-Name': DEVICE_NAME },
});

const listeners = new Set<() => void>();

export const onSessionRejected = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const notifySessionRejected = () => {
  for (const listener of listeners) listener();
};

export const saveTokens = async ({ token, refreshToken, sessionId }: SessionTokens) => {
  await SecureStore.setItemAsync(KEYS.token, token);
  if (refreshToken) await SecureStore.setItemAsync(KEYS.refreshToken, refreshToken);
  if (sessionId) await SecureStore.setItemAsync(KEYS.sessionId, sessionId);
};

export const clearStoredSession = async () => {
  for (const key of [KEYS.token, KEYS.refreshToken, KEYS.sessionId, KEYS.user]) {
    await SecureStore.deleteItemAsync(key);
  }
};

export const currentSessionKey = async (): Promise<string | null> => {
  const sessionId = await SecureStore.getItemAsync(KEYS.sessionId);
  if (sessionId) return `sid:${sessionId}`;
  const token = await SecureStore.getItemAsync(KEYS.token);
  return token ? `legacy:${token}` : null;
};

export const tokenExpiresInMs = (token: string | null): number => {
  if (!token) return -1;
  try {
    const { exp } = jwtDecode<{ exp?: number }>(token);
    return exp ? exp * 1000 - Date.now() : -1;
  } catch {
    return -1;
  }
};

export const classifyRefreshError = (error: any): RefreshResult => {
  const status = error?.response?.status;
  if (status === 400 || status === 401 || status === 403) return 'rejected';
  return 'network';
};

let inflight: Promise<RefreshResult> | null = null;

const doRefresh = async (): Promise<RefreshResult> => {
  const [token, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(KEYS.token),
    SecureStore.getItemAsync(KEYS.refreshToken),
  ]);

  if (!token && !refreshToken) return 'rejected';

  try {
    const { data } = refreshToken
      ? await raw.post('/auth/refresh', { refreshToken })
      : await raw.post('/auth/upgrade-session', { token });

    const stillSame = refreshToken
      ? (await SecureStore.getItemAsync(KEYS.refreshToken)) === refreshToken
      : (await SecureStore.getItemAsync(KEYS.token)) === token;
    if (!stillSame) return (await SecureStore.getItemAsync(KEYS.token)) ? 'ok' : 'rejected';

    if (!data?.token || !data?.refreshToken || !data?.sessionId) return 'network';
    await saveTokens(data);
    return 'ok';
  } catch (error) {
    return classifyRefreshError(error);
  }
};

export const refreshSession = (): Promise<RefreshResult> => {
  if (!inflight) {
    inflight = doRefresh().finally(() => {
      inflight = null;
    });
  }
  return inflight;
};

export const revokeCurrentSession = async () => {
  const refreshToken = await SecureStore.getItemAsync(KEYS.refreshToken);
  if (!refreshToken) return;
  try {
    await raw.post('/auth/logout', { refreshToken }, { timeout: 4000 });
  } catch {
    return;
  }
};
