import type { AnilistIdentity } from "../anilist/anilist-resolver";
import { fetchAnilistIdentityAndEpisodes } from "../anilist/anilist-resolver";
import { fetchAnidbEpisodes } from "../anidb/anidb-episodes";
import { fetchJikanEpisodes } from "../jikan/jikan-episodes";
import { fetchTmdbEpisodes } from "../tmdb/tmdb-episodes";
import { allanimeProvider } from "../allanime-provider";
import { stripProviderPrefix } from "../consumet-providers";
import type { ProviderEpisode } from "../provider";
import {
  logSourceDistribution,
  mergeEpisodeTitlesV3,
  toAllanimeFallback,
  toStrictIndexTitles,
  type AnilistReconcileInput,
  type IndexedEpisodeTitles,
  type ReconcileEpisodeV3,
} from "./episode-reconciler-v3";

const ENRICHMENT_BUDGET_MS = 8_000;

function toIndexedFromMetadata(
  episodes: Array<{ title: string }>,
  maxCount: number,
): IndexedEpisodeTitles {
  return toStrictIndexTitles(
    episodes.map((episode) => episode.title),
    maxCount,
  );
}

function buildAnilistInput(
  identity: AnilistIdentity | null,
  streamingTitles: string[],
  allAnimeCount: number,
): AnilistReconcileInput {
  const episodes =
    identity && streamingTitles.length === allAnimeCount
      ? toStrictIndexTitles(streamingTitles, allAnimeCount)
      : Array.from({ length: allAnimeCount }, () => null);

  return {
    identity: identity
      ? {
          anilistId: identity.anilistId,
          malId: identity.malId,
          episodeCount: identity.episodeCount,
        }
      : null,
    episodes,
  };
}

async function loadMetadata(
  showName: string,
  allAnimeCount: number,
): Promise<{
  anilist: AnilistReconcileInput;
  jikan: IndexedEpisodeTitles;
  anidb: IndexedEpisodeTitles;
  tmdb: IndexedEpisodeTitles;
  tmdbAvailable: boolean;
  anidbSkippedReason: string | null;
}> {
  const { identity, streamingTitles } = await fetchAnilistIdentityAndEpisodes(showName);
  console.info("[v3-episode] anilist resolved");

  const anilist = buildAnilistInput(identity, streamingTitles, allAnimeCount);
  const malId = identity?.malId ?? null;

  let jikan: IndexedEpisodeTitles = Array.from({ length: allAnimeCount }, () => null);
  let anidb: IndexedEpisodeTitles = Array.from({ length: allAnimeCount }, () => null);
  let tmdb: IndexedEpisodeTitles = Array.from({ length: allAnimeCount }, () => null);
  let tmdbAvailable = false;
  let anidbSkippedReason: string | null = null;

  if (!malId) {
    anidbSkippedReason = "missing malId";
    return { anilist, jikan, anidb, tmdb, tmdbAvailable, anidbSkippedReason };
  }

  const [jikanEpisodes, anidbEpisodes, tmdbEpisodes] = await Promise.all([
    fetchJikanEpisodes(malId).catch(() => []),
    fetchAnidbEpisodes(malId).catch(() => []),
    fetchTmdbEpisodes(malId).catch(() => []),
  ]);

  jikan = toIndexedFromMetadata(jikanEpisodes, allAnimeCount);
  console.info(`[v3-episode] jikan episodes loaded: ${jikanEpisodes.length}`);

  if (!process.env.ANIDB_CLIENT?.trim()) {
    anidbSkippedReason = "ANIDB_CLIENT not configured";
  } else if (!anidbEpisodes.length) {
    anidbSkippedReason = "no anidb episodes returned";
  } else {
    anidb = toIndexedFromMetadata(anidbEpisodes, allAnimeCount);
  }

  if (process.env.TMDB_API_KEY?.trim() && tmdbEpisodes.length) {
    tmdbAvailable = true;
    tmdb = toIndexedFromMetadata(tmdbEpisodes, allAnimeCount);
  }

  return { anilist, jikan, anidb, tmdb, tmdbAvailable, anidbSkippedReason };
}

export type ResolveEpisodeTitlesV3Result = {
  episodes: ReconcileEpisodeV3[];
  identityHash: string;
  confidenceMap: Record<number, import("./episode-confidence").EpisodeConfidence>;
};

function buildIdentityHash(identity: AnilistReconcileInput["identity"]): string {
  if (!identity) return "unknown";
  return `${identity.anilistId}:${identity.malId ?? 0}`;
}

export async function resolveEpisodeTitlesV3(
  animeId: string,
  allAnimeEpisodes: ProviderEpisode[],
): Promise<ResolveEpisodeTitlesV3Result> {
  const fallbackEpisodes = toAllanimeFallback(allAnimeEpisodes);

  try {
    const showId = stripProviderPrefix(animeId).id;
    const showName = await allanimeProvider.getShowName(showId).catch(() => null);
    if (!showName) {
      return { episodes: fallbackEpisodes, identityHash: "unknown", confidenceMap: {} };
    }

    const metadata = await Promise.race([
      loadMetadata(showName, allAnimeEpisodes.length),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), ENRICHMENT_BUDGET_MS);
      }),
    ]);

    if (!metadata) {
      console.info("[v3-episode] enrichment timed out — returning AllAnime structure only");
      return { episodes: fallbackEpisodes, identityHash: "unknown", confidenceMap: {} };
    }

    if (!metadata.anilist.identity) {
      console.info("[v3-episode] anilist identity unavailable — returning AllAnime structure only");
      return { episodes: fallbackEpisodes, identityHash: "unknown", confidenceMap: {} };
    }

    if (metadata.anidbSkippedReason) {
      console.info(`[v3-episode] anidb skipped (${metadata.anidbSkippedReason})`);
    }

    const { episodes, confidenceMap, sourceDistribution } = mergeEpisodeTitlesV3({
      allAnimeEpisodes,
      anilist: metadata.anilist,
      jikan: metadata.jikan,
      anidb: metadata.anidb,
      tmdb: metadata.tmdb,
      tmdbAvailable: metadata.tmdbAvailable,
    });

    logSourceDistribution(sourceDistribution);
    return {
      episodes,
      identityHash: buildIdentityHash(metadata.anilist.identity),
      confidenceMap,
    };
  } catch {
    return { episodes: fallbackEpisodes, identityHash: "unknown", confidenceMap: {} };
  }
}
