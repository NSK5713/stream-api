import type { CanonicalEpisodeMeta } from "../cache/canonical-cache-store";
import type { DisplayEpisode, RawEpisode } from "../cache/canonical-episode-cache";
import type { ProviderEpisode } from "../provider";
import {
  CONFIDENCE_DISPLAY_THRESHOLD,
  type EpisodeConfidenceSource,
} from "./episode-confidence";
import type { ReconcileEpisodeV3 } from "./episode-reconciler-v3";

export type EnrichedEpisode = {
  number: number;
  title: string;
  id: string;
  source: EpisodeConfidenceSource;
  confidence: number;
};

export type CanonicalEpisodeSnapshot = {
  animeId: string;
  identityHash: string;
  episodes: EnrichedEpisode[];
  avgConfidence: number;
  createdAt: number;
  baseEpisodeCount: number;
};

function toConfidenceSource(source: ReconcileEpisodeV3["source"]): EpisodeConfidenceSource {
  return source === "allanime" ? "fallback" : source;
}

export function toEnrichedEpisodes(episodes: ReconcileEpisodeV3[]): EnrichedEpisode[] {
  return episodes.map((episode) => ({
    number: episode.number,
    title: episode.title,
    id: episode.id,
    source: toConfidenceSource(episode.source),
    confidence: episode.confidence,
  }));
}

export function createAllanimeFallbackSnapshot(
  animeId: string,
  allAnimeEpisodes: ProviderEpisode[],
  identityHash: string,
): CanonicalEpisodeSnapshot {
  const episodes: EnrichedEpisode[] = allAnimeEpisodes.map((episode) => ({
    number: episode.number,
    title: `Episode ${episode.number}`,
    id: episode.id,
    source: "fallback",
    confidence: 0.2,
  }));

  return createSnapshot(animeId, episodes, identityHash, allAnimeEpisodes.length);
}

export function createSnapshot(
  animeId: string,
  episodes: EnrichedEpisode[],
  identityHash: string,
  baseEpisodeCount?: number,
): CanonicalEpisodeSnapshot {
  const count = baseEpisodeCount ?? episodes.length;
  const avgConfidence =
    episodes.length > 0
      ? episodes.reduce((sum, episode) => sum + episode.confidence, 0) / episodes.length
      : 0;

  return {
    animeId,
    identityHash: identityHash || "unknown",
    episodes,
    avgConfidence,
    createdAt: Date.now(),
    baseEpisodeCount: count,
  };
}

export function validateSnapshot(snapshot: CanonicalEpisodeSnapshot): boolean {
  const { episodes, baseEpisodeCount } = snapshot;

  if (episodes.length === 0 || episodes.length !== baseEpisodeCount) {
    return false;
  }

  const seen = new Set<number>();

  for (const episode of episodes) {
    if (!Number.isInteger(episode.number) || episode.number < 1) {
      return false;
    }
    if (seen.has(episode.number)) {
      return false;
    }
    seen.add(episode.number);
  }

  for (let index = 1; index <= baseEpisodeCount; index++) {
    if (!seen.has(index)) {
      return false;
    }
  }

  return true;
}

export function deriveRaw(snapshot: CanonicalEpisodeSnapshot): RawEpisode[] {
  return snapshot.episodes.map((episode) => ({
    number: episode.number,
    title: episode.title,
    source: episode.source,
    confidence: episode.confidence,
  }));
}

export function deriveDisplay(
  snapshot: CanonicalEpisodeSnapshot,
  threshold = CONFIDENCE_DISPLAY_THRESHOLD,
): DisplayEpisode[] {
  return snapshot.episodes.map((episode) => {
    if (episode.confidence >= threshold) {
      return {
        number: episode.number,
        title: episode.title,
        id: episode.id,
      };
    }

    return {
      number: episode.number,
      title: `Episode ${episode.number}`,
      id: episode.id,
    };
  });
}

export function deriveMeta(snapshot: CanonicalEpisodeSnapshot): CanonicalEpisodeMeta {
  return {
    animeId: snapshot.animeId,
    identityHash: snapshot.identityHash,
    avgConfidence: snapshot.avgConfidence,
    enriched: true,
    timestamp: snapshot.createdAt,
  };
}
