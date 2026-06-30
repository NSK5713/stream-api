export interface CanonicalCacheStore {
  get(key: string): Promise<any | null>;
  set(key: string, value: any, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
}

export const CANONICAL_EPISODE_KEY_PREFIX = "canonical:episode:";

/** Internal routing pointer — not exposed to API. */
export function canonicalEpisodeKey(animeId: string): string {
  return `${CANONICAL_EPISODE_KEY_PREFIX}${animeId}`;
}

export function canonicalEpisodeDisplayKey(animeId: string): string {
  return `${CANONICAL_EPISODE_KEY_PREFIX}display:${animeId}`;
}

export function canonicalEpisodeRawKey(animeId: string): string {
  return `${CANONICAL_EPISODE_KEY_PREFIX}raw:${animeId}`;
}

export function canonicalEpisodeMetaKey(animeId: string): string {
  return `${CANONICAL_EPISODE_KEY_PREFIX}meta:${animeId}`;
}

export function canonicalV8ConsensusKey(animeId: string): string {
  return `canonical:v8:consensus:${animeId}`;
}

export function canonicalV8DriftKey(animeId: string): string {
  return `canonical:v8:drift:${animeId}`;
}

export function canonicalV8ScoreKey(animeId: string): string {
  return `canonical:v8:score:${animeId}`;
}

export function selfHealLockKey(animeId: string): string {
  return `selfheal:lock:${animeId}`;
}

/** 14 days */
export const CANONICAL_EPISODE_TTL_SECONDS = 1_209_600;

export type ConsensusScore = {
  identity: number;
  episode: number;
  title: number;
};

export type CanonicalEpisodeMeta = {
  animeId: string;
  identityHash: string;
  avgConfidence: number;
  enriched: boolean;
  timestamp: number;
  driftDetected?: boolean;
  consensusScore?: ConsensusScore;
  lastUpdated?: number;
};

export type CanonicalEpisodeWriteInput = {
  animeId: string;
  rawEpisodes: unknown[];
  displayEpisodes: unknown[];
  identityHash: string;
  avgConfidence: number;
  enriched: boolean;
  driftDetected?: boolean;
  driftReasons?: string[];
  consensusScore?: ConsensusScore;
  v8ConsensusDisplay?: unknown[];
};
