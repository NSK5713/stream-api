type CacheEntry<T> = {
  value: T;
  expires: number;
};

const cache = new Map<string, CacheEntry<any>>();

export function setCache<T>(key: string, value: T, ttlMs: number) {
  cache.set(key, {
    value,
    expires: Date.now() + ttlMs,
  });
}

export function getCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}