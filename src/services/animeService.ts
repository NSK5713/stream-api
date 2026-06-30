import { streamProvider, type ProviderEpisode, type StreamCategory } from "../lib/provider";
import { enrichProviderEpisodeThumbnails } from "../lib/episodes/episode-thumbnails";
import type { EpisodeId } from "../types/episode";

type SafeProviderResponse = {
  results?: any[];
  animes?: any[];
  data?: any[];
};

function safeArray(data: any): any[] {
  if (!data) return [];
  return data.results || data.animes || data.data || [];
}

/* ---------------- SEARCH ---------------- */
export async function searchAnime(query: string) {
  try {
    const res = (await streamProvider.search(query)) as SafeProviderResponse;
    return safeArray(res);
  } catch {
    return [];
  }
}

/* ---------------- EPISODES ---------------- */
export async function getAnimeInfo(
  animeId: string,
  searchHints: string[] = [],
  options: { malId?: number; posterUrl?: string } = {},
) {
  try {
    const res = await streamProvider.episodes(animeId, {
      searchHints,
      malId: options.malId,
    });
    let episodes = ((res as { episodes?: ProviderEpisode[]; data?: ProviderEpisode[] })?.episodes ??
      (res as { data?: ProviderEpisode[] })?.data ??
      []) as ProviderEpisode[];
    const enriched = episodes.some(
      (episode) => episode.title && !/^Episode\s*\d+\s*$/i.test(episode.title.trim()),
    );

    if (episodes.length) {
      episodes = await enrichProviderEpisodeThumbnails(episodes, {
        malId: options.malId,
        searchHints,
        posterUrl: options.posterUrl,
      });
    }

    return { episodes, enriched };
  } catch (err) {
    console.error("getAnimeInfo error:", err);
    return { episodes: [], enriched: false };
  }
}

/* ---------------- SERVERS ---------------- */
export async function getEpisodeServers(episodeId: EpisodeId) {
  try {
    return await streamProvider.servers(episodeId);
  } catch (err) {
    console.error("getEpisodeServers error:", err);
    return { servers: [] };
  }
}

/* ---------------- SOURCES ---------------- */
export async function getEpisodeWatchSources(
  episodeId: EpisodeId,
  server: string,
  category: StreamCategory,
) {
  try {
    return await streamProvider.sources(episodeId, server, category);
  } catch (err) {
    console.error("getEpisodeWatchSources error:", err);
    return { sources: [] };
  }
}
