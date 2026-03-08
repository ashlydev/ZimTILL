import React, { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import * as SecureStore from "expo-secure-store";
import { apiRequest } from "../services/api";
import { getDeviceId, initializeLocalStore } from "../data/repository";
import {
  AuthRole,
  AuthSessionSnapshot,
  createOfflineAuthRecord,
  findOfflineAuthRecord,
  parseOfflineAuthStore,
  upsertOfflineAuthRecord,
  verifyOfflinePin
} from "../utils/offlineAuth";

type Session = AuthSessionSnapshot & {
  role: AuthRole;
};

type AuthContextType = {
  session: Session | null;
  loading: boolean;
  register: (businessName: string, identifier: string, pin: string) => Promise<void>;
  login: (identifier: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
};

const SESSION_KEY = "novoriq.orders.session";
const OFFLINE_AUTH_KEY = "zimtill.offline-auth";

const AuthContext = createContext<AuthContextType | null>(null);

function isNetworkRequestError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("network request failed") ||
    message.includes("failed to fetch") ||
    message.includes("load failed") ||
    message.includes("network error") ||
    message.includes("aborted")
  );
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        const raw = await SecureStore.getItemAsync(SESSION_KEY);
        if (!active || !raw) {
          setLoading(false);
          return;
        }

        const parsed = JSON.parse(raw) as Session;
        await initializeLocalStore(parsed.deviceId);
        setSession(parsed);
      } catch {
        setSession(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    bootstrap();

    return () => {
      active = false;
    };
  }, []);

  const persistSession = async (next: Session) => {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(next));
    await initializeLocalStore(next.deviceId);
    setSession(next);
  };

  const persistOfflineAuth = async (next: Session, identifier: string, pin: string) => {
    const currentStore = parseOfflineAuthStore(await SecureStore.getItemAsync(OFFLINE_AUTH_KEY));
    const nextStore = {
      version: 1 as const,
      records: upsertOfflineAuthRecord(currentStore.records, createOfflineAuthRecord(next, identifier, pin))
    };
    await SecureStore.setItemAsync(OFFLINE_AUTH_KEY, JSON.stringify(nextStore));
  };

  const restoreOfflineSession = async (identifier: string, pin: string, deviceId: string) => {
    const store = parseOfflineAuthStore(await SecureStore.getItemAsync(OFFLINE_AUTH_KEY));
    const record = findOfflineAuthRecord(store.records, identifier);

    if (!record) {
      throw new Error("Offline login works only after this device has signed in online once.");
    }

    if (record.session.deviceId !== deviceId) {
      throw new Error("This device is not approved for offline access on that account.");
    }

    if (!verifyOfflinePin(record, identifier, pin, deviceId)) {
      throw new Error("Incorrect PIN for offline login.");
    }

    await persistSession(record.session);
  };

  const isInternetAvailable = async () => {
    try {
      const state = await NetInfo.fetch();
      return Boolean(state.isConnected && state.isInternetReachable !== false);
    } catch {
      return true;
    }
  };

  const register = async (businessName: string, identifier: string, pin: string) => {
    const deviceId = await getDeviceId();
    const online = await isInternetAvailable();

    if (!online) {
      throw new Error("Account creation requires internet. Sign in online once, then this device can work offline.");
    }

    const response = await apiRequest<{
      token: string;
      merchant: { id: string; name: string };
      user: { id: string; identifier: string; role: Session["role"] };
      activeBranchId?: string | null;
    }>("/auth/register", {
      method: "POST",
      body: {
        businessName,
        identifier,
        pin,
        deviceId
      }
    });

    const nextSession: Session = {
      token: response.token,
      merchantId: response.merchant.id,
      userId: response.user.id,
      identifier: response.user.identifier,
      role: response.user.role,
      businessName: response.merchant.name,
      deviceId,
      activeBranchId: response.activeBranchId ?? null
    };

    await persistSession(nextSession);
    await persistOfflineAuth(nextSession, identifier, pin);
  };

  const login = async (identifier: string, pin: string) => {
    const deviceId = await getDeviceId();
    const online = await isInternetAvailable();

    if (!online) {
      await restoreOfflineSession(identifier, pin, deviceId);
      return;
    }

    try {
      const response = await apiRequest<{
        token: string;
        merchant: { id: string; name: string };
        user: { id: string; identifier: string; role: Session["role"] };
        activeBranchId?: string | null;
      }>("/auth/login", {
        method: "POST",
        body: {
          identifier,
          pin,
          deviceId
        }
      });

      const nextSession: Session = {
        token: response.token,
        merchantId: response.merchant.id,
        userId: response.user.id,
        identifier: response.user.identifier,
        role: response.user.role,
        businessName: response.merchant.name,
        deviceId,
        activeBranchId: response.activeBranchId ?? null
      };

      await persistSession(nextSession);
      await persistOfflineAuth(nextSession, identifier, pin);
    } catch (error) {
      if (!isNetworkRequestError(error)) {
        throw error;
      }

      await restoreOfflineSession(identifier, pin, deviceId);
    }
  };

  const logout = async () => {
    if (session?.token) {
      try {
        await apiRequest("/auth/logout", {
          method: "POST",
          token: session.token,
          body: { deviceId: session.deviceId }
        });
      } catch {
        // Ignore network/logout errors because local logout must still proceed.
      }
    }

    await SecureStore.deleteItemAsync(SESSION_KEY);
    setSession(null);
  };

  const value = useMemo(
    () => ({
      session,
      loading,
      register,
      login,
      logout
    }),
    [session, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
