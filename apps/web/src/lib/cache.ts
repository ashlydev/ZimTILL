const CACHE_PREFIX = "novoriq_web_cache:";

type CachedRecord<T> = {
  value: T;
  updatedAt: string;
};

function key(name: string): string {
  return `${CACHE_PREFIX}${name}`;
}

export function readCache<T>(name: string): CachedRecord<T> | null {
  try {
    const raw = localStorage.getItem(key(name));
    if (!raw) return null;
    return JSON.parse(raw) as CachedRecord<T>;
  } catch {
    return null;
  }
}

export function writeCache<T>(name: string, value: T): void {
  try {
    const record: CachedRecord<T> = { value, updatedAt: new Date().toISOString() };
    localStorage.setItem(key(name), JSON.stringify(record));
  } catch {
    // Ignore storage failures.
  }
}

export async function loadWithCache<T>(
  name: string,
  loader: () => Promise<T>
): Promise<{ value: T; fromCache: boolean; cachedAt?: string }> {
  try {
    const value = await loader();
    writeCache(name, value);
    return { value, fromCache: false };
  } catch (error) {
    const cached = readCache<T>(name);
    if (cached) {
      return { value: cached.value, fromCache: true, cachedAt: cached.updatedAt };
    }
    throw error;
  }
}
