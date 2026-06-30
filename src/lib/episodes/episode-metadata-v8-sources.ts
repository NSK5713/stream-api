import { fetchAnilistIdentityAndEpisodes } from "../anilist/anilist-resolver";
import { fetchAnidbEpisodes } from "../anidb/anidb-episodes";
import { fetchJikanEpisodes } from "../jikan/jikan-episodes";
import { fetchTmdbEpisodes } from "../tmdb/tmdb-episodes";
import { allanimeProvider } from "../allanime-provider";
import { stripProviderPrefix } from "../consumet-providers";
import type { ProviderEpisode } from "../provider";
import type { EnrichedEpisode } from "./canonical-snapshot";
import type { EpisodeConfidenceSource } from "./episode-confidence";
import { toStrictIndexTitles, type IndexedEpisodeTitles } from "./episode-reconciler-v3";
import { V8_SOURCE_WEIGHTS } from "./episode-consensus-v8";

export type V8SourceBundle = {
  jikan?: EnrichedEpisode[];
  anilist?: EnrichedEpisode[];
  anidb?: EnrichedEpisode[];
  tmdb?: EnrichedEpisode[];
  sourceCounts: {
    jikan?: number;
    anilist?: number;
    anidb?: number;
    tmdb?: number;
    anilistEpisodeCount?: number | null;
    identityKnown: boolean;
  };
  identityHash: string;
};

function isUsableTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  const trimmed = title.trim();
  if (!trimmed) return false;
  return !/^Episode\s*\d+\s*$/i.test(trimmed);
}

function toIndexedFromMetadata(
  episodes: Array<{ title: string }>,
  maxCount: number,
): IndexedEpisodeTitles {
  return toStrictIndexTitles(
    episodes.map((episode) => episode.title),
    maxCount,
  );
}

function toEnrichedFromIndexed(
  base: EnrichedEpisode[],
  titles: IndexedEpisodeTitles,
  source: EpisodeConfidenceSource,
  weight: number,
): EnrichedEpisode[] {
  return base.map((episode) => {
    const rawTitle = titles[episode.number - 1];
    const usable = isUsableTitle(rawTitle);
    return {
      number: episode.number,
      title: usable ? rawTitle!.trim() : `Episode ${episode.number}`,
      id: episode.id,
      source,
      confidence: usable ? weight : 0.2,
    };
  });
}

function buildIdentityHash(anilistId: number | null, malId: number | null): string {
  if (!anilistId) return "unknown";
  return `${anilistId}:${malId ?? 0}`;
}

/** Parallel metadata fetch for V8 consensus — does not invoke V3 reconciliation. */
export async function fetchV8MetadataSources(
  animeId: string,
  allAnimeEpisodes: ProviderEpisode[],
  baseEpisodes: EnrichedEpisode[],
): Promise<V8SourceBundle> {
  const baseCount = allAnimeEpisodes.length;
  const empty: V8SourceBundle = {
    sourceCounts: { identityKnown: false },
    identityHash: "unknown",
  };

  try {
    const showId = stripProviderPrefix(animeId).id;
    const showName = await allanimeProvider.getShowName(showId).catch(() => null);
    if (!showName) return empty;

    const { identity, streamingTitles } = await fetchAnilistIdentityAndEpisodes(showName);
    const malId = identity?.malId ?? null;
    const identityKnown = Boolean(identity);

    const anilistTitles =
      identity && streamingTitles.length === baseCount
        ? toStrictIndexTitles(streamingTitles, baseCount)
        : Array.from({ length: baseCount }, () => null);

    const anilist = toEnrichedFromIndexed(
      baseEpisodes,
      anilistTitles,
      "anilist",
      V8_SOURCE_WEIGHTS.anilist,
    );

    if (!malId) {
      return {
        anilist,
        sourceCounts: {
          anilist: countUsable(anilist),
          anilistEpisodeCount: identity?.episodeCount ?? null,
          identityKnown,
        },
        identityHash: buildIdentityHash(identity?.anilistId ?? null, null),
      };
    }

    const [jikanEpisodes, anidbEpisodes, tmdbEpisodes] = await Promise.all([
      fetchJikanEpisodes(malId).catch(() => []),
      fetchAnidbEpisodes(malId).catch(() => []),
      fetchTmdbEpisodes(malId).catch(() => []),
    ]);

    const jikanIndexed = toIndexedFromMetadata(jikanEpisodes, baseCount);
    const anidbIndexed = toIndexedFromMetadata(anidbEpisodes, baseCount);
    const tmdbIndexed =
      process.env.TMDB_API_KEY?.trim() && tmdbEpisodes.length
        ? toIndexedFromMetadata(tmdbEpisodes, baseCount)
        : Array.from({ length: baseCount }, () => null);

    const jikan = toEnrichedFromIndexed(baseEpisodes, jikanIndexed, "jikan", V8_SOURCE_WEIGHTS.jikan);
    const anidb = toEnrichedFromIndexed(baseEpisodes, anidbIndexed, "anidb", V8_SOURCE_WEIGHTS.anidb);
    const tmdb = toEnrichedFromIndexed(baseEpisodes, tmdbIndexed, "tmdb", V8_SOURCE_WEIGHTS.tmdb);

    return {
      jikan,
      anilist,
      anidb,
      tmdb,
      sourceCounts: {
        jikan: jikanEpisodes.length,
        anilist: countUsable(anilist),
        anidb: anidbEpisodes.length,
        tmdb: tmdbEpisodes.length,
        anilistEpisodeCount: identity?.episodeCount ?? null,
        identityKnown,
      },
      identityHash: buildIdentityHash(identity?.anilistId ?? null, malId),
    };
  } catch {
    return empty;
  }
}

function countUsable(episodes: EnrichedEpisode[]): number {
  return episodes.filter((episode) => isUsableTitle(episode.title)).length;
}
