import type { ProviderEpisode } from "./provider";

/** Map episode number → provider episode; never use array index as episode number. */
export function resolveEpisodeByNumber(
  episodes: ProviderEpisode[],
  episodeNumber: number,
): ProviderEpisode | null {
  const exact = episodes.find((item) => item.number === episodeNumber);
  if (exact) return exact;
  if (episodes.length === 1 && episodes[0]?.number === episodeNumber) return episodes[0];
  return null;
}

export type EpisodeResolutionLog = {
  incomingAnimeId: string;
  resolvedProviderAnime: { id: string; title?: string } | null;
  episodeListLength: number;
  requestedEpisodeNumber: number;
  mappedEpisode: { id: string; number: number } | null;
};

export function logEpisodeResolution(payload: EpisodeResolutionLog): void {
  if (process.env.NODE_ENV === "production") return;
  console.info("[episode-resolution]", payload);
}
