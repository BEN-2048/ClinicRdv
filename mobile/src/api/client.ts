
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

export const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  timeout: 10000,
});


console.log('API URL =', api.defaults.baseURL);

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
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
