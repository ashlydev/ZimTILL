import type { Branch, FeatureFlag, Subscription } from "../types";

const TOKEN_KEY = "novoriq_web_token";
const PLATFORM_ADMIN_TOKEN_KEY = "novoriq_web_platform_admin_token";
const DEVICE_KEY = "novoriq_web_device_id";
const AUTH_SNAPSHOT_KEY = "novoriq_web_auth_snapshot";
const SYNC_META_PREFIX = "novoriq_web_sync_meta:";

type AuthSnapshot = {
  user: { id: string; identifier: string; role: string; isActive?: boolean; isPlatformAdmin?: boolean } | null;
  merchant: { id: string; name: string; slug?: string } | null;
  branches: Branch[];
  activeBranchId: string | null;
  subscription: Subscription | null;
  featureFlags: FeatureFlag[];
  updatedAt: string;
};

type SyncMetadata = {
  lastSyncAt?: string | null;
  lastPullAt?: string | null;
  syncError?: string | null;
};

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures in private mode.
  }
}

export function getToken(): string | null {
  return safeGet(TOKEN_KEY);
}

export function setToken(token: string): void {
  safeSet(TOKEN_KEY, token);
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function getPlatformAdminToken(): string | null {
  return safeGet(PLATFORM_ADMIN_TOKEN_KEY);
}

export function setPlatformAdminToken(token: string): void {
  safeSet(PLATFORM_ADMIN_TOKEN_KEY, token);
}

export function clearPlatformAdminToken(): void {
  try {
    localStorage.removeItem(PLATFORM_ADMIN_TOKEN_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function createDeviceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `web-${Math.random().toString(16).slice(2)}-${Date.now()}`;
}

export function getDeviceId(): string {
  const existing = safeGet(DEVICE_KEY);
  if (existing) return existing;

  const next = createDeviceId();
  safeSet(DEVICE_KEY, next);
  return next;
}

export function getAuthSnapshot(): AuthSnapshot | null {
  try {
    const raw = safeGet(AUTH_SNAPSHOT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSnapshot;
  } catch {
    return null;
  }
}

export function setAuthSnapshot(snapshot: Omit<AuthSnapshot, "updatedAt">): void {
  safeSet(
    AUTH_SNAPSHOT_KEY,
    JSON.stringify({
      ...snapshot,
      updatedAt: new Date().toISOString()
    })
  );
}

export function clearAuthSnapshot(): void {
  try {
    localStorage.removeItem(AUTH_SNAPSHOT_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function syncMetaKey(merchantId: string): string {
  return `${SYNC_META_PREFIX}${merchantId}`;
}

export function getSyncMetadata(merchantId: string): Required<SyncMetadata> {
  try {
    const raw = safeGet(syncMetaKey(merchantId));
    if (!raw) {
      return { lastSyncAt: null, lastPullAt: null, syncError: null };
    }

    const parsed = JSON.parse(raw) as SyncMetadata;
    return {
      lastSyncAt: parsed.lastSyncAt ?? null,
      lastPullAt: parsed.lastPullAt ?? null,
      syncError: parsed.syncError ?? null
    };
  } catch {
    return { lastSyncAt: null, lastPullAt: null, syncError: null };
  }
}

export function setSyncMetadata(merchantId: string, next: SyncMetadata): void {
  const current = getSyncMetadata(merchantId);
  safeSet(
    syncMetaKey(merchantId),
    JSON.stringify({
      lastSyncAt: next.lastSyncAt ?? current.lastSyncAt,
      lastPullAt: next.lastPullAt ?? current.lastPullAt,
      syncError: next.syncError ?? current.syncError ?? null
    })
  );
}

export function clearSyncMetadata(merchantId?: string | null): void {
  if (merchantId) {
    try {
      localStorage.removeItem(syncMetaKey(merchantId));
    } catch {
      // Ignore storage failures.
    }
    return;
  }

  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(SYNC_META_PREFIX))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // Ignore storage failures.
  }
}

export function getLastPullAt(merchantId: string): string | null {
  return getSyncMetadata(merchantId).lastPullAt;
}
