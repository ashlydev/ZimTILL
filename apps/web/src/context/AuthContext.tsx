import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../lib/api";
import { clearToken, getDeviceId, getToken, setToken } from "../lib/storage";
import type { Branch, FeatureFlag, Role, Subscription } from "../types";

type AuthState = {
  token: string | null;
  user: { id: string; identifier: string; role: Role; isActive?: boolean; isPlatformAdmin?: boolean } | null;
  merchant: { id: string; name: string; slug?: string } | null;
  branches: Branch[];
  activeBranchId: string | null;
  subscription: Subscription | null;
  featureFlags: FeatureFlag[];
  loading: boolean;
  login: (identifier: string, pin: string, branchId?: string) => Promise<void>;
  register: (businessName: string, identifier: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  switchBranch: (branchId: string) => Promise<void>;
  hasAnyRole: (roles: Role[]) => boolean;
  hasFeature: (key: string) => boolean;
};

const AuthContext = createContext<AuthState | null>(null);

type Props = { children: React.ReactNode };

export function AuthProvider({ children }: Props) {
  const [token, setTokenState] = useState<string | null>(getToken());
  const [user, setUser] = useState<AuthState["user"]>(null);
  const [merchant, setMerchant] = useState<AuthState["merchant"]>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshMe = async () => {
    const active = getToken();
    if (!active) {
      setTokenState(null);
      setUser(null);
      setMerchant(null);
      setBranches([]);
      setActiveBranchId(null);
      setSubscription(null);
      setFeatureFlags([]);
      return;
    }

    const me = await api.me(active);
    setTokenState(active);
    setUser(me.user);
    setMerchant(me.merchant);
    setBranches(me.branches ?? []);
    setActiveBranchId(me.activeBranchId ?? null);
    setSubscription(me.subscription ?? null);
    setFeatureFlags(me.featureFlags ?? []);
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
          setBranches([]);
          setActiveBranchId(null);
          setSubscription(null);
          setFeatureFlags([]);
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

  const login = async (identifier: string, pin: string, branchId?: string) => {
    const result = await api.login({ identifier, pin, deviceId: getDeviceId(), branchId });
    setToken(result.token);
    setTokenState(result.token);
    await refreshMe();
  };

  const register = async (businessName: string, identifier: string, pin: string) => {
    const result = await api.register({ businessName, identifier, pin, deviceId: getDeviceId() });
    setToken(result.token);
    setTokenState(result.token);
    await refreshMe();
  };

  const switchBranch = async (branchId: string) => {
    const active = getToken();
    if (!active) return;
    const result = await api.switchBranch(active, branchId);
    setToken(result.token);
    setTokenState(result.token);
    setActiveBranchId(result.activeBranchId);
    await refreshMe();
  };

  const logout = async () => {
    const active = getToken();
    clearToken();
    setTokenState(null);
    setUser(null);
    setMerchant(null);
    setBranches([]);
    setActiveBranchId(null);
    setSubscription(null);
    setFeatureFlags([]);

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

  const hasFeature = (key: string) => featureFlags.some((flag) => flag.key === key && flag.enabled);

  const value = useMemo<AuthState>(
    () => ({
      token,
      user,
      merchant,
      branches,
      activeBranchId,
      subscription,
      featureFlags,
      loading,
      login,
      register,
      logout,
      refreshMe,
      switchBranch,
      hasAnyRole,
      hasFeature
    }),
    [token, user, merchant, branches, activeBranchId, subscription, featureFlags, loading]
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
