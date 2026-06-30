import redis from "../redis";
import type { CanonicalCacheStore } from "./canonical-cache-store";

export class RedisCanonicalStore implements CanonicalCacheStore {
  isAvailable(): boolean {
    return redis !== null;
  }

  async get(key: string): Promise<any | null> {
    if (!redis) return null;

    try {
      const data = await redis.get(key);
      if (!data) return null;
      return JSON.parse(data) as unknown;
    } catch {
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds = 1_209_600): Promise<void> {
    if (!redis) return;

    try {
      await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch {
      // Caller may fall back to memory on write failure.
    }
  }

  async del(key: string): Promise<void> {
    if (!redis) return;

    try {
      await redis.del(key);
    } catch {
      // Best-effort delete.
    }
  }
}

export function createRedisCanonicalStore(): RedisCanonicalStore {
  return new RedisCanonicalStore();
}
