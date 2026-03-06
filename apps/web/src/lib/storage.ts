const TOKEN_KEY = "novoriq_web_token";
const DEVICE_KEY = "novoriq_web_device_id";

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
