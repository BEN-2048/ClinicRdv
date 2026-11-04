import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { AuthApi } from '../api/services';

export type Role = 'patient' | 'doctor' | 'admin' | 'secretary';
type User = { id: number; email: string; role: Role; first_name: string; last_name: string };
type Ctx = { user: User | null; loading: boolean; login: (e: string, p: string) => Promise<void>; logout: () => Promise<void> };

const AuthContext = createContext<Ctx>(null as unknown as Ctx);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([SecureStore.deleteItemAsync('token'), SecureStore.deleteItemAsync('user')]).finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const { data } = await AuthApi.login(email, password);
    await SecureStore.setItemAsync('token', data.token);
    await SecureStore.setItemAsync('user', JSON.stringify(data.user));
    setUser(data.user);
  };
  const logout = async () => {
    await SecureStore.deleteItemAsync('token');
    await SecureStore.deleteItemAsync('user');
    setUser(null);
  };
  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

