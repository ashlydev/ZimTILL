import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../lib/api";
import {
  clearAuthSnapshot,
  clearSyncMetadata,
  clearToken,
  getAuthSnapshot,
  getDeviceId,
  getSyncMetadata,
  getToken,
  setAuthSnapshot,
  setToken
} from "../lib/storage";
import { hasOfflineCoreData, hydrateOfflineCore, syncOfflineCore } from "../lib/offlineCore";
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
  isOnline: boolean;
  syncing: boolean;
  lastSyncAt: string | null;
  syncError: string | null;
  login: (identifier: string, pin: string, branchId?: string) => Promise<void>;
  register: (businessName: string, identifier: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  switchBranch: (branchId: string) => Promise<void>;
  syncNow: () => Promise<void>;
  hasAnyRole: (roles: Role[]) => boolean;
  hasFeature: (key: string) => boolean;
};

const AuthContext = createContext<AuthState | null>(null);

type Props = { children: React.ReactNode };

function isNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("load failed") ||
    message.includes("network request failed")
  );
}

export function AuthProvider({ children }: Props) {
  const [token, setTokenState] = useState<string | null>(getToken());
  const [user, setUser] = useState<AuthState["user"]>(null);
  const [merchant, setMerchant] = useState<AuthState["merchant"]>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const initialSyncMeta = token && getAuthSnapshot()?.merchant?.id ? getSyncMetadata(getAuthSnapshot()!.merchant!.id) : { lastSyncAt: null, syncError: null };
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(initialSyncMeta.lastSyncAt ?? null);
  const [syncError, setSyncError] = useState<string | null>(initialSyncMeta.syncError ?? null);

  const applySession = (next: {
    user: AuthState["user"];
    merchant: AuthState["merchant"];
    branches: Branch[];
    activeBranchId: string | null;
    subscription: Subscription | null;
    featureFlags: FeatureFlag[];
  }) => {
    setUser(next.user);
    setMerchant(next.merchant);
    setBranches(next.branches);
    setActiveBranchId(next.activeBranchId);
    setSubscription(next.subscription);
    setFeatureFlags(next.featureFlags);

    if (next.merchant) {
      setAuthSnapshot({
        user: next.user,
        merchant: next.merchant,
        branches: next.branches,
        activeBranchId: next.activeBranchId,
        subscription: next.subscription,
        featureFlags: next.featureFlags
      });

      const meta = getSyncMetadata(next.merchant.id);
      setLastSyncAt(meta.lastSyncAt ?? null);
      setSyncError(meta.syncError ?? null);
    }
  };

  const clearSession = () => {
    setTokenState(null);
    setUser(null);
    setMerchant(null);
    setBranches([]);
    setActiveBranchId(null);
    setSubscription(null);
    setFeatureFlags([]);
    setLastSyncAt(null);
    setSyncError(null);
  };

  const syncNow = async () => {
    const active = getToken();
    const snapshot = getAuthSnapshot();
    const merchantId = snapshot?.merchant?.id ?? merchant?.id ?? null;
    if (!active || !merchantId || !isOnline) {
      return;
    }

    setSyncing(true);
    try {
      const result = await syncOfflineCore(active, merchantId);
      setLastSyncAt(result.serverTime);
      setSyncError(null);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const refreshMe = async () => {
    const active = getToken();
    if (!active) {
      clearSession();
      return;
    }

    try {
      const me = await api.me(active);
      setTokenState(active);
      applySession({
        user: me.user,
        merchant: me.merchant,
        branches: me.branches ?? [],
        activeBranchId: me.activeBranchId ?? null,
        subscription: me.subscription ?? null,
        featureFlags: me.featureFlags ?? []
      });

      await hydrateOfflineCore(active, me.merchant.id);
      const meta = getSyncMetadata(me.merchant.id);
      setLastSyncAt(meta.lastSyncAt ?? null);
      setSyncError(meta.syncError ?? null);
    } catch (error) {
      const cached = getAuthSnapshot();
      const hasLocalData = cached?.merchant?.id ? await hasOfflineCoreData(cached.merchant.id) : false;
      if (cached && isNetworkError(error) && hasLocalData) {
        setTokenState(active);
        setUser(cached.user as AuthState["user"]);
        setMerchant(cached.merchant);
        setBranches(cached.branches);
        setActiveBranchId(cached.activeBranchId);
        setSubscription(cached.subscription);
        setFeatureFlags(cached.featureFlags);
        const meta = cached.merchant?.id ? getSyncMetadata(cached.merchant.id) : { lastSyncAt: null, syncError: null };
        setLastSyncAt(meta.lastSyncAt ?? null);
        setSyncError(meta.syncError ?? null);
        return;
      }

      clearToken();
      clearAuthSnapshot();
      clearSession();
      throw error;
    }
  };

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      setLoading(true);
      try {
        await refreshMe();
      } catch {
        if (mounted) {
          clearSession();
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

  useEffect(() => {
    if (!token || !merchant?.id || !isOnline) {
      return;
    }

    void syncNow();
    const interval = window.setInterval(() => {
      void syncNow();
    }, 90_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [token, merchant?.id, isOnline]);

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
    const merchantId = getAuthSnapshot()?.merchant?.id ?? merchant?.id ?? null;
    clearToken();
    clearAuthSnapshot();
    if (merchantId) {
      clearSyncMetadata(merchantId);
    }
    clearSession();

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
      isOnline,
      syncing,
      lastSyncAt,
      syncError,
      login,
      register,
      logout,
      refreshMe,
      switchBranch,
      syncNow,
      hasAnyRole,
      hasFeature
    }),
    [token, user, merchant, branches, activeBranchId, subscription, featureFlags, loading, isOnline, syncing, lastSyncAt, syncError]
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
