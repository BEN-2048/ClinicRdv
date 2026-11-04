
import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { AuthApi } from '../api/services';

export type Role = 'patient' | 'doctor' | 'admin';

export type User = {
  id: number;
  email: string;
  role: Role;
  first_name: string;
  last_name: string;
};

type Ctx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<Ctx>(null as unknown as Ctx);

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restaurer la session au démarrage
  // Restaurer la session au démarrage
useEffect(() => {
  const restoreSession = async () => {
    try {
      const savedUser = await SecureStore.getItemAsync('user');
      const savedToken = await SecureStore.getItemAsync('token');

      if (savedUser && savedToken) {
        setUser(JSON.parse(savedUser) as User);
      } else {
        await SecureStore.deleteItemAsync('token');
        await SecureStore.deleteItemAsync('user');
      }
    } catch (error) {
      console.error('Erreur de restauration de session :', error);
      await SecureStore.deleteItemAsync('token');
      await SecureStore.deleteItemAsync('user');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  restoreSession();
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

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

