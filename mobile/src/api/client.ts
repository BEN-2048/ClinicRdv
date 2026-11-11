
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { DEVICE_NAME, notifySessionRejected, refreshSession } from '../services/session';

export const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  timeout: 10000,
  headers: { 'X-Device-Name': DEVICE_NAME },
});


console.log('API URL =', api.defaults.baseURL);

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

type RetriableConfig = InternalAxiosRequestConfig & { _sessionRetried?: boolean };

const PUBLIC_AUTH_ROUTES = [
  '/auth/login',
  '/auth/register',
  '/auth/verify-email',
  '/auth/resend-otp',
  '/auth/verify-phone',
  '/auth/resend-phone-otp',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/emergency/directory',
  '/auth/refresh',
  '/auth/upgrade-session',
  '/auth/logout',
];

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as RetriableConfig | undefined;
  const url = config?.url ?? '';

  if (error.response?.status !== 401 || !config || config._sessionRetried || PUBLIC_AUTH_ROUTES.includes(url)) {
    throw error;
  }

  const result = await refreshSession();
  if (result === 'ok') {
    config._sessionRetried = true;
    return api(config);
  }
  if (result === 'rejected') notifySessionRejected();
  throw error;
});

export const errorMessage = (e: any): string => {
  if (e?.response?.data?.error) return e.response.data.error;
  if (e?.response) return 'Le serveur a rencontré une erreur. Réessayez dans un instant.';
  if (e?.code === 'ECONNABORTED') {
    return 'Le serveur met trop de temps à répondre. L’opération n’a peut-être pas été enregistrée : vérifiez avant de recommencer.';
  }
  if (e?.request || e?.message === 'Network Error') {
    return 'Pas de connexion Internet : rien n’a été enregistré. Réessayez une fois connecté.';
  }
  return 'Une erreur inattendue est survenue.';
};
