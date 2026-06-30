import type { CanonicalCacheStore } from "./canonical-cache-store";

type MemoryEntry = {
  value: unknown;
  exp: number;
};

export class MemoryCanonicalStore implements CanonicalCacheStore {
  private readonly cache = new Map<string, MemoryEntry>();

  async get(key: string): Promise<any | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.exp <= Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: any, ttlSeconds = 1_209_600): Promise<void> {
    this.cache.set(key, {
      value,
      exp: Date.now() + ttlSeconds * 1000,
    });
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }
}
