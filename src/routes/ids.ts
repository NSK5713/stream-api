/**
 * Route-layer ID normalization — the ONLY place raw strings become typed IDs.
 */
import type { AnimeId, EpisodeId } from "../types/episode";

export type { AnimeId, EpisodeId };

/** Normalize a raw episode id to canonical EpisodeId (routes only). */
export function toEpisodeId(input: string): EpisodeId {
  if (input.startsWith("allanime:")) return input as EpisodeId;
  return `allanime:${input}` as EpisodeId;
}

/** Normalize a raw anime id to canonical AnimeId (routes only). */
export function toAnimeId(input: string): AnimeId {
  if (input.startsWith("allanime:")) return input as AnimeId;
  return `allanime:${input}` as AnimeId;
}

export function isValidEpisodeId(id: string): boolean {
  return /^allanime:.+@\d+$/.test(id);
}

export function isValidAnimeId(id: string): boolean {
  return /^allanime:[^@]+$/.test(id);
}
