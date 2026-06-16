import { streamProvider, type StreamCategory } from "../lib/provider";
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
export async function getAnimeInfo(animeId: string) {
  try {
    const res = await streamProvider.episodes(animeId);
    return (res as any)?.episodes ?? (res as any)?.data ?? [];
  } catch (err) {
    console.error("getAnimeInfo error:", err);
    return [];
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
    return await streamProvider.sources(
      episodeId,
      server,
      category,
    );
  } catch (err) {
    console.error("getEpisodeWatchSources error:", err);
    return { sources: [] };
  }
}