import type { CanonicalCacheStore } from "./canonical-cache-store";
import { createRedisCanonicalStore } from "./redis-canonical-store";
import { MemoryCanonicalStore } from "./memory-canonical-store";
import { kvGetJson, kvSetJson, streamCacheConfigured } from "../kv-cache";

export type EnrichmentStatus = {
  status: "pending" | "complete" | "failed";
  startedAt: number;
  source?: string;
  completedAt?: number;
  error?: string;
};
const STATUS_TTL_SECONDS = 600;

class KvStatusStore implements CanonicalCacheStore {
  async get(key: string): Promise<any | null> {
    return kvGetJson(key);
  }

  async set(key: string, value: any, ttlSeconds = STATUS_TTL_SECONDS): Promise<void> {
    await kvSetJson(key, value, ttlSeconds);
  }

  async del(_key: string): Promise<void> {
    // Status entries expire via TTL.
  }
}

let statusStore: CanonicalCacheStore | null = null;

function resolveStatusStore(): CanonicalCacheStore {
  if (statusStore) return statusStore;

  const redisStore = createRedisCanonicalStore();
  if (redisStore.isAvailable()) {
    statusStore = redisStore;
    return statusStore;
  }

  if (streamCacheConfigured()) {
    statusStore = new KvStatusStore();
    return statusStore;
  }

  statusStore = new MemoryCanonicalStore();
  return statusStore;
}

export function enrichmentStatusKey(animeId: string): string {
  return `enrichment:status:${animeId}`;
}

export function enrichmentLockKey(animeId: string): string {
  return `enrichment:lock:${animeId}`;
}

export async function getEnrichmentStatus(animeId: string): Promise<EnrichmentStatus | null> {
  const store = resolveStatusStore();
  return (await store.get(enrichmentStatusKey(animeId))) as EnrichmentStatus | null;
}

export async function setEnrichmentStatus(animeId: string, status: EnrichmentStatus): Promise<void> {
  const store = resolveStatusStore();
  await store.set(enrichmentStatusKey(animeId), status, STATUS_TTL_SECONDS);
}

/** Prevent duplicate keys colliding with episode cache entries. */
export function isEnrichmentAuxKey(key: string): boolean {
  return key.startsWith("enrichment:");
}
