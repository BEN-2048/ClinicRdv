import NetInfo from "@react-native-community/netinfo";
import { AppState } from "react-native";
import React, { createContext, useContext, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { AuthApi, UsersApi } from "../api/services";
import { clearUserCache, saveCachedProfile } from "../database/offlineRepository";
import { invalidateOfflineSync, runOfflineSyncExclusive, getOfflineSyncGeneration, isOfflineSyncGenerationValid } from "../services/offlineSyncLock";
import { syncOfflineData } from "../services/offlineSyncService";
import {
  clearStoredSession,
  currentSessionKey,
  onSessionRejected,
  refreshSession,
  revokeCurrentSession,
  saveTokens,
  tokenExpiresInMs,
} from "../services/session";

const REFRESH_MARGIN_MS = 2 * 60 * 1000;

export type Role = "patient" | "doctor" | "admin" | "secretary";

export type AuthStatus = "authenticated" | "offline" | "unauthenticated";

export type User = {
  id: number;
  email: string;
  role: Role;
  first_name: string;
  last_name: string;
  phone?: string | null;
  patient_id?: number | null;
  patient_number?: string | null;
};

type RegisterData = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
};

type UpdateUserData = {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
};

type Ctx = {
  user: User | null;
  authStatus: AuthStatus;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<boolean>;
  retryConnection: () => Promise<boolean>;
  updateUser: (data: UpdateUserData) => Promise<void>;
};

const AuthContext = createContext<Ctx>(null as unknown as Ctx);

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("unauthenticated");
  const [loading, setLoading] = useState(true);
  const [sessionRestored, setSessionRestored] = useState(false);

  type SessionSnapshot = {
    key: string;
    userId: string;
    generation: number;
  };

  const captureSession = async (): Promise<SessionSnapshot | null> => {
    const generation = getOfflineSyncGeneration();

    const [key, savedUser] = await Promise.all([
      currentSessionKey(),
      SecureStore.getItemAsync("user"),
    ]);

    if (!key || !savedUser) return null;

    try {
      const parsedUser = JSON.parse(savedUser) as User;

      if (parsedUser.id == null) return null;

      const userId = String(parsedUser.id);

      if (!isOfflineSyncGenerationValid(generation)) return null;

      return { key, userId, generation };
    } catch {
      return null;
    }
  };

  const isSessionCurrent = async (
    snapshot: SessionSnapshot,
  ): Promise<boolean> => {
    if (!isOfflineSyncGenerationValid(snapshot.generation)) {
      return false;
    }

    const [currentKey, currentUser] = await Promise.all([
      currentSessionKey(),
      SecureStore.getItemAsync("user"),
    ]);

    if (
      !currentKey ||
      currentKey !== snapshot.key ||
      !currentUser ||
      !isOfflineSyncGenerationValid(snapshot.generation)
    ) {
      return false;
    }

    try {
      const parsedUser = JSON.parse(currentUser) as User;
      return String(parsedUser.id) === snapshot.userId;
    } catch {
      return false;
    }
  };

  const refreshUser = async (): Promise<boolean> => {
    const snapshot = await captureSession();

    if (!snapshot) return false;

    const { data } = await UsersApi.getMe();
    const updatedUser = data.user as User;

    return runOfflineSyncExclusive(async () => {
      if (!(await isSessionCurrent(snapshot))) return false;

      if (String(updatedUser.id) !== snapshot.userId) {
        throw new Error("Identifiant utilisateur incoherent.");
      }

      await SecureStore.setItemAsync("user", JSON.stringify(updatedUser));
      setUser(updatedUser);

      try {
        await saveCachedProfile({
          user_id: String(updatedUser.id),
          email: updatedUser.email,
          role: updatedUser.role,
          first_name: updatedUser.first_name,
          last_name: updatedUser.last_name,
          phone: updatedUser.phone ?? null,
          updated_at: new Date().toISOString(),
        });
      } catch (error) {
        console.warn("Impossible de mettre a jour le profil SQLite :", error);
      }

      setAuthStatus("authenticated");
      return true;
    });
  };

  const retryConnection = async (): Promise<boolean> => {
    let snapshot = await captureSession();

    if (!snapshot) return false;

    const clearSessionIfCurrent = async (): Promise<boolean> => {
      return runOfflineSyncExclusive(async () => {
        if (!snapshot || !(await isSessionCurrent(snapshot))) return false;

        invalidateOfflineSync();

        try {
          await clearUserCache(snapshot.userId);
        } catch (error) {
          console.error("Nettoyage SQLite de la session impossible :", error);

          setUser(null);
          setAuthStatus("unauthenticated");
        }

        await clearStoredSession();

        setUser(null);
        setAuthStatus("unauthenticated");

        return true;
      });
    };

    const [token, refreshToken] = await Promise.all([
      SecureStore.getItemAsync("token"),
      SecureStore.getItemAsync("refreshToken"),
    ]);

    if (!refreshToken || tokenExpiresInMs(token) < REFRESH_MARGIN_MS) {
      const result = await refreshSession();

      if (result === "rejected") {
        await clearSessionIfCurrent();
        return false;
      }

      snapshot = (await captureSession()) ?? snapshot;
    }

    const current = snapshot;

    try {
      return await refreshUser();
    } catch (error: any) {
      if (!(await isSessionCurrent(current))) {
        return false;
      }

      if (error?.response?.status === 401) {
        await clearSessionIfCurrent();
      } else {
        if (error?.response) {
          console.warn("Verification de session impossible", error);
        }

        await runOfflineSyncExclusive(async () => {
          if (!(await isSessionCurrent(current))) return;
          setAuthStatus("offline");
        });
      }

      return false;
    }
  };
  const updateUser = async (data: UpdateUserData): Promise<void> => {
    const snapshot = await captureSession();

    if (!snapshot) {
      throw new Error("Session utilisateur indisponible.");
    }

    const { data: response } = await UsersApi.updateMe(data);
    const updatedUser = response.user as User;

    await runOfflineSyncExclusive(async () => {
      if (!(await isSessionCurrent(snapshot))) {
        throw new Error("La session a change pendant la modification du profil.");
      }

      if (String(updatedUser.id) !== snapshot.userId) {
        throw new Error("Identifiant utilisateur incoherent.");
      }

      await SecureStore.setItemAsync("user", JSON.stringify(updatedUser));
      setUser(updatedUser);

      try {
        await saveCachedProfile({
          user_id: String(updatedUser.id),
          email: updatedUser.email,
          role: updatedUser.role,
          first_name: updatedUser.first_name,
          last_name: updatedUser.last_name,
          phone: updatedUser.phone ?? null,
          updated_at: new Date().toISOString(),
        });
      } catch (error) {
        console.warn("Impossible de mettre a jour le profil SQLite :", error);
      }
    });
  };

  useEffect(() => {
    let active = true;

    const restoreSession = async () => {
      try {
        let snapshot = await captureSession();

        if (!active) return;

        if (!snapshot) {
          await runOfflineSyncExclusive(async () => {
            if (!active) return;

            const currentSession = await captureSession();
            if (currentSession) return;

            setUser(null);
            setAuthStatus("unauthenticated");
          });
          return;
        }

        const [storedToken, storedRefresh] = await Promise.all([
          SecureStore.getItemAsync("token"),
          SecureStore.getItemAsync("refreshToken"),
        ]);

        const refreshResult =
          !storedRefresh || tokenExpiresInMs(storedToken) < REFRESH_MARGIN_MS
            ? await refreshSession()
            : "ok";

        if (refreshResult === "ok") {
          snapshot = (await captureSession()) ?? snapshot;
        }

        const restored = snapshot;

        if (refreshResult === "rejected") {
          await runOfflineSyncExclusive(async () => {
            if (!(await isSessionCurrent(restored))) return;

            invalidateOfflineSync();

            try {
              await clearUserCache(restored.userId);
            } catch (error) {
              console.warn("Nettoyage SQLite apres expiration impossible :", error);
            }

            await clearStoredSession();

            if (active) {
              setUser(null);
              setAuthStatus("unauthenticated");
            }
          });

          return;
        }

        try {
          const refreshed = await refreshUser();

          if (!active || !refreshed) return;

          if (!(await isSessionCurrent(restored))) return;

          void syncOfflineData().catch((syncError) => {
            console.warn(
              "Synchronisation apres restauration impossible :",
              syncError,
            );
          });
        } catch (error: any) {
          if (!(await isSessionCurrent(restored))) return;

          if (error?.response?.status === 401) {
            await runOfflineSyncExclusive(async () => {
              if (!(await isSessionCurrent(restored))) return;

              invalidateOfflineSync();

              try {
                await clearUserCache(restored.userId);
              } catch (cacheError) {
                console.warn(
                  "Nettoyage SQLite apres erreur 401 impossible :",
                  cacheError,
                );
              }

              await clearStoredSession();

              if (active) {
                setUser(null);
                setAuthStatus("unauthenticated");
              }
            });
          } else if (!error?.response || error?.response?.status >= 500) {
            const savedUser = await SecureStore.getItemAsync("user");

            if (!savedUser || !(await isSessionCurrent(restored))) return;

            const cachedUser = JSON.parse(savedUser) as User;

            if (String(cachedUser.id) !== restored.userId) return;

            await runOfflineSyncExclusive(async () => {
              if (!active || !(await isSessionCurrent(restored))) return;

              console.warn(
                "Serveur ou connexion indisponible : session locale conservee",
              );
              setUser(cachedUser);
              setAuthStatus("offline");
            });
          } else {
            await runOfflineSyncExclusive(async () => {
              if (!active || !(await isSessionCurrent(restored))) return;

              console.warn("Session non verifiable :", error);
              setUser(null);
              setAuthStatus("unauthenticated");
            });
          }
        }
      } catch (error) {
        console.error("Erreur de restauration de session :", error);

        await runOfflineSyncExclusive(async () => {
          if (!active) return;

          const currentSession = await captureSession();
          if (currentSession) return;

          setUser(null);
          setAuthStatus("unauthenticated");
        });
      } finally {
        if (active) {
          setLoading(false);
          setSessionRestored(true);
        }
      }
    };

    void restoreSession();

    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    return onSessionRejected(() => {
      void runOfflineSyncExclusive(async () => {
        const snapshot = await captureSession();
        if (!snapshot) return;

        invalidateOfflineSync();

        try {
          await clearUserCache(snapshot.userId);
        } catch (error) {
          console.warn("Nettoyage SQLite apres session refusee impossible :", error);
        }

        await clearStoredSession();
        setUser(null);
        setAuthStatus("unauthenticated");
      });
    });
  }, []);

  useEffect(() => {
    let wasOffline = false;
    let checking = false;

    const unsubscribe = NetInfo.addEventListener(async (state) => {
      const networkAvailable =
        state.isConnected === true &&
        state.isInternetReachable === true;

      if (!sessionRestored) {
        return;
      }

      if (!networkAvailable) {
        wasOffline = true;
        setAuthStatus((current) =>
          current === "authenticated" ? "offline" : current
        );
        return;
      }

      if (wasOffline && !checking) {
        wasOffline = false;
        checking = true;

        try {
          const connected = await retryConnection();

          if (connected) {
            try {
              await syncOfflineData();
            } catch (error) {
              console.warn("Synchronisation hors ligne impossible :", error);
            }
          }
        } finally {
          checking = false;
        }
      }
    });

    return () => unsubscribe();
  }, [sessionRestored]);
  useEffect(() => {
    if (!sessionRestored) return;

    let checkingExpiration = false;

    const checkTokenExpiration = async () => {
      if (checkingExpiration || AppState.currentState !== "active") {
        return;
      }

      checkingExpiration = true;

      try {
        const token = await SecureStore.getItemAsync("token");

        if (!token) return;

        if (tokenExpiresInMs(token) < REFRESH_MARGIN_MS) {
          const result = await refreshSession();

          if (result === "rejected") {
            await retryConnection();
          }
        }
      } catch (error) {
        console.warn("Verification periodique du JWT impossible :", error);
      } finally {
        checkingExpiration = false;
      }
    };

    void checkTokenExpiration();

    const interval = setInterval(() => {
      void checkTokenExpiration();
    }, 30000);

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void checkTokenExpiration();
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [sessionRestored]);

  const login = async (email: string, password: string): Promise<void> => {
    const { data } = await AuthApi.login(email, password);

    await runOfflineSyncExclusive(async () => {
      invalidateOfflineSync();

      await clearStoredSession();
      await saveTokens(data);
      await SecureStore.setItemAsync("user", JSON.stringify(data.user));

      setUser(data.user);
      setAuthStatus("authenticated");
    });

    try {
      await saveCachedProfile({
        user_id: String(data.user.id),
        email: data.user.email,
        role: data.user.role,
        first_name: data.user.first_name,
        last_name: data.user.last_name,
        phone: data.user.phone ?? null,
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      console.warn("Impossible de sauvegarder le profil local :", error);
    }

    try {
      await syncOfflineData();
    } catch (error) {
      console.warn("Synchronisation apres connexion impossible :", error);
    }
  };

  // L'inscription ne cree pas de session avant verification OTP.
  const register = async (data: RegisterData): Promise<void> => {
    await AuthApi.register(data);
  };

  const verifyEmail = async (email: string, code: string): Promise<void> => {
    const { data } = await AuthApi.verifyEmail(email, code);

    if (!data.token || !data.user) {
      throw new Error("Reponse de verification incomplete.");
    }

    await runOfflineSyncExclusive(async () => {
      invalidateOfflineSync();

      await clearStoredSession();
      await saveTokens(data);
      await SecureStore.setItemAsync("user", JSON.stringify(data.user));

      setUser(data.user);
      setAuthStatus("authenticated");
    });

    try {
      await saveCachedProfile({
        user_id: String(data.user.id),
        email: data.user.email,
        role: data.user.role,
        first_name: data.user.first_name,
        last_name: data.user.last_name,
        phone: data.user.phone ?? null,
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      console.warn("Impossible de sauvegarder le profil local :", error);
    }

    try {
      await syncOfflineData();
    } catch (error) {
      console.warn("Synchronisation apres verification impossible :", error);
    }
  };
  const logout = async (): Promise<void> => {
    const snapshot = await captureSession();

    if (!snapshot) {
      throw new Error("Impossible d'identifier la session a deconnecter.");
    }

    const loggedOut = await runOfflineSyncExclusive(async () => {
      const [currentKey, currentUser] = await Promise.all([
        currentSessionKey(),
        SecureStore.getItemAsync("user"),
      ]);

      if (!currentKey || currentKey !== snapshot.key || !currentUser) {
        return false;
      }

      try {
        const parsedUser = JSON.parse(currentUser) as User;

        if (String(parsedUser.id) !== snapshot.userId) {
          return false;
        }
      } catch {
        return false;
      }

      invalidateOfflineSync();

      try {
        await clearUserCache(snapshot.userId);
      } catch (cacheError) {
        console.error("Nettoyage SQLite impossible lors de la deconnexion :", cacheError);
        throw new Error(
          "Deconnexion interrompue : impossible de supprimer les donnees locales."
        );
      }

      const [finalKey, finalUser] = await Promise.all([
        currentSessionKey(),
        SecureStore.getItemAsync("user"),
      ]);

      if (finalKey !== snapshot.key || !finalUser) {
        return false;
      }

      await revokeCurrentSession();

      try {
        if (String((JSON.parse(finalUser) as User).id) !== snapshot.userId) {
          return false;
        }
      } catch {
        return false;
      }

      await clearStoredSession();

      setUser(null);
      setAuthStatus("unauthenticated");

      return true;
    });

    if (!loggedOut) {
      throw new Error("La session a change. Deconnexion annulee pour proteger le nouveau compte.");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        authStatus,
        loading,
        login,
        register,
        verifyEmail,
        logout,
        refreshUser,
        retryConnection,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
