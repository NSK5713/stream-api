import {
  allanimeProvider,
  DEFAULT_ALLANIME_EPISODE_SERVERS,
  scoreAllAnimeMatch,
} from "./allanime-provider";
import {
  buildConsumetSearchQueries,
  hasUsefulEpisodeTitles,
  mergeProviderEpisodeTitles,
  pickBestConsumetMatch,
} from "./episode-title-utils";
import { incrementMetric } from "./metrics/runtime-metrics";
import {
  consumetAdapters,
  EPISODES_TIMEOUT_MS,
  getConsumetAdapter,
  prefixProviderId,
  SOURCES_TIMEOUT_MS,
  stripProviderPrefix,
  withTimeout,
} from "./consumet-providers";
import { fetchHianimeProviderSkip, type ProviderSkipTimes } from "./provider-skip";
import { resolveEpisodeByNumber, logEpisodeResolution } from "./episode-resolution";
import type { EpisodeId } from "../types/episode";
import type {
  EpisodeServer,
  EpisodeSourcesResponse,
  ProviderAnime,
  ProviderEpisode,
  StreamCategory,
} from "./provider";

function prefixAllAnimeId(id: string): string {
  return prefixProviderId("allanime", id);
}

function isAllAnimeId(id: string): boolean {
  return id.startsWith("allanime:");
}

async function fetchConsumetEpisodeTitles(
  showName: string,
  searchHints: string[] = [],
): Promise<ProviderEpisode[]> {
  const queries = buildConsumetSearchQueries(showName, searchHints);
  let bestEpisodes: ProviderEpisode[] = [];

  for (const query of queries) {
    for (const adapter of consumetAdapters) {
      try {
        const search = await withTimeout(adapter.search(query), `${adapter.key} search`, 10_000);
        const match = pickBestConsumetMatch(search.results, query);
        if (!match) continue;

        const episodeList = await withTimeout(adapter.episodes(match.id), `${adapter.key} episodes`, 15_000);
        if (!hasUsefulEpisodeTitles(episodeList.episodes, showName)) continue;

        if (episodeList.episodes.length >= bestEpisodes.length) {
          bestEpisodes = episodeList.episodes;
        }

        if (bestEpisodes.length > 0) return bestEpisodes;
      } catch {
        // Try the next consumet provider.
      }
    }
  }

  return bestEpisodes;
}

const ALLANIME_EPISODE_ENRICH_TIMEOUT_MS = 8_000;

async function fetchJikanEpisodeTitles(malId: number): Promise<ProviderEpisode[]> {
  if (!Number.isFinite(malId) || malId <= 0) return [];

  try {
    const response = await fetch(`https://api.jikan.moe/v4/anime/${malId}/episodes?page=1`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return [];

    const json = (await response.json()) as {
      data?: Array<{ mal_id: number; title?: string | null }>;
    };

    return (json.data ?? [])
      .map((episode) => ({
        id: String(episode.mal_id),
        number: episode.mal_id,
        title: episode.title?.trim() || `Episode ${episode.mal_id}`,
      }))
      .filter((episode) => episode.number > 0);
  } catch {
    return [];
  }
}

function mapServerForHiAnimeSkip(server: string): string {
  const key = server.toLowerCase();
  if (["vidcloud", "vidstreaming", "streamsb", "streamtape", "megaup"].includes(key)) return key;
  return "vidcloud";
}

function mergeEpisodeSkip(
  response: EpisodeSourcesResponse,
  skip: ProviderSkipTimes | null | undefined,
): EpisodeSourcesResponse {
  if (!skip?.intro && !skip?.outro) return response;
  if (response.skip?.intro || response.skip?.outro) return response;
  return { ...response, skip };
}

function hasSubtitleTracks(response: EpisodeSourcesResponse | null | undefined): boolean {
  return Boolean(response?.subtitles?.some((item) => item.url?.trim()));
}

const DUB_SUBTITLE_ATTACH_TIMEOUT_MS = 2_500;

async function fetchDubSubtitlesBestEffort(
  rawEpisodeId: string,
  server: string,
  category: StreamCategory,
): Promise<EpisodeSourcesResponse | null> {
  if (category !== "dub") return null;

  return Promise.race([
    fetchConsumetSourcesForAllAnimeEpisode(rawEpisodeId, server, "sub"),
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), DUB_SUBTITLE_ATTACH_TIMEOUT_MS);
    }),
  ]);
}

function mergeDubSubtitles(
  response: EpisodeSourcesResponse,
  subSources: EpisodeSourcesResponse | null | undefined,
): EpisodeSourcesResponse {
  if (hasSubtitleTracks(response) || !hasSubtitleTracks(subSources)) return response;
  return {
    ...response,
    subtitles: subSources!.subtitles,
    subtitleHeaders: subSources!.headers,
  };
}

async function findHiAnimeEpisodeIdForAllAnime(rawEpisodeId: string): Promise<string | null> {
  const [showId, episodeStringValue] = rawEpisodeId.split("@");
  const episodeNumber = Number(episodeStringValue);
  if (!showId || !Number.isFinite(episodeNumber) || episodeNumber < 1) return null;

  const showName = await allanimeProvider.getShowName(showId).catch(() => null);
  if (!showName) return null;

  const hianimeAdapter = getConsumetAdapter("hianime");
  if (!hianimeAdapter) return null;

  const queries = buildConsumetSearchQueries(showName, []);
  for (const query of queries) {
    try {
      const search = await withTimeout(hianimeAdapter.search(query), "HiAnime search", 12_000);
      const match = pickBestConsumetMatch(search.results, query);
      if (!match) continue;

      const episodeList = await withTimeout(hianimeAdapter.episodes(match.id), "HiAnime episodes", 18_000);
      const episode = resolveEpisodeByNumber(episodeList.episodes, episodeNumber);
      logEpisodeResolution({
        incomingAnimeId: rawEpisodeId,
        resolvedProviderAnime: { id: match.id, title: match.title },
        episodeListLength: episodeList.episodes.length,
        requestedEpisodeNumber: episodeNumber,
        mappedEpisode: episode ? { id: episode.id, number: episode.number } : null,
      });
      if (episode?.id) return episode.id;
    } catch {
      // Try the next search query.
    }
  }

  return null;
}

async function fetchHiAnimeSkipForAllAnimeEpisode(
  rawEpisodeId: string,
  server: string,
  category: StreamCategory,
): Promise<ProviderSkipTimes | null> {
  const episodeId = await findHiAnimeEpisodeIdForAllAnime(rawEpisodeId);
  if (!episodeId) return null;
  return fetchHianimeProviderSkip(episodeId, mapServerForHiAnimeSkip(server), category);
}

async function fetchConsumetSourcesForAllAnimeEpisode(
  rawEpisodeId: string,
  server: string,
  category: StreamCategory,
): Promise<EpisodeSourcesResponse | null> {
  const [showId, episodeStringValue] = rawEpisodeId.split("@");
  const episodeNumber = Number(episodeStringValue);
  if (!showId || !Number.isFinite(episodeNumber) || episodeNumber < 1) return null;

  const showName = await allanimeProvider.getShowName(showId).catch(() => null);
  if (!showName) return null;

  const queries = buildConsumetSearchQueries(showName, []);
  for (const query of queries) {
    for (const adapter of consumetAdapters) {
      try {
        const search = await withTimeout(adapter.search(query), `${adapter.key} search`, 12_000);
        const match = pickBestConsumetMatch(search.results, query);
        if (!match) continue;

        const episodeList = await withTimeout(adapter.episodes(match.id), `${adapter.key} episodes`, 18_000);
        const episode = resolveEpisodeByNumber(episodeList.episodes, episodeNumber);
        logEpisodeResolution({
          incomingAnimeId: rawEpisodeId,
          resolvedProviderAnime: { id: match.id, title: match.title },
          episodeListLength: episodeList.episodes.length,
          requestedEpisodeNumber: episodeNumber,
          mappedEpisode: episode ? { id: episode.id, number: episode.number } : null,
        });
        if (!episode) continue;

        const serverId = server || "default";
        return await withTimeout(
          adapter.sources(episode.id, serverId, category),
          `${adapter.key} sources`,
          SOURCES_TIMEOUT_MS,
        );
      } catch {
        // Try the next consumet provider.
      }
    }
  }

  return null;
}

async function searchConsumetChain(query: string): Promise<ProviderAnime[]> {
  const settled = await Promise.allSettled(
    consumetAdapters.map((adapter) =>
      withTimeout(adapter.search(query), `${adapter.key} search`, 10_000),
    ),
  );

  const merged = new Map<string, ProviderAnime>();
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const item of result.value.results) {
      if (!merged.has(item.id)) merged.set(item.id, item);
    }
  }

  return [...merged.values()];
}

async function searchAllAnime(query: string): Promise<ProviderAnime[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const allanimeResults = await withTimeout(
        allanimeProvider.search(query),
        "AllAnime search",
        25_000,
      );
      return allanimeResults.results
        .map((item) => ({
          item,
          score: scoreAllAnimeMatch(item.title, query),
        }))
        .sort((a, b) => b.score - a.score)
        .map(({ item }) => ({
          ...item,
          id: prefixAllAnimeId(item.id),
        }));
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }
  }

  if (lastError) throw lastError;
  return [];
}

export const consumetMultiProvider = {
  async search(query: string) {
    let allanimeResults: ProviderAnime[] = [];
    try {
      allanimeResults = await searchAllAnime(query);
    } catch {
      allanimeResults = [];
    }

    if (allanimeResults.length > 0) {
      return { results: allanimeResults };
    }

    let consumetResults: ProviderAnime[] = [];
    try {
      consumetResults = await searchConsumetChain(query);
    } catch {
      consumetResults = [];
    }

    return { results: consumetResults };
  },

  async episodes(animeId: string, options?: { searchHints?: string[]; malId?: number }) {
    if (isAllAnimeId(animeId)) {
      const showId = stripProviderPrefix(animeId).id;
      const data = await withTimeout(allanimeProvider.episodes(showId), "AllAnime episodes", EPISODES_TIMEOUT_MS);
      let episodes = data.episodes;

      const showName = await allanimeProvider.getShowName(showId).catch(() => null);
      const titlesAreGeneric =
        episodes.length > 0 &&
        episodes.length <= 72 &&
        episodes.every((episode) => /^Episode\s*\d+\s*$/i.test(episode.title.trim()));
      const shouldEnrichTitles = titlesAreGeneric && Boolean(showName || options?.malId);

      if (shouldEnrichTitles) {
        incrementMetric("enrichmentRuns");
        console.log("[enrichment]", {
          animeId: showId,
          status: "started",
          totalCount: episodes.length,
          malId: options?.malId ?? null,
        });

        let enrichedFrom: string | null = null;

        if (options?.malId) {
          const jikanEpisodes = await fetchJikanEpisodeTitles(options.malId);
          if (jikanEpisodes.length) {
            episodes = mergeProviderEpisodeTitles(episodes, jikanEpisodes, showName ?? undefined);
            enrichedFrom = "jikan";
          }
        }

        if (!enrichedFrom && showName) {
          const consumetEpisodes = await Promise.race([
            fetchConsumetEpisodeTitles(showName, options?.searchHints ?? []),
            new Promise<ProviderEpisode[]>((resolve) => {
              setTimeout(() => resolve([]), ALLANIME_EPISODE_ENRICH_TIMEOUT_MS);
            }),
          ]);
          if (consumetEpisodes.length) {
            episodes = mergeProviderEpisodeTitles(episodes, consumetEpisodes, showName);
            enrichedFrom = "consumet";
          }
        }

        if (enrichedFrom) {
          console.log("[enrichment]", {
            animeId: showId,
            status: "success",
            source: enrichedFrom,
            totalCount: episodes.length,
          });
        } else {
          console.log("[enrichment]", {
            animeId: showId,
            status: "fail",
            totalCount: episodes.length,
            reason: "jikan and consumet returned no titles",
          });
        }
      }

      return {
        episodes: episodes.map((episode) => ({
          ...episode,
          id: prefixAllAnimeId(episode.id),
        })),
      };
    }

    const { provider, id } = stripProviderPrefix(animeId);
    const adapter = getConsumetAdapter(provider);
    if (!adapter) throw new Error(`Unknown provider for anime id: ${animeId}`);
    return adapter.episodes(id);
  },

  async servers(episodeId: EpisodeId) {
    if (isAllAnimeId(episodeId)) {
      // Skip live server discovery — episode payload GraphQL is slow from Railway and duplicates sources().
      return { servers: DEFAULT_ALLANIME_EPISODE_SERVERS };
    }

    const { provider, id } = stripProviderPrefix(episodeId);
    const adapter = getConsumetAdapter(provider);
    if (!adapter) throw new Error(`Unknown provider for episode id: ${episodeId}`);
    return adapter.servers(id, "sub");
  },

  async sources(episodeId: EpisodeId, server: string, category: StreamCategory): Promise<EpisodeSourcesResponse> {
    if (isAllAnimeId(episodeId)) {
      const rawEpisodeId = stripProviderPrefix(episodeId).id;
      try {
        const [response, hiAnimeSkip, dubSubSources] = await Promise.all([
          withTimeout(allanimeProvider.sources(rawEpisodeId, server, category), "AllAnime sources", SOURCES_TIMEOUT_MS),
          fetchHiAnimeSkipForAllAnimeEpisode(rawEpisodeId, server, category).catch(() => null),
          fetchDubSubtitlesBestEffort(rawEpisodeId, server, category),
        ]);
        const merged = mergeDubSubtitles(mergeEpisodeSkip(response, hiAnimeSkip), dubSubSources);
        return merged;
      } catch (allanimeError) {
        const consumetFallback = await fetchConsumetSourcesForAllAnimeEpisode(rawEpisodeId, server, category);
        if (consumetFallback) {
          const dubSubSources = await fetchDubSubtitlesBestEffort(rawEpisodeId, server, category);
          return mergeDubSubtitles(consumetFallback, dubSubSources);
        }
        throw allanimeError;
      }
    }

    const { provider, id } = stripProviderPrefix(episodeId);
    const adapter = getConsumetAdapter(provider);
    if (!adapter) throw new Error(`Unknown provider for episode id: ${episodeId}`);

    try {
      return await adapter.sources(id, server, category);
    } catch (primaryError) {
      const skipGenericFallback = provider === "kickassanime" || provider === "animepahe";
      if (skipGenericFallback) throw primaryError;

      for (const fallbackServer of ["vidcloud", "streamsb"]) {
        if (fallbackServer === server) continue;
        try {
          return await withTimeout(
            adapter.sources(id, fallbackServer, category),
            `${provider} sources fallback`,
            SOURCES_TIMEOUT_MS,
          );
        } catch {
          // Try the next server alias.
        }
      }
      throw primaryError;
    }
  },
};

export type { ProviderAnime, ProviderEpisode, EpisodeServer, EpisodeSourcesResponse, StreamCategory };
