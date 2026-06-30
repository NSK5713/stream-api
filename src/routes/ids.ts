/**
 * Route-layer ID normalization — the ONLY place raw strings become typed IDs.
 */
import type { AnimeId, EpisodeId } from "../types/episode";

export type { AnimeId, EpisodeId };

function hasProviderPrefix(input: string): boolean {
  return /^[a-z][a-z0-9]*:/i.test(input);
}

/** Normalize a raw episode id to canonical EpisodeId (routes only). */
export function toEpisodeId(input: string): EpisodeId {
  if (hasProviderPrefix(input)) return input as EpisodeId;
  return `allanime:${input}` as EpisodeId;
}

/** Normalize a raw anime id to canonical AnimeId (routes only). */
export function toAnimeId(input: string): AnimeId {
  if (hasProviderPrefix(input)) return input as AnimeId;
  return `allanime:${input}` as AnimeId;
}

export function isValidEpisodeId(id: string): boolean {
  if (/^allanime:.+@\d+$/.test(id)) return true;
  return /^[a-z][a-z0-9]*:.+$/.test(id);
}

export function isValidAnimeId(id: string): boolean {
  if (/^allanime:[^@]+$/.test(id)) return true;
  return /^[a-z][a-z0-9]*:[^@]+$/.test(id);
}
