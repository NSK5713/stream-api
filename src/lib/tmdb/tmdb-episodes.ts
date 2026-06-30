import { resolveExternalIdsFromMalId } from "../metadata/id-mapping";
import type { MetadataEpisode } from "../metadata/types";

const TMDB_BASE = "https://api.themoviedb.org/3";
const REQUEST_TIMEOUT_MS = 15_000;

type TmdbSeasonResponse = {
  episodes?: Array<{
    episode_number?: number;
    name?: string;
  }>;
};

function tmdbApiKey(): string | null {
  const key = process.env.TMDB_API_KEY?.trim();
  return key || null;
}

async function fetchSeasonEpisodes(showId: number, season: number): Promise<MetadataEpisode[]> {
  const apiKey = tmdbApiKey();
  if (!apiKey) return [];

  const response = await fetch(
    `${TMDB_BASE}/tv/${showId}/season/${season}?api_key=${encodeURIComponent(apiKey)}`,
    {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );

  if (!response.ok) return [];

  const payload = (await response.json()) as TmdbSeasonResponse;
  const episodes: MetadataEpisode[] = [];

  for (const entry of payload.episodes ?? []) {
    const number = entry.episode_number;
    const title = entry.name?.trim();
    if (typeof number !== "number" || number <= 0 || !title) continue;
    episodes.push({ number, title });
  }

  return episodes.sort((left, right) => left.number - right.number);
}

/** Fetch TMDB episode titles using mapped show id (last-resort fallback). */
export async function fetchTmdbEpisodes(malId: number): Promise<MetadataEpisode[]> {
  try {
    const apiKey = tmdbApiKey();
    if (!apiKey) return [];

    const { tmdbShowId } = await resolveExternalIdsFromMalId(malId);
    if (!tmdbShowId) return [];

    const seasonOne = await fetchSeasonEpisodes(tmdbShowId, 1);
    if (seasonOne.length) return seasonOne;

    return fetchSeasonEpisodes(tmdbShowId, 0);
  } catch {
    return [];
  }
}
