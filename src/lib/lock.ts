import redis from "./redis";

export async function acquireLock(key: string, ttl = 10) {
  try {
    if (!redis) return false;
    const result = await redis.set(`lock:${key}`, "1", "EX", ttl, "NX");
    return result === "OK";
  } catch (err) {
    // Redis not available — fall back to no-lock
    return false;
  }
}

export async function releaseLock(key: string) {
  try {
    if (!redis) return;
    await redis.del(`lock:${key}`);
  } catch {
    // ignore
  }
}
