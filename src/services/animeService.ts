import { streamProvider, type StreamCategory } from "../../lib/provider";
import { STREAM_CACHE_TTL } from "../../lib/kv-cache";

export { STREAM_CACHE_TTL };

export async function searchAnime(query: string) {
  const data = (await streamProvider.search(query)) as {
    results?: unknown[];
    animes?: unknown[];
    data?: unknown[];
  };
  return data.results ?? data.animes ?? data.data ?? [];
}

export async function getAnimeInfo(animeId: string, searchHints: string[] = []) {
  const data = (await streamProvider.episodes(animeId, { searchHints })) as {
    episodes?: unknown[];
    data?: unknown[];
  };
  return data.episodes ?? data.data ?? [];
}

export async function getEpisodeServers(episodeId: string) {
  const data = (await streamProvider.servers(episodeId)) as {
    servers?: unknown[];
    data?: unknown[];
  };
  return data.servers ?? data.data ?? [];
}

export async function getEpisodeWatchSources(
  episodeId: string,
  server: string,
  category: StreamCategory,
) {
  return streamProvider.sources(episodeId, server, category);
}
