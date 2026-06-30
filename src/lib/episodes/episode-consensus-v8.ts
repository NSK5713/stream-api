import type { DisplayEpisode } from "../cache/canonical-episode-cache";
import { CONFIDENCE_DISPLAY_THRESHOLD } from "./episode-confidence";
import type { EnrichedEpisode } from "./canonical-snapshot";
import { detectEpisodeDrift } from "./drift-detector";

export type EpisodeSourceScore = {
  jikan: number;
  anilist: number;
  anidb: number;
  tmdb: number;
};

export const V8_SOURCE_WEIGHTS: EpisodeSourceScore = {
  jikan: 1.0,
  anilist: 1.0,
  anidb: 0.85,
  tmdb: 0.7,
};

type SourceKey = keyof EpisodeSourceScore;

const SOURCE_PRIORITY: SourceKey[] = ["jikan", "anilist", "anidb", "tmdb"];

export type ConsensusInput = {
  jikan?: EnrichedEpisode[];
  anilist?: EnrichedEpisode[];
  anidb?: EnrichedEpisode[];
  tmdb?: EnrichedEpisode[];
  base: EnrichedEpisode[];
  sourceCounts?: {
    jikan?: number;
    anilist?: number;
    anidb?: number;
    tmdb?: number;
    anilistEpisodeCount?: number | null;
    identityKnown?: boolean;
  };
};

export type ConsensusResult = {
  episodes: EnrichedEpisode[];
  confidenceScore: {
    identity: number;
    episode: number;
    title: number;
  };
  driftDetected: boolean;
};

function isUsableTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  const trimmed = title.trim();
  if (!trimmed) return false;
  return !/^Episode\s*\d+\s*$/i.test(trimmed);
}

function computeIdentityScore(
  drift: ReturnType<typeof detectEpisodeDrift>,
  identityKnown: boolean,
): number {
  if (!identityKnown) return 0.4;
  if (drift.reasons.includes("identity_episode_count_mismatch")) return 0.5;
  if (drift.reasons.includes("jikan!=anilist")) return 0.7;
  if (drift.drift) return 0.75;
  return 0.98;
}

function computeEpisodeScore(baseCount: number, sourceCounts: ConsensusInput["sourceCounts"]): number {
  if (baseCount <= 0) return 0;

  const counts = [
    sourceCounts?.jikan,
    sourceCounts?.anilist,
    sourceCounts?.anidb,
    sourceCounts?.tmdb,
  ].filter((count): count is number => count !== undefined && count > 0);

  if (!counts.length) return 0.5;

  const maxDelta = Math.max(...counts.map((count) => Math.abs(count - baseCount) / baseCount));
  return Math.max(0, 1 - maxDelta);
}

function pickEpisodeWinner(
  base: EnrichedEpisode,
  candidates: Array<{ source: SourceKey; episode: EnrichedEpisode }>,
): EnrichedEpisode {
  if (!candidates.length) {
    return {
      ...base,
      title: `Episode ${base.number}`,
      source: "fallback",
      confidence: 0.2,
    };
  }

  candidates.sort((left, right) => {
    if (right.episode.confidence !== left.episode.confidence) {
      return right.episode.confidence - left.episode.confidence;
    }
    return SOURCE_PRIORITY.indexOf(left.source) - SOURCE_PRIORITY.indexOf(right.source);
  });

  const winner = candidates[0].episode;
  return {
    number: base.number,
    title: winner.title,
    id: base.id,
    source: winner.source,
    confidence: winner.confidence,
  };
}

export function computeEpisodeConsensus(input: ConsensusInput): ConsensusResult {
  const { base } = input;
  const baseCount = base.length;

  const drift = detectEpisodeDrift({
    jikanCount: input.sourceCounts?.jikan ?? input.jikan?.length,
    anilistCount: input.sourceCounts?.anilist ?? input.anilist?.length,
    anidbCount: input.sourceCounts?.anidb ?? input.anidb?.length,
    tmdbCount: input.sourceCounts?.tmdb ?? input.tmdb?.length,
    baseCount,
    anilistEpisodeCount: input.sourceCounts?.anilistEpisodeCount,
    identityKnown: input.sourceCounts?.identityKnown ?? false,
  });

  const sources: Record<SourceKey, EnrichedEpisode[] | undefined> = {
    jikan: input.jikan,
    anilist: input.anilist,
    anidb: input.anidb,
    tmdb: input.tmdb,
  };

  const episodes = base.map((baseEpisode) => {
    const candidates = SOURCE_PRIORITY.flatMap((source) => {
      const list = sources[source];
      const episode = list?.find((entry) => entry.number === baseEpisode.number);
      if (!episode || !isUsableTitle(episode.title)) return [];
      return [{ source, episode: { ...episode, confidence: V8_SOURCE_WEIGHTS[source] } }];
    });

    return pickEpisodeWinner(baseEpisode, candidates);
  });

  const titleScore =
    episodes.length > 0
      ? episodes.reduce((sum, episode) => sum + episode.confidence, 0) / episodes.length
      : 0;

  const identityScore = computeIdentityScore(drift, input.sourceCounts?.identityKnown ?? false);
  const episodeScore = computeEpisodeScore(baseCount, input.sourceCounts);

  return {
    episodes,
    confidenceScore: {
      identity: identityScore,
      episode: episodeScore,
      title: titleScore,
    },
    driftDetected: drift.drift,
  };
}

export function toConsensusDisplay(
  episodes: EnrichedEpisode[],
  threshold = CONFIDENCE_DISPLAY_THRESHOLD,
): DisplayEpisode[] {
  return episodes.map((episode) => ({
    number: episode.number,
    title: episode.confidence >= threshold ? episode.title : `Episode ${episode.number}`,
    id: episode.id,
  }));
}

export function preferBetterDisplay(
  baseline: DisplayEpisode[],
  candidate: DisplayEpisode[],
  baselineScore: number,
  candidateScore: number,
): DisplayEpisode[] {
  if (candidateScore >= baselineScore) return candidate;
  return baseline;
}
