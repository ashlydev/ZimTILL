import React, { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { apiRequest } from "../services/api";
import { getDeviceId, initializeLocalStore } from "../data/repository";

type Session = {
  token: string;
  merchantId: string;
  userId: string;
  identifier: string;
  businessName: string;
  deviceId: string;
};

type AuthContextType = {
  session: Session | null;
  loading: boolean;
  register: (businessName: string, identifier: string, pin: string) => Promise<void>;
  login: (identifier: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
};

const SESSION_KEY = "novoriq.orders.session";

const AuthContext = createContext<AuthContextType | null>(null);

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

  const register = async (businessName: string, identifier: string, pin: string) => {
    const deviceId = await getDeviceId();
    const response = await apiRequest<{
      token: string;
      merchant: { id: string; name: string };
      user: { id: string; identifier: string };
    }>("/auth/register", {
      method: "POST",
      body: {
        businessName,
        identifier,
        pin,
        deviceId
      }
    });

    await persistSession({
      token: response.token,
      merchantId: response.merchant.id,
      userId: response.user.id,
      identifier: response.user.identifier,
      businessName: response.merchant.name,
      deviceId
    });
  };

  const login = async (identifier: string, pin: string) => {
    const deviceId = await getDeviceId();
    const response = await apiRequest<{
      token: string;
      merchant: { id: string; name: string };
      user: { id: string; identifier: string };
    }>("/auth/login", {
      method: "POST",
      body: {
        identifier,
        pin,
        deviceId
      }
    });

    await persistSession({
      token: response.token,
      merchantId: response.merchant.id,
      userId: response.user.id,
      identifier: response.user.identifier,
      businessName: response.merchant.name,
      deviceId
    });
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
