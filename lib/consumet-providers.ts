import { ANIME, StreamingServers, SubOrSub } from "@consumet/extensions";
import type {
  EpisodeServer,
  EpisodeSourcesResponse,
  ProviderAnime,
  ProviderEpisode,
  StreamCategory,
} from "./provider";
import { fetchHianimeProviderSkip, skipTimesFromPayload, type ProviderSkipTimes } from "./provider-skip";

export const PROVIDER_TIMEOUT_MS = 28_000;
export const SEARCH_TIMEOUT_MS = 10_000;
export const EPISODES_TIMEOUT_MS = 18_000;
export const SOURCES_TIMEOUT_MS = 32_000;

export function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs: number = PROVIDER_TIMEOUT_MS,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    }),
  ]);
}

export function normalizeTitle(title: unknown): string {
  if (typeof title === "string") return title;
  if (title && typeof title === "object") {
    const record = title as Record<string, string | undefined>;
    return record.english || record.userPreferred || record.romaji || record.native || "Unknown";
  }
  return "Unknown";
}

export function parseReleaseYear(releaseDate?: string): number | undefined {
  if (!releaseDate) return undefined;
  const year = Number(releaseDate.match(/\d{4}/)?.[0]);
  return Number.isFinite(year) ? year : undefined;
}

export function mapCategory(category: StreamCategory): SubOrSub {
  if (category === "dub") return SubOrSub.DUB;
  return SubOrSub.SUB;
}

export function prefixProviderId(provider: string, id: string): string {
  return `${provider}:${id}`;
}

export function parseProviderId(value: string): { provider: string; id: string } | null {
  const index = value.indexOf(":");
  if (index <= 0) return null;
  return { provider: value.slice(0, index), id: value.slice(index + 1) };
}

const DEFAULT_SERVERS: { id: string; name: string; server: StreamingServers }[] = [
  { id: "vidcloud", name: "VidCloud", server: StreamingServers.VidCloud },
  { id: "vidstreaming", name: "VidStreaming", server: StreamingServers.VidStreaming },
  { id: "streamsb", name: "StreamSB", server: StreamingServers.StreamSB },
  { id: "streamtape", name: "StreamTape", server: StreamingServers.StreamTape },
  { id: "megaup", name: "MegaUp", server: StreamingServers.MegaUp },
];

function mapServer(serverId: string): StreamingServers {
  const match = DEFAULT_SERVERS.find((item) => item.id === serverId.toLowerCase());
  return match?.server ?? StreamingServers.VidCloud;
}

export function buildDefaultServers(): EpisodeServer[] {
  const categories: StreamCategory[] = ["sub", "dub", "raw"];
  return DEFAULT_SERVERS.flatMap((option) =>
    categories.map((category) => ({
      id: option.id,
      name: option.name,
      category,
    })),
  );
}

function mapSourceResponse(
  result: {
    sources: { url: string; quality?: string; isM3U8?: boolean }[];
    subtitles?: { url: string; lang: string }[];
    headers?: Record<string, string>;
    intro?: unknown;
    outro?: unknown;
  },
  providerSkip?: ProviderSkipTimes | null,
): EpisodeSourcesResponse {
  const skip = providerSkip ?? skipTimesFromPayload(result);
  return {
    sources: result.sources.map((video) => ({
      url: video.url,
      type: video.isM3U8 ? "hls" : "mp4",
      quality: video.quality,
      isM3U8: video.isM3U8,
    })),
    subtitles: result.subtitles?.map((subtitle) => ({
      url: subtitle.url,
      lang: subtitle.lang,
    })),
    headers: result.headers,
    skip: skip ?? undefined,
  };
}

async function attachHianimeSkip(
  episodeId: string,
  server: string,
  category: StreamCategory,
  mapped: EpisodeSourcesResponse,
  prefetchedSkip?: ProviderSkipTimes | null,
): Promise<EpisodeSourcesResponse> {
  if (mapped.skip?.intro || mapped.skip?.outro) return mapped;
  const skip =
    prefetchedSkip !== undefined
      ? prefetchedSkip
      : await fetchHianimeProviderSkip(episodeId, server, category);
  if (!skip) return mapped;
  return { ...mapped, skip };
}

type ConsumetProviderAdapter = {
  key: string;
  search: (query: string) => Promise<{ results: ProviderAnime[] }>;
  episodes: (animeId: string) => Promise<{ episodes: ProviderEpisode[] }>;
  servers: (episodeId: string, category: StreamCategory) => Promise<{ servers: EpisodeServer[] }>;
  sources: (episodeId: string, server: string, category: StreamCategory) => Promise<EpisodeSourcesResponse>;
};

function createAnimeKaiAdapter(): ConsumetProviderAdapter {
  const client = new ANIME.AnimeKai();
  return {
    key: "animekai",
    async search(query) {
      const data = await withTimeout(client.search(query), "AnimeKai search");
      return {
        results: data.results.map((item) => ({
          id: prefixProviderId("animekai", item.id),
          title: normalizeTitle(item.title),
          url: item.url,
          image: item.image,
          releaseYear: parseReleaseYear(item.releaseDate),
        })),
      };
    },
    async episodes(animeId) {
      const info = await withTimeout(client.fetchAnimeInfo(animeId), "AnimeKai anime info");
      return {
        episodes: (info.episodes ?? []).map((episode) => ({
          id: prefixProviderId("animekai", episode.id),
          number: episode.number,
          title: episode.title ?? `Episode ${episode.number}`,
          isFiller: episode.isFiller,
        })),
      };
    },
    async servers() {
      return { servers: buildDefaultServers() };
    },
    async sources(episodeId, server, category) {
      const result = await withTimeout(
        client.fetchEpisodeSources(episodeId, mapServer(server), mapCategory(category)),
        "AnimeKai episode sources",
      );
      return mapSourceResponse(result);
    },
  };
}

function createHianimeAdapter(): ConsumetProviderAdapter {
  const client = new ANIME.Hianime();
  return {
    key: "hianime",
    async search(query) {
      const data = await withTimeout(client.search(query), "HiAnime search");
      return {
        results: data.results.map((item) => ({
          id: prefixProviderId("hianime", item.id),
          title: normalizeTitle(item.title),
          url: item.url,
          image: item.image,
          releaseYear: parseReleaseYear(item.releaseDate),
        })),
      };
    },
    async episodes(animeId) {
      const info = await withTimeout(client.fetchAnimeInfo(animeId), "HiAnime anime info");
      return {
        episodes: (info.episodes ?? []).map((episode) => ({
          id: prefixProviderId("hianime", episode.id),
          number: episode.number,
          title: episode.title ?? `Episode ${episode.number}`,
          isFiller: episode.isFiller,
        })),
      };
    },
    async servers() {
      return { servers: buildDefaultServers() };
    },
    async sources(episodeId, server, category) {
      const [result, providerSkip] = await Promise.all([
        withTimeout(
          client.fetchEpisodeSources(episodeId, mapServer(server), mapCategory(category)),
          "HiAnime episode sources",
          SOURCES_TIMEOUT_MS,
        ),
        fetchHianimeProviderSkip(episodeId, server, category).catch(() => null),
      ]);
      const mapped = mapSourceResponse(result, providerSkip);
      return attachHianimeSkip(episodeId, server, category, mapped, providerSkip);
    },
  };
}

function createAnimePaheAdapter(): ConsumetProviderAdapter {
  const client = new ANIME.AnimePahe();
  return {
    key: "animepahe",
    async search(query) {
      const data = await withTimeout(client.search(query), "AnimePahe search");
      return {
        results: data.results.map((item) => ({
          id: prefixProviderId("animepahe", item.id),
          title: normalizeTitle(item.title),
          url: item.url,
          image: item.image,
          releaseYear: parseReleaseYear(item.releaseDate),
        })),
      };
    },
    async episodes(animeId) {
      const info = await withTimeout(client.fetchAnimeInfo(animeId), "AnimePahe anime info");
      return {
        episodes: (info.episodes ?? []).map((episode) => ({
          id: prefixProviderId("animepahe", episode.id),
          number: episode.number,
          title: episode.title ?? `Episode ${episode.number}`,
          isFiller: episode.isFiller,
        })),
      };
    },
    async servers() {
      return {
        servers: [
          { id: "default", name: "Default", category: "sub" },
          { id: "default", name: "Default", category: "dub" },
          { id: "default", name: "Default", category: "raw" },
        ],
      };
    },
    async sources(episodeId, _server, _category) {
      const result = await withTimeout(client.fetchEpisodeSources(episodeId), "AnimePahe episode sources");
      return mapSourceResponse(result);
    },
  };
}

function createKickAssAnimeAdapter(): ConsumetProviderAdapter {
  const client = new ANIME.KickAssAnime();
  return {
    key: "kickassanime",
    async search(query) {
      const data = await withTimeout(client.search(query), "KickAssAnime search");
      return {
        results: data.results.map((item) => ({
          id: prefixProviderId("kickassanime", item.id),
          title: normalizeTitle(item.title),
          url: item.url,
          image: item.image,
          releaseYear: parseReleaseYear(item.releaseDate),
        })),
      };
    },
    async episodes(animeId) {
      const info = await withTimeout(client.fetchAnimeInfo(animeId), "KickAssAnime anime info");
      return {
        episodes: (info.episodes ?? []).map((episode) => ({
          id: prefixProviderId("kickassanime", String(episode.id)),
          number: episode.number,
          title: episode.title ?? `Episode ${episode.number}`,
          isFiller: episode.isFiller,
        })),
      };
    },
    async servers(episodeId) {
      try {
        const servers = await withTimeout(client.fetchEpisodeServers(episodeId), "KickAssAnime episode servers");
        if (servers.length) {
          return {
            servers: servers.flatMap((server) =>
              (["sub", "dub", "raw"] as StreamCategory[]).map((category) => ({
                id: server.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                name: server.name,
                category,
              })),
            ),
          };
        }
      } catch {
        // Fall back to default server list.
      }
      return { servers: buildDefaultServers() };
    },
    async sources(episodeId, server, _category) {
      const result = await withTimeout(
        client.fetchEpisodeSources(episodeId, server.replace(/-/g, " ")),
        "KickAssAnime episode sources",
      );
      return mapSourceResponse(result);
    },
  };
}

export const consumetAdapters: ConsumetProviderAdapter[] = [
  createAnimeKaiAdapter(),
  createHianimeAdapter(),
  createAnimePaheAdapter(),
  createKickAssAnimeAdapter(),
];

export function getConsumetAdapter(provider: string): ConsumetProviderAdapter | null {
  return consumetAdapters.find((adapter) => adapter.key === provider) ?? null;
}

export function stripProviderPrefix(prefixedId: string): { provider: string; id: string } {
  const parsed = parseProviderId(prefixedId);
  if (!parsed) throw new Error(`Invalid provider id: ${prefixedId}`);
  return parsed;
}
