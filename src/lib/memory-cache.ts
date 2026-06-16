type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  timeout: NodeJS.Timeout;
};

const cache = new Map<string, CacheEntry<unknown>>();
const pending = new Map<string, Promise<unknown>>();

export const MEMORY_CACHE_TTL = {
  stream: 30 * 60 * 1000,
  search: 10 * 60 * 1000,
  episodes: 60 * 60 * 1000,
} as const;

export function getMemoryCache<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;

  if (Date.now() >= entry.expiresAt) {
    clearTimeout(entry.timeout);
    cache.delete(key);
    return null;
  }

  return entry.value;
}

export function setMemoryCache<T>(key: string, value: T, ttlMs: number): T {
  const existing = cache.get(key);
  if (existing) clearTimeout(existing.timeout);

  const timeout = setTimeout(() => {
    cache.delete(key);
  }, ttlMs);

  timeout.unref?.();

  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
    timeout,
  });

  return value;
}

export async function getOrSetMemoryCache<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = getMemoryCache<T>(key);
  if (cached !== null) return cached;

  const inFlight = pending.get(key) as Promise<T> | undefined;
  if (inFlight) return inFlight;

  const request = fetcher()
    .then((value) => setMemoryCache(key, value, ttlMs))
    .finally(() => {
      pending.delete(key);
    });

  pending.set(key, request);
  return request;
}

