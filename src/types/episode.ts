/** Canonical episode ID — single source of truth for internal episode identity. */
export type EpisodeId = `allanime:${string}@${number}`;

/** Canonical anime ID (no episode suffix). */
export type AnimeId = `allanime:${string}`;
