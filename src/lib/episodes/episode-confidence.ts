import type { ProviderEpisode } from "../provider";
import type { ReconcileEpisodeV3 } from "./episode-reconciler-v3";
import type { DisplayEpisode, RawEpisode } from "../cache/canonical-episode-cache";

export const CONFIDENCE_DISPLAY_THRESHOLD = 0.85;

export type EpisodeConfidenceSource = "anilist" | "jikan" | "anidb" | "tmdb" | "fallback";

export type EpisodeConfidence = {
  episodeNumber: number;
  title: string;
  source: EpisodeConfidenceSource;
  confidence: number;
  reason?: string;
};

export function isDisplayableConfidence(confidence: number): boolean {
  return confidence >= CONFIDENCE_DISPLAY_THRESHOLD;
}

/** Gate display title — only trusted confidence (>= 0.85) surfaces real titles. */
export function applyConfidenceDisplayGate(episode: ReconcileEpisodeV3): ReconcileEpisodeV3 {
  if (isDisplayableConfidence(episode.confidence)) {
    return episode;
  }

  return {
    ...episode,
    title: `Episode ${episode.number}`,
    source: "allanime",
    confidence: 0.2,
  };
}

export function buildConfidenceMap(episodes: ReconcileEpisodeV3[]): Record<number, EpisodeConfidence> {
  const map: Record<number, EpisodeConfidence> = {};

  for (const episode of episodes) {
    const source: EpisodeConfidenceSource =
      episode.source === "allanime" ? "fallback" : episode.source;

    map[episode.number] = {
      episodeNumber: episode.number,
      title: episode.title,
      source,
      confidence: episode.confidence,
      reason: isDisplayableConfidence(episode.confidence) ? undefined : "below_threshold",
    };
  }

  return map;
}

export function buildNumericConfidenceMap(
  confidenceMap: Record<number, EpisodeConfidence>,
): Record<number, number> {
  const numeric: Record<number, number> = {};
  for (const [number, entry] of Object.entries(confidenceMap)) {
    numeric[Number(number)] = entry.confidence;
  }
  return numeric;
}

export function buildRawEpisodes(
  allAnimeEpisodes: ProviderEpisode[],
  confidenceMap: Record<number, EpisodeConfidence>,
): RawEpisode[] {
  return allAnimeEpisodes.map((episode) => {
    const meta = confidenceMap[episode.number];
    if (!meta) {
      return {
        number: episode.number,
        title: `Episode ${episode.number}`,
        source: "fallback" as const,
        confidence: 0.2,
      };
    }

    return {
      number: episode.number,
      title: meta.title,
      source: meta.source,
      confidence: meta.confidence,
    };
  });
}

/** UI-safe display layer — enrichment discarded when confidence < 0.85. */
export function buildDisplayEpisodes(
  allAnimeEpisodes: ProviderEpisode[],
  rawEpisodes: RawEpisode[],
): DisplayEpisode[] {
  const rawByNumber = new Map(rawEpisodes.map((episode) => [episode.number, episode]));

  return allAnimeEpisodes.map((episode) => {
    const raw = rawByNumber.get(episode.number);
    if (raw && isDisplayableConfidence(raw.confidence)) {
      return {
        number: episode.number,
        title: raw.title,
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

export function averageConfidence(rawEpisodes: RawEpisode[]): number {
  if (!rawEpisodes.length) return 0;
  const total = rawEpisodes.reduce((sum, episode) => sum + episode.confidence, 0);
  return total / rawEpisodes.length;
}

export function toAllanimeDisplayFallback(
  episodes: Array<{ id: string; number: number }>,
): DisplayEpisode[] {
  return episodes.map((episode) => ({
    id: episode.id,
    number: episode.number,
    title: `Episode ${episode.number}`,
  }));
}

export function buildCanonicalLayers(
  allAnimeEpisodes: ProviderEpisode[],
  confidenceMap: Record<number, EpisodeConfidence>,
): {
  displayEpisodes: DisplayEpisode[];
  rawEpisodes: RawEpisode[];
  avgConfidence: number;
} {
  const rawEpisodes = buildRawEpisodes(allAnimeEpisodes, confidenceMap);
  const displayEpisodes = buildDisplayEpisodes(allAnimeEpisodes, rawEpisodes);

  return {
    displayEpisodes,
    rawEpisodes,
    avgConfidence: averageConfidence(rawEpisodes),
  };
}
