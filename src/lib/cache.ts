import redis from "./redis";

const LOCAL_TTL = 60 * 1000; // 1 minute fallback
const local = new Map<string, { value: any; exp: number }>();

export async function getCache<T = any>(key: string): Promise<T | null> {
  try {
    if (redis) {
      const data = await redis.get(key);
      if (data) return JSON.parse(data) as T;
    }

    const hit = local.get(key);
    if (hit && hit.exp > Date.now()) return hit.value as T;

    return null;
  } catch {
    const hit = local.get(key);
    if (hit && hit.exp > Date.now()) return hit.value as T;
    return null;
  }
}

export async function setCache(key: string, value: any, ttl = 600) {
  try {
    if (redis) {
      await redis.set(key, JSON.stringify(value), "EX", ttl);
      return;
    }
  } catch {
    local.set(key, { value, exp: Date.now() + LOCAL_TTL });
  }
}