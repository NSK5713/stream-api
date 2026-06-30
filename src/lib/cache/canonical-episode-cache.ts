import {
  CANONICAL_EPISODE_TTL_SECONDS,
  canonicalEpisodeDisplayKey,
  canonicalEpisodeKey,
  canonicalEpisodeMetaKey,
  canonicalEpisodeRawKey,
  canonicalV8ConsensusKey,
  canonicalV8DriftKey,
  canonicalV8ScoreKey,
  type CanonicalCacheStore,
  type CanonicalEpisodeMeta,
  type CanonicalEpisodeWriteInput,
  type ConsensusScore,
} from "./canonical-cache-store";
import { createRedisCanonicalStore } from "./redis-canonical-store";
import { MemoryCanonicalStore } from "./memory-canonical-store";
import { kvGetJson, kvSetJson, kvDel, streamCacheConfigured } from "../kv-cache";
import type { EpisodeConfidenceSource } from "../episodes/episode-confidence";

export type DisplayEpisode = {
  number: number;
  title: string;
  id: string;
};

export type RawEpisode = {
  number: number;
  title: string;
  source: EpisodeConfidenceSource;
  confidence: number;
};

export type DisplayCacheHit = {
  episodes: DisplayEpisode[];
  enriched: boolean;
};

class KvCanonicalStore implements CanonicalCacheStore {
  async get(key: string): Promise<any | null> {
    return kvGetJson(key);
  }

  async set(key: string, value: any, ttlSeconds = CANONICAL_EPISODE_TTL_SECONDS): Promise<void> {
    await kvSetJson(key, value, ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await kvDel(key);
  }
}

type StoreKind = "redis" | "kv" | "memory";

let activeStore: CanonicalCacheStore | null = null;
let activeStoreKind: StoreKind = "memory";
let fallbackLogged = false;

function resolveStore(): { store: CanonicalCacheStore; kind: StoreKind } {
  if (activeStore) {
    return { store: activeStore, kind: activeStoreKind };
  }

  const redisStore = createRedisCanonicalStore();
  if (redisStore.isAvailable()) {
    activeStore = redisStore;
    activeStoreKind = "redis";
    return { store: activeStore, kind: activeStoreKind };
  }

  if (streamCacheConfigured()) {
    activeStore = new KvCanonicalStore();
    activeStoreKind = "kv";
    return { store: activeStore, kind: activeStoreKind };
  }

  if (!fallbackLogged) {
    console.log("[v5-cache] Redis unavailable → using memory fallback");
    console.log("[v5-cache] fallback_memory_mode");
    fallbackLogged = true;
  }

  activeStore = new MemoryCanonicalStore();
  activeStoreKind = "memory";
  return { store: activeStore, kind: activeStoreKind };
}

export function getCanonicalCacheStoreKind(): StoreKind {
  return resolveStore().kind;
}

/** Fast API path — V8 consensus first, then V7 display layer. */
export async function getDisplayCache(animeId: string): Promise<DisplayCacheHit | null> {
  const { store } = resolveStore();
  const meta = (await store.get(canonicalEpisodeMetaKey(animeId))) as CanonicalEpisodeMeta | null;

  const v8Consensus = (await store.get(canonicalV8ConsensusKey(animeId))) as DisplayEpisode[] | null;
  if (v8Consensus?.length) {
    console.log(`[v8-cache] hit animeId=${animeId} layer=consensus`);
    return {
      episodes: v8Consensus,
      enriched: meta?.enriched ?? true,
    };
  }

  const displayEpisodes = (await store.get(
    canonicalEpisodeDisplayKey(animeId),
  )) as DisplayEpisode[] | null;
  if (!displayEpisodes?.length) return null;

  console.log(`[v7-cache] hit animeId=${animeId} layer=display`);

  return {
    episodes: displayEpisodes,
    enriched: meta?.enriched ?? true,
  };
}

/** Internal — raw layer for self-heal (never exposed to API). */
export async function getRawCache(animeId: string): Promise<RawEpisode[] | null> {
  const { store } = resolveStore();
  return (await store.get(canonicalEpisodeRawKey(animeId))) as RawEpisode[] | null;
}

/** Internal — meta layer for consistency guards (worker only). */
export async function getCanonicalMeta(animeId: string): Promise<CanonicalEpisodeMeta | null> {
  const { store } = resolveStore();
  return (await store.get(canonicalEpisodeMetaKey(animeId))) as CanonicalEpisodeMeta | null;
}

export async function setCanonicalEpisodes(input: CanonicalEpisodeWriteInput): Promise<void> {
  const { store } = resolveStore();
  const ttl = CANONICAL_EPISODE_TTL_SECONDS;
  const timestamp = Date.now();
  const v8Display = (input.v8ConsensusDisplay ?? input.displayEpisodes) as DisplayEpisode[];

  const meta: CanonicalEpisodeMeta = {
    animeId: input.animeId,
    identityHash: input.identityHash,
    avgConfidence: input.avgConfidence,
    enriched: input.enriched,
    timestamp,
    lastUpdated: timestamp,
    driftDetected: input.driftDetected,
    consensusScore: input.consensusScore,
  };

  await store.set(canonicalEpisodeRawKey(input.animeId), input.rawEpisodes, ttl);
  await store.set(canonicalEpisodeDisplayKey(input.animeId), input.displayEpisodes, ttl);
  await store.set(canonicalEpisodeMetaKey(input.animeId), meta, ttl);
  await store.set(canonicalEpisodeKey(input.animeId), { v: 8, enriched: input.enriched }, ttl);

  if (input.consensusScore) {
    await store.set(canonicalV8ConsensusKey(input.animeId), v8Display, ttl);
    await store.set(canonicalV8ScoreKey(input.animeId), input.consensusScore, ttl);
  }

  if (input.driftDetected !== undefined) {
    await store.set(
      canonicalV8DriftKey(input.animeId),
      { drift: input.driftDetected, reasons: input.driftReasons ?? [] },
      ttl,
    );
  }
}

/** Self-heal path — update display + V8 keys only, never raw. */
export async function updateDisplayCacheOnly(
  animeId: string,
  displayEpisodes: DisplayEpisode[],
  patch: {
    avgConfidence?: number;
    consensusScore?: ConsensusScore;
  },
): Promise<void> {
  const { store } = resolveStore();
  const ttl = CANONICAL_EPISODE_TTL_SECONDS;
  const existingMeta = await getCanonicalMeta(animeId);
  if (!existingMeta) return;

  const timestamp = Date.now();
  const meta: CanonicalEpisodeMeta = {
    ...existingMeta,
    avgConfidence: patch.avgConfidence ?? existingMeta.avgConfidence,
    consensusScore: patch.consensusScore ?? existingMeta.consensusScore,
    lastUpdated: timestamp,
    timestamp,
  };

  await store.set(canonicalEpisodeDisplayKey(animeId), displayEpisodes, ttl);
  await store.set(canonicalV8ConsensusKey(animeId), displayEpisodes, ttl);
  await store.set(canonicalEpisodeMetaKey(animeId), meta, ttl);

  if (patch.consensusScore) {
    await store.set(canonicalV8ScoreKey(animeId), patch.consensusScore, ttl);
  }
}

export async function invalidateCanonicalEpisodes(animeId: string): Promise<void> {
  const { store } = resolveStore();
  await Promise.all([
    store.del(canonicalEpisodeKey(animeId)),
    store.del(canonicalEpisodeDisplayKey(animeId)),
    store.del(canonicalEpisodeRawKey(animeId)),
    store.del(canonicalEpisodeMetaKey(animeId)),
    store.del(canonicalV8ConsensusKey(animeId)),
    store.del(canonicalV8DriftKey(animeId)),
    store.del(canonicalV8ScoreKey(animeId)),
  ]);
}
