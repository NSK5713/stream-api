import { ANIME, StreamingServers, SubOrSub } from "@consumet/extensions";
import type {
  EpisodeServer,
  EpisodeSourcesResponse,
  ProviderAnime,
  ProviderEpisode,
  StreamCategory,
} from "./provider";
import { fetchHianimeProviderSkip, skipTimesFromPayload } from "./provider-skip";

const hianime = new ANIME.Hianime();
const PROVIDER_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out`)), PROVIDER_TIMEOUT_MS);
    }),
  ]);
}

const STREAMING_SERVER_OPTIONS: { id: string; name: string; server: StreamingServers }[] = [
  { id: "vidcloud", name: "VidCloud", server: StreamingServers.VidCloud },
  { id: "vidstreaming", name: "VidStreaming", server: StreamingServers.VidStreaming },
  { id: "streamsb", name: "StreamSB", server: StreamingServers.StreamSB },
  { id: "streamtape", name: "StreamTape", server: StreamingServers.StreamTape },
];

function normalizeTitle(title: unknown): string {
  if (typeof title === "string") return title;
  if (title && typeof title === "object") {
    const record = title as Record<string, string | undefined>;
    return record.english || record.userPreferred || record.romaji || record.native || "Unknown";
  }
  return "Unknown";
}

function parseReleaseYear(releaseDate?: string): number | undefined {
  if (!releaseDate) return undefined;
  const year = Number(releaseDate.match(/\d{4}/)?.[0]);
  return Number.isFinite(year) ? year : undefined;
}

function mapCategory(category: StreamCategory): SubOrSub {
  if (category === "dub") return SubOrSub.DUB;
  return SubOrSub.SUB;
}

function mapServer(serverId: string): StreamingServers {
  const match = STREAMING_SERVER_OPTIONS.find((item) => item.id === serverId.toLowerCase());
  return match?.server ?? StreamingServers.VidCloud;
}

function buildServers(): EpisodeServer[] {
  const categories: StreamCategory[] = ["sub", "dub", "raw"];
  return STREAMING_SERVER_OPTIONS.flatMap((option) =>
    categories.map((category) => ({
      id: option.id,
      name: option.name,
      category,
    })),
  );
}

export const consumetHianimeProvider = {
  async search(query: string) {
    const data = await withTimeout(hianime.search(query), "HiAnime search");
    const results: ProviderAnime[] = data.results.map((item) => ({
      id: item.id,
      title: normalizeTitle(item.title),
      url: item.url,
      image: item.image,
      releaseYear: parseReleaseYear(item.releaseDate),
      type: typeof item.type === "string" ? item.type : undefined,
    }));
    return { results };
  },

  async episodes(animeId: string) {
    const info = await withTimeout(hianime.fetchAnimeInfo(animeId), "HiAnime anime info");
    const episodes: ProviderEpisode[] = (info.episodes ?? []).map((episode) => ({
      id: episode.id,
      number: episode.number,
      title: episode.title ?? `Episode ${episode.number}`,
      isFiller: episode.isFiller,
    }));
    return { episodes };
  },

  async servers(_episodeId: string) {
    return { servers: buildServers() };
  },

  async sources(episodeId: string, server: string, category: StreamCategory): Promise<EpisodeSourcesResponse> {
    const [result, ajaxSkip] = await Promise.all([
      withTimeout(
        hianime.fetchEpisodeSources(episodeId, mapServer(server), mapCategory(category)),
        "HiAnime episode sources",
      ),
      fetchHianimeProviderSkip(episodeId, server, category).catch(() => null),
    ]);
    const skip = skipTimesFromPayload(result) ?? ajaxSkip;
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
  },
};
