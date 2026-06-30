import redis from "./redis";

const DEFAULT_TTL_SECONDS = 600;
const local = new Map<string, { value: unknown; exp: number }>();

function readLocal<T>(key: string): T | null {
  const hit = local.get(key);
  if (!hit || hit.exp <= Date.now()) {
    if (hit) local.delete(key);
    return null;
  }
  return hit.value as T;
}

function writeLocal(key: string, value: unknown, ttlSeconds: number) {
  local.set(key, { value, exp: Date.now() + ttlSeconds * 1000 });
}

export async function getCache<T = unknown>(key: string): Promise<T | null> {
  const localHit = readLocal<T>(key);
  if (localHit !== null) return localHit;

  try {
    if (redis) {
      const data = await redis.get(key);
      if (data) {
        const parsed = JSON.parse(data) as T;
        writeLocal(key, parsed, DEFAULT_TTL_SECONDS);
        return parsed;
      }
    }
  } catch {
    return readLocal<T>(key);
  }

  return null;
}

export async function setCache(key: string, value: unknown, ttl = DEFAULT_TTL_SECONDS) {
  writeLocal(key, value, ttl);

  try {
    if (redis) {
      await redis.set(key, JSON.stringify(value), "EX", ttl);
    }
  } catch {
    // L1 already populated — safe to serve from this process.
  }
}
