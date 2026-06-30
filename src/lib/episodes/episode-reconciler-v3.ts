import type { ProviderEpisode } from "../provider";
import {
  applyConfidenceDisplayGate,
  buildConfidenceMap,
  type EpisodeConfidence,
} from "./episode-confidence";

export type EpisodeMetaSource = "allanime" | "anilist" | "jikan" | "anidb" | "tmdb";

export type EpisodeTitleV3 = {
  number: number;
  title: string;
  source: EpisodeMetaSource;
  confidence: number;
};

export type IndexedEpisodeTitles = (string | null)[];

export type AnilistReconcileInput = {
  identity: {
    anilistId: number;
    malId: number | null;
    episodeCount: number | null;
  } | null;
  episodes: IndexedEpisodeTitles;
};

export type ReconcileEpisodeV3 = ProviderEpisode &
  EpisodeTitleV3 & {
    id: string;
    isFiller?: boolean;
  };

export type MergeEpisodeTitlesV3Input = {
  allAnimeEpisodes: ProviderEpisode[];
  anilist: AnilistReconcileInput;
  jikan: IndexedEpisodeTitles;
  anidb: IndexedEpisodeTitles;
  tmdb: IndexedEpisodeTitles;
  tmdbAvailable: boolean;
};

export type MergeEpisodeTitlesV3Result = {
  episodes: ReconcileEpisodeV3[];
  confidenceMap: Record<number, EpisodeConfidence>;
  sourceDistribution: Record<EpisodeMetaSource, number>;
};

function isUsableTitle(title: string | null | undefined): title is string {
  if (!title) return false;
  const trimmed = title.trim();
  if (!trimmed) return false;
  return !/^Episode\s*\d+\s*$/i.test(trimmed);
}

function atIndex(titles: IndexedEpisodeTitles, number: number): string | null {
  const index = number - 1;
  if (index < 0 || index >= titles.length) return null;
  const title = titles[index];
  return isUsableTitle(title) ? title.trim() : null;
}

function anidbCount(anidb: IndexedEpisodeTitles): number {
  return anidb.length;
}

export function mergeEpisodeTitlesV3(input: MergeEpisodeTitlesV3Input): MergeEpisodeTitlesV3Result {
  const sourceDistribution: Record<EpisodeMetaSource, number> = {
    allanime: 0,
    anilist: 0,
    jikan: 0,
    anidb: 0,
    tmdb: 0,
  };

  const jikanComplete = input.jikan.length >= input.allAnimeEpisodes.length;

  const preGateEpisodes: ReconcileEpisodeV3[] = input.allAnimeEpisodes.map((episode) => {
    let title = `Episode ${episode.number}`;
    let source: EpisodeMetaSource = "allanime";
    let confidence = 0.2;

    const anilistTitle = atIndex(input.anilist.episodes, episode.number);
    if (anilistTitle) {
      title = anilistTitle;
      source = "anilist";
      confidence = 0.95;
    }

    const jikanTitle = atIndex(input.jikan, episode.number);
    if (jikanTitle) {
      title = jikanTitle;
      source = "jikan";
      confidence = 1.0;
    }

    if (confidence < 0.9 && anidbCount(input.anidb) >= episode.number) {
      const anidbTitle = atIndex(input.anidb, episode.number);
      if (anidbTitle) {
        title = anidbTitle;
        source = "anidb";
        confidence = 0.9;
      }
    }

    const malMissingOrBroken = !input.anilist.identity?.malId || !jikanComplete;
    if (
      malMissingOrBroken &&
      input.tmdbAvailable &&
      confidence < 0.9 &&
      atIndex(input.tmdb, episode.number)
    ) {
      const tmdbTitle = atIndex(input.tmdb, episode.number);
      if (tmdbTitle) {
        title = tmdbTitle;
        source = "tmdb";
        confidence = 0.75;
      }
    }

    sourceDistribution[source] += 1;

    return {
      ...episode,
      number: episode.number,
      title,
      source,
      confidence,
    };
  });

  const confidenceMap = buildConfidenceMap(preGateEpisodes);
  const episodes = preGateEpisodes.map(applyConfidenceDisplayGate);

  return { episodes, confidenceMap, sourceDistribution };
}

export function toStrictIndexTitles(
  orderedTitles: string[],
  maxCount: number,
): IndexedEpisodeTitles {
  const result: IndexedEpisodeTitles = Array.from({ length: maxCount }, () => null);
  for (let index = 0; index < orderedTitles.length && index < maxCount; index += 1) {
    const title = orderedTitles[index]?.trim();
    result[index] = title ? title : null;
  }
  return result;
}

export function toAllanimeFallback(episodes: ProviderEpisode[]): ReconcileEpisodeV3[] {
  return episodes.map((episode) => ({
    ...episode,
    title: `Episode ${episode.number}`,
    source: "allanime" as const,
    confidence: 0.2,
  }));
}

export function logSourceDistribution(sourceDistribution: Record<EpisodeMetaSource, number>): void {
  const total = Object.values(sourceDistribution).reduce((sum, count) => sum + count, 0);
  if (total <= 0) return;

  const lines = (Object.entries(sourceDistribution) as [EpisodeMetaSource, number][])
    .filter(([, count]) => count > 0)
    .map(([source, count]) => `  ${source}: ${Math.round((count / total) * 100)}%`)
    .join("\n");

  console.info(`[v3-episode] final source distribution:\n${lines}`);
}
