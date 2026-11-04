
<<<<<<< HEAD
export type Role = 'patient' | 'doctor' | 'admin';
type User = { id: number; email: string; role: Role; first_name: string; last_name: string };
type RegisterData = { email: string; password: string; firstName: string; lastName: string; phone?: string };
type Ctx = { user: User | null; loading: boolean; login: (e: string, p: string) => Promise<void>; register: (data: RegisterData) => Promise<void>; logout: () => Promise<void> };
=======
import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { AuthApi, UsersApi } from '../api/services';

export type Role = 'patient' | 'doctor' | 'admin' | 'secretary';

export type User = {
  id: number;
  email: string;
  role: Role;
  first_name: string;
  last_name: string;
  phone?: string | null;
};

type UpdateUserData = {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
};

type Ctx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (data: UpdateUserData) => Promise<void>;
};
>>>>>>> c196b23f58c0c78013cef7e11f9ccc9c93648e2a

const AuthContext = createContext<Ctx>(null as unknown as Ctx);

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async (): Promise<void> => {
    const { data } = await UsersApi.getMe();
    const updatedUser = data.user as User;

    await SecureStore.setItemAsync('user', JSON.stringify(updatedUser));
    setUser(updatedUser);
  };

  const updateUser = async (data: UpdateUserData): Promise<void> => {
    const { data: response } = await UsersApi.updateMe(data);
    const updatedUser = response.user as User;

    await SecureStore.setItemAsync('user', JSON.stringify(updatedUser));
    setUser(updatedUser);
  };

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const [token, savedUser] = await Promise.all([
          SecureStore.getItemAsync('token'),
          SecureStore.getItemAsync('user'),
        ]);

        if (token && savedUser) {
          await refreshUser();
        } else {
          setUser(null);
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

  const login = async (email: string, password: string): Promise<void> => {
    const { data } = await AuthApi.login(email, password);

    await SecureStore.setItemAsync('token', data.token);
    await SecureStore.setItemAsync('user', JSON.stringify(data.user));

    setUser(data.user);
  };
<<<<<<< HEAD
  const register = async (data: RegisterData) => {
    const response = await AuthApi.register(data);
    await SecureStore.setItemAsync('token', response.data.token);
    await SecureStore.setItemAsync('user', JSON.stringify(response.data.user));
    setUser(response.data.user);
  };
  const logout = async () => {
=======

  const logout = async (): Promise<void> => {
>>>>>>> c196b23f58c0c78013cef7e11f9ccc9c93648e2a
    await SecureStore.deleteItemAsync('token');
    await SecureStore.deleteItemAsync('user');

    setUser(null);
  };
<<<<<<< HEAD
  return <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>;
}


=======

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        refreshUser,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
>>>>>>> c196b23f58c0c78013cef7e11f9ccc9c93648e2a
