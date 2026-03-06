import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../lib/api";
import { clearToken, getDeviceId, getToken, setToken } from "../lib/storage";
import type { Role } from "../types";

type AuthState = {
  token: string | null;
  user: { id: string; identifier: string; role: Role; isActive?: boolean } | null;
  merchant: { id: string; name: string } | null;
  loading: boolean;
  login: (identifier: string, pin: string) => Promise<void>;
  register: (businessName: string, identifier: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  hasAnyRole: (roles: Role[]) => boolean;
};

const AuthContext = createContext<AuthState | null>(null);

type Props = { children: React.ReactNode };

export function AuthProvider({ children }: Props) {
  const [token, setTokenState] = useState<string | null>(getToken());
  const [user, setUser] = useState<AuthState["user"]>(null);
  const [merchant, setMerchant] = useState<AuthState["merchant"]>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = async () => {
    const active = getToken();
    if (!active) {
      setTokenState(null);
      setUser(null);
      setMerchant(null);
      return;
    }

    const me = await api.me(active);
    setTokenState(active);
    setUser(me.user);
    setMerchant(me.merchant);
  };

  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      setLoading(true);
      try {
        await refreshMe();
      } catch {
        if (mounted) {
          clearToken();
          setTokenState(null);
          setUser(null);
          setMerchant(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void boot();

    return () => {
      mounted = false;
    };
  }, []);

  const login = async (identifier: string, pin: string) => {
    const result = await api.login({ identifier, pin, deviceId: getDeviceId() });
    setToken(result.token);
    setTokenState(result.token);
    setUser(result.user);
    setMerchant(result.merchant);
  };

  const register = async (businessName: string, identifier: string, pin: string) => {
    const result = await api.register({ businessName, identifier, pin, deviceId: getDeviceId() });
    setToken(result.token);
    setTokenState(result.token);
    setUser(result.user);
    setMerchant(result.merchant);
  };

  const logout = async () => {
    const active = getToken();
    clearToken();
    setTokenState(null);
    setUser(null);
    setMerchant(null);

    if (active) {
      try {
        await api.logout(active, getDeviceId());
      } catch {
        // Local logout still succeeds.
      }
    }
  };

  const hasAnyRole = (roles: Role[]) => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  const value = useMemo<AuthState>(
    () => ({
      token,
      user,
      merchant,
      loading,
      login,
      register,
      logout,
      refreshMe,
      hasAnyRole
    }),
    [token, user, merchant, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

export function getUserError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}
