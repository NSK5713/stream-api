import type { StreamCategory } from "./provider";
import {
  getOrSetCached,
  streamCacheKey,
  STREAM_CACHE_TTL,
} from "./kv-cache";

type EpisodesOptions = { searchHints?: string[] };

type StreamProviderLike = {
  search(query: string): Promise<unknown>;
  episodes(animeId: string, options?: EpisodesOptions): Promise<unknown>;
  servers(episodeId: string, category?: StreamCategory): Promise<unknown>;
  sources(episodeId: string, server: string, category: StreamCategory): Promise<unknown>;
};

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

function hintsKey(hints: string[] | undefined): string {
  if (!hints?.length) return "";
  return hints
    .map((hint) => hint.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join("|");
}

export function wrapStreamProviderWithCache<T extends StreamProviderLike>(provider: T): T {
  return {
    ...provider,
    search(query: string) {
      const normalized = normalizeQuery(query);
      const key = streamCacheKey("search", [normalized]);
      return getOrSetCached(key, STREAM_CACHE_TTL.search, () => provider.search(query)).then(
        (entry) => entry.value,
      );
    },
    episodes(animeId: string, options?: EpisodesOptions) {
      const key = streamCacheKey("episodes", [animeId, hintsKey(options?.searchHints)]);
      return getOrSetCached(key, STREAM_CACHE_TTL.episodes, () => provider.episodes(animeId, options)).then(
        (entry) => entry.value,
      );
    },
    servers(episodeId: string, category?: StreamCategory) {
      const key = streamCacheKey("servers", [episodeId, category ?? "sub"]);
      return getOrSetCached(key, STREAM_CACHE_TTL.servers, () => provider.servers(episodeId, category)).then(
        (entry) => entry.value,
      );
    },
    /** Signed stream URLs expire quickly — never cache sources in Redis. */
    sources(episodeId: string, server: string, category: StreamCategory) {
      return provider.sources(episodeId, server, category);
    },
  } as T;
}
