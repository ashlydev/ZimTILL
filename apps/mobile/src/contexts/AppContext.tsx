import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import React, { createContext, PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { getSyncState, setSyncState } from "../data/repository";
import { syncNow } from "../services/sync";
import { useAuth } from "./AuthContext";

type AppContextType = {
  isOnline: boolean;
  syncing: boolean;
  lastSyncAt: string | null;
  syncError: string | null;
  triggerSync: () => Promise<void>;
};

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const [isOnline, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const syncLock = useRef(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      setOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const load = async () => {
      const state = await getSyncState();
      setLastSyncAt(state.last_pull_at ?? state.last_push_at ?? null);
      setSyncError(state.last_error);
    };

    load();
  }, []);

  const runSync = async () => {
    if (!session || !isOnline || syncLock.current) {
      return;
    }

    syncLock.current = true;
    setSyncing(true);
    try {
      const result = await syncNow({
        token: session.token,
        merchantId: session.merchantId,
        userId: session.userId,
        deviceId: session.deviceId
      });
      setLastSyncAt(result.serverTime);
      setSyncError(null);
      await setSyncState({ lastError: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed";
      setSyncError(message);
      await setSyncState({ lastError: message });
    } finally {
      setSyncing(false);
      syncLock.current = false;
    }
  };

  useEffect(() => {
    if (!session || !isOnline) return;

    runSync();

    const interval = setInterval(() => {
      runSync();
    }, 90_000);

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        runSync();
      }
    });

    return () => {
      clearInterval(interval);
      appStateSub.remove();
    };
  }, [session, isOnline]);

  const value = useMemo(
    () => ({
      isOnline,
      syncing,
      lastSyncAt,
      syncError,
      triggerSync: runSync
    }),
    [isOnline, syncing, lastSyncAt, syncError, session]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within AppProvider");
  }
  return context;
}
