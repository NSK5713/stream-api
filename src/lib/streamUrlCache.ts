import { getCache, setCache } from "./cache";
import { dedupe } from "./dedupe";
import { getMemoryCache, setMemoryCache } from "./memory-cache";

/** Resolved playback payload stored after a successful /api/stream resolution. */
export type ResolvedStreamPayload = {
  episodeId: string;
  server: { id: string; name: string; category: string };
  sources: {
    url: string;
    type: "hls" | "mp4" | "iframe";
    quality?: string;
    isM3U8?: boolean;
  }[];
  headers?: Record<string, string>;
  subtitles?: { url: string; lang: string }[];
};

const RESOLVED_PREFIX = "stream:resolved:";

/** Seconds — override with STREAM_RESOLVED_CACHE_TTL (default 10 min). */
export const RESOLVED_STREAM_TTL_SECONDS = Math.max(
  60,
  Number.parseInt(process.env.STREAM_RESOLVED_CACHE_TTL ?? "600", 10) || 600,
);

function resolvedStreamKey(episodeId: string, category: string): string {
  return `${RESOLVED_PREFIX}${episodeId}:${category}`;
}

/** L1 memory → L2 Redis/local. Populates L1 on remote hits. */
export async function getResolvedStreamCache(
  episodeId: string,
  category: string,
): Promise<ResolvedStreamPayload | null> {
  const key = resolvedStreamKey(episodeId, category);

  const memoryHit = getMemoryCache<ResolvedStreamPayload>(key);
  if (memoryHit) return memoryHit;

  const remoteHit = await getCache<ResolvedStreamPayload>(key);
  if (remoteHit) {
    setMemoryCache(key, remoteHit, RESOLVED_STREAM_TTL_SECONDS * 1000);
    return remoteHit;
  }

  return null;
}

export async function setResolvedStreamCache(
  episodeId: string,
  category: string,
  value: ResolvedStreamPayload,
): Promise<void> {
  const key = resolvedStreamKey(episodeId, category);
  setMemoryCache(key, value, RESOLVED_STREAM_TTL_SECONDS * 1000);
  await setCache(key, value, RESOLVED_STREAM_TTL_SECONDS);
}

/** Coalesce concurrent resolutions for the same episode + category on this process. */
export function dedupeStreamResolution<T>(
  episodeId: string,
  category: string,
  fn: () => Promise<T>,
): Promise<T> {
  return dedupe(resolvedStreamKey(episodeId, category), fn);
}
