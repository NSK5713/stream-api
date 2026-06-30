import { fetchWithTimeout } from "../fetch-timeout";
import {
  buildConsumetSearchQueries,
  pickBestConsumetMatch,
} from "../episode-title-utils";
import { getConsumetAdapter, withTimeout } from "../consumet-providers";
import type { ProviderEpisode } from "../provider";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w780";
const THUMBNAIL_ENRICH_TIMEOUT_MS = 8_000;
const HIANIME_THUMB_CONCURRENCY = 4;
const HIANIME_THUMB_EPISODE_CAP = 24;

const HIANIME_BASES = [
  "https://hianime.to",
  "https://hianime.sx",
  "https://hianime.bz",
  "https://hianime.pe",
  "https://hianime.cx",
];

const HIANIME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export type EpisodeThumbnailEnrichOptions = {
  malId?: number;
  searchHints?: string[];
  posterUrl?: string;
};

function readTmdbApiKey(): string | null {
  const key = process.env.TMDB_API_KEY?.trim();
  return key || null;
}

function episodesNeedThumbnails(episodes: ProviderEpisode[]): boolean {
  return episodes.some((episode) => !episode.thumbnail?.trim());
}

function mergeThumbnailMap(
  episodes: ProviderEpisode[],
  thumbsByNumber: Map<number, string>,
): ProviderEpisode[] {
  if (!thumbsByNumber.size) return episodes;
  return episodes.map((episode) => {
    if (episode.thumbnail?.trim()) return episode;
    const thumb = thumbsByNumber.get(episode.number)?.trim();
    return thumb ? { ...episode, thumbnail: thumb } : episode;
  });
}

async function fetchTmdbJson<T>(path: string, apiKey: string): Promise<T | null> {
  try {
    const response = await fetchWithTimeout(
      `https://api.themoviedb.org/3${path}${path.includes("?") ? "&" : "?"}api_key=${encodeURIComponent(apiKey)}`,
      { headers: { Accept: "application/json" } },
      6_000,
    );
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

type TmdbFindResponse = {
  tv_results?: Array<{ id: number; name?: string; original_name?: string }>;
};

type TmdbSeasonSummary = {
  season_number: number;
  episode_count: number;
  name?: string;
};

type TmdbShowDetails = {
  id: number;
  seasons?: TmdbSeasonSummary[];
};

type TmdbSeasonEpisode = {
  episode_number: number;
  still_path?: string | null;
};

type TmdbSeasonDetails = {
  episodes?: TmdbSeasonEpisode[];
};

function resolveTmdbSeasonNumber(
  seasons: TmdbSeasonSummary[],
  episodeCount: number,
  searchHints: string[],
): number | null {
  const candidates = seasons.filter((season) => season.season_number > 0);
  if (!candidates.length) return null;

  const hintText = searchHints.join(" ").toLowerCase();
  const seasonFromTitle = hintText.match(/(?:season|4th|3rd|2nd|1st)\s*(\d+)/i);
  const explicitSeason = seasonFromTitle ? Number(seasonFromTitle[1]) : NaN;
  if (Number.isFinite(explicitSeason) && explicitSeason > 0) {
    const match = candidates.find((season) => season.season_number === explicitSeason);
    if (match) return match.season_number;
  }

  const byCount = candidates.filter((season) => season.episode_count === episodeCount);
  if (byCount.length === 1) return byCount[0]!.season_number;
  if (byCount.length > 1) {
    return byCount.sort((a, b) => b.season_number - a.season_number)[0]!.season_number;
  }

  const closeCount = candidates
    .map((season) => ({
      season,
      delta: Math.abs(season.episode_count - episodeCount),
    }))
    .filter((item) => item.delta <= 3)
    .sort((a, b) => a.delta - b.delta || b.season.season_number - a.season.season_number);

  if (closeCount.length) return closeCount[0]!.season.season_number;

  return candidates.sort((a, b) => b.season_number - a.season_number)[0]!.season_number;
}

async function fetchTmdbEpisodeThumbnails(
  malId: number,
  episodeCount: number,
  searchHints: string[],
): Promise<Map<number, string>> {
  const apiKey = readTmdbApiKey();
  if (!apiKey || !Number.isFinite(malId) || malId <= 0) return new Map();

  const find = await fetchTmdbJson<TmdbFindResponse>(
    `/find/${malId}?external_source=myanimelist_id`,
    apiKey,
  );
  const tvId = find?.tv_results?.[0]?.id;
  if (!tvId) return new Map();

  const show = await fetchTmdbJson<TmdbShowDetails>(`/tv/${tvId}`, apiKey);
  const seasons = show?.seasons ?? [];
  const seasonNumber = resolveTmdbSeasonNumber(seasons, episodeCount, searchHints);
  if (!seasonNumber) return new Map();

  const season = await fetchTmdbJson<TmdbSeasonDetails>(`/tv/${tvId}/season/${seasonNumber}`, apiKey);
  const thumbs = new Map<number, string>();
  for (const episode of season?.episodes ?? []) {
    const still = episode.still_path?.trim();
    if (!still || !Number.isFinite(episode.episode_number) || episode.episode_number <= 0) continue;
    thumbs.set(episode.episode_number, `${TMDB_IMAGE_BASE}${still}`);
  }
  return thumbs;
}

function parseOgImage(html: string): string | null {
  const match =
    html.match(/property="og:image"\s+content="([^"]+)"/i) ??
    html.match(/content="([^"]+)"\s+property="og:image"/i);
  return match?.[1]?.trim() || null;
}

function stripProviderPrefix(value: string): string {
  const colon = value.indexOf(":");
  return colon > 0 ? value.slice(colon + 1) : value;
}

function parseHianimeEpisodeRef(
  episodeId: string,
): { slug: string; episodeNumericId: string } | null {
  const raw = stripProviderPrefix(episodeId);
  const match = raw.match(/^(.*)\$episode\$(\d+)/i);
  if (!match) return null;
  return { slug: match[1].replace(/\$(auto|sub|dub)$/i, ""), episodeNumericId: match[2] };
}

async function fetchHianimeHtml(path: string, referer?: string): Promise<string | null> {
  for (const base of HIANIME_BASES) {
    try {
      const response = await fetchWithTimeout(`${base}${path}`, {
        headers: {
          "User-Agent": HIANIME_UA,
          Accept: "text/html,application/json,*/*",
          ...(referer ? { Referer: referer } : {}),
          ...(path.startsWith("/ajax/") ? { "X-Requested-With": "XMLHttpRequest" } : {}),
        },
      }, 6_000);
      if (!response.ok) continue;
      const text = await response.text();
      if (path.includes("/ajax/")) {
        try {
          const json = JSON.parse(text) as { html?: string };
          return json.html ?? text;
        } catch {
          return text;
        }
      }
      return text;
    } catch {
      // try next mirror
    }
  }
  return null;
}

function parseHianimeEpisodeList(html: string): Array<{ id: string; number: number }> {
  const episodes = new Map<number, { id: string; number: number }>();
  for (const match of html.matchAll(/<a[^>]*data-id="(\d+)"[^>]*data-number="(\d+)"/g)) {
    episodes.set(Number(match[2]), { id: match[1], number: Number(match[2]) });
  }
  for (const match of html.matchAll(/<a[^>]*data-number="(\d+)"[^>]*data-id="(\d+)"/g)) {
    episodes.set(Number(match[1]), { id: match[2], number: Number(match[1]) });
  }
  return [...episodes.values()].sort((a, b) => a.number - b.number);
}

async function resolveHianimeShowSlug(searchHints: string[]): Promise<{ slug: string; dataId: string } | null> {
  const hianime = getConsumetAdapter("hianime");
  if (!hianime) return null;

  const queries = buildConsumetSearchQueries(searchHints[0] ?? "", searchHints);
  for (const query of queries) {
    try {
      const search = await withTimeout(hianime.search(query), "HiAnime search", 10_000);
      const match = pickBestConsumetMatch(search.results, query);
      if (!match?.id) continue;
      const rawId = stripProviderPrefix(match.id);
      const dataId = rawId.split("-").pop() ?? "";
      if (!dataId) continue;
      return { slug: rawId, dataId };
    } catch {
      // try next query
    }
  }
  return null;
}

async function fetchHianimeWatchOgImage(slug: string, episodeNumericId: string): Promise<string | null> {
  for (const base of HIANIME_BASES) {
    const html = await fetchHianimeHtml(`/watch/${slug}?ep=${episodeNumericId}`, `${base}/${slug}`);
    if (!html) continue;
    const image = parseOgImage(html);
    if (image) return image;
  }
  return null;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function runWorker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runWorker()));
  return results;
}

async function fetchHianimeEpisodeThumbnails(
  episodes: ProviderEpisode[],
  searchHints: string[],
  posterUrl?: string,
): Promise<Map<number, string>> {
  const targets = episodes.filter((episode) => !episode.thumbnail?.trim()).slice(0, HIANIME_THUMB_EPISODE_CAP);
  if (!targets.length) return new Map();

  const byNumber = new Map<number, string>();
  const directTargets: Array<{ number: number; slug: string; episodeNumericId: string }> = [];

  for (const episode of targets) {
    const ref = parseHianimeEpisodeRef(episode.id);
    if (ref) {
      directTargets.push({ number: episode.number, slug: ref.slug, episodeNumericId: ref.episodeNumericId });
    }
  }

  if (!directTargets.length && searchHints.length) {
    const show = await resolveHianimeShowSlug(searchHints);
    if (show) {
      const listHtml = await fetchHianimeHtml(
        `/ajax/v2/episode/list/${show.dataId}`,
        `${HIANIME_BASES[0]}/${show.slug}`,
      );
      const listed = listHtml ? parseHianimeEpisodeList(listHtml) : [];
      const listedByNumber = new Map(listed.map((item) => [item.number, item.id]));
      for (const episode of targets) {
        const episodeNumericId = listedByNumber.get(episode.number);
        if (episodeNumericId) {
          directTargets.push({
            number: episode.number,
            slug: show.slug,
            episodeNumericId,
          });
        }
      }
    }
  }

  if (!directTargets.length) return byNumber;

  const fetched = await mapWithConcurrency(directTargets, HIANIME_THUMB_CONCURRENCY, async (target) => {
    const image = await fetchHianimeWatchOgImage(target.slug, target.episodeNumericId);
    return { number: target.number, image };
  });

  const uniqueImages = new Set<string>();
  for (const item of fetched) {
    const image = item.image?.trim();
    if (!image) continue;
    if (posterUrl && image === posterUrl) continue;
    uniqueImages.add(image);
    byNumber.set(item.number, image);
  }

  if (uniqueImages.size <= 1 && byNumber.size > 1) return new Map();

  return byNumber;
}

/** Attach TMDB stills and/or HiAnime watch previews when catalog episodes lack art. */
export async function enrichProviderEpisodeThumbnails(
  episodes: ProviderEpisode[],
  options: EpisodeThumbnailEnrichOptions = {},
): Promise<ProviderEpisode[]> {
  if (!episodes.length || !episodesNeedThumbnails(episodes)) return episodes;

  const searchHints = options.searchHints?.filter(Boolean) ?? [];
  const enrichPromise = (async () => {
    let enriched = episodes;

    if (options.malId && options.malId > 0) {
      const tmdbThumbs = await fetchTmdbEpisodeThumbnails(
        options.malId,
        episodes.length,
        searchHints,
      );
      enriched = mergeThumbnailMap(enriched, tmdbThumbs);
    }

    if (episodesNeedThumbnails(enriched) && searchHints.length) {
      const hianimeThumbs = await fetchHianimeEpisodeThumbnails(
        enriched,
        searchHints,
        options.posterUrl,
      );
      enriched = mergeThumbnailMap(enriched, hianimeThumbs);
    }

    return enriched;
  })();

  return Promise.race([
    enrichPromise,
    new Promise<ProviderEpisode[]>((resolve) => {
      setTimeout(() => resolve(episodes), THUMBNAIL_ENRICH_TIMEOUT_MS);
    }),
  ]);
}
