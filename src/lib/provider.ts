import { consumetHianimeProvider } from "./consumet-hianime";
import { consumetMultiProvider } from "./provider-chain";
import { wrapStreamProviderWithCache } from "./cached-stream-provider";
import { streamCacheConfigured } from "./kv-cache";

export type StreamCategory = "sub" | "dub" | "raw";

export type ProviderAnime = {
  id: string;
  title: string;
  url?: string;
  image?: string;
  releaseYear?: number;
  type?: string;
};

export type ProviderEpisode = {
  id: string;
  number: number;
  title: string;
  isFiller?: boolean;
  thumbnail?: string;
};

export type EpisodeServer = {
  id: string;
  name: string;
  category: StreamCategory;
};

import type { ProviderSkipTimes } from "./provider-skip";

export type { ProviderSkipRange, ProviderSkipTimes } from "./provider-skip";

export type EpisodeSourcesResponse = {
  sources: { url: string; type: "hls" | "mp4" | "iframe"; quality?: string; isM3U8?: boolean }[];
  subtitles?: { url: string; lang: string }[];
  headers?: Record<string, string>;
  /** Referer/origin for subtitle tracks when fetched separately from the video encode. */
  subtitleHeaders?: Record<string, string>;
  /** Intro/outro seconds from the same provider encode as the stream (preferred over AniSkip). */
  skip?: ProviderSkipTimes | null;
};


const providerBaseUrl = (process.env.STREAM_PROVIDER_BASE_URL || "").replace(/\/$/, "");

export type StreamProviderMode = "consumet-multi" | "consumet-hianime" | "proxy";

export function resolveStreamProviderMode(): StreamProviderMode {
  const explicit = (process.env.STREAM_PROVIDER || "").trim().toLowerCase();
  if (explicit === "consumet-multi") return "consumet-multi";
  if (explicit === "consumet-hianime") return "consumet-hianime";
  if (explicit === "proxy") return "proxy";
  if (providerBaseUrl) return "proxy";
  return "consumet-multi";
}

export function ensureProviderConfigured(mode: StreamProviderMode = resolveStreamProviderMode()) {
  if (mode === "consumet-multi" || mode === "consumet-hianime") return;
  if (!providerBaseUrl) {
    throw new Error("STREAM_PROVIDER_BASE_URL is not configured for this stream API deployment.");
  }
}

async function proxyRequest<T>(path: string): Promise<T> {
  ensureProviderConfigured("proxy");
  const response = await fetch(`${providerBaseUrl}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Provider request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

const proxyStreamProvider = {
  search(query: string) {
    return proxyRequest(`/api/anime/search?q=${encodeURIComponent(query)}`);
  },

  episodes(animeId: string) {
    return proxyRequest(`/api/anime/info?id=${encodeURIComponent(animeId)}`);
  },

  servers(episodeId: string) {
    return proxyRequest(`/api/anime/servers?episodeId=${encodeURIComponent(episodeId)}`);
  },

  sources(episodeId: string, server: string, category: StreamCategory) {
    const params = new URLSearchParams({
      episodeId,
      server,
      category,
    });

    return proxyRequest<EpisodeSourcesResponse>(
      `/api/anime/sources?${params.toString()}`
    );
  },
};
const providerMode = resolveStreamProviderMode();

const builtInProvider =
  providerMode === "consumet-hianime" ? consumetHianimeProvider : consumetMultiProvider;

const rawStreamProvider = providerMode === "proxy" ? proxyStreamProvider : builtInProvider;

export const streamProvider = wrapStreamProviderWithCache(rawStreamProvider);
import { getCache, setCache } from "./cache";

function withCache<T>(key: string, fn: () => Promise<T>, ttl = 60) {
  return async () => {
    const cached = getCache<T>(key);
    if (cached) return cached;

    const result = await fn();
    setCache(key, result, ttl);

    return result;
  };
}

export const activeStreamProviderMode = providerMode;
export const streamProviderCacheEnabled = streamCacheConfigured();
