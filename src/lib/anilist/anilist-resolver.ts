const ANILIST_URL = "https://graphql.anilist.co";
const REQUEST_TIMEOUT_MS = 7_000;

export type AnilistIdentity = {
  anilistId: number;
  malId: number | null;
  titles: string[];
  synonyms: string[];
  episodeCount: number | null;
};

type AnilistMedia = {
  id?: number;
  idMal?: number | null;
  episodes?: number | null;
  title?: {
    romaji?: string | null;
    english?: string | null;
    native?: string | null;
  };
  synonyms?: string[] | null;
  streamingEpisodes?: Array<{ title?: string | null }> | null;
};

type AnilistSearchResponse = {
  data?: {
    Page?: {
      media?: AnilistMedia[];
    };
  };
};

const RESOLVE_QUERY = `
  query ($search: String) {
    Page(page: 1, perPage: 1) {
      media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
        id
        idMal
        episodes
        title { romaji english native }
        synonyms
        streamingEpisodes { title }
      }
    }
  }
`;

function mediaTitles(media: AnilistMedia): string[] {
  return [
    media.title?.english,
    media.title?.romaji,
    media.title?.native,
    ...(media.synonyms ?? []),
  ]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
}

function toIdentity(media: AnilistMedia): AnilistIdentity | null {
  if (typeof media.id !== "number" || media.id <= 0) return null;

  return {
    anilistId: media.id,
    malId: typeof media.idMal === "number" && media.idMal > 0 ? media.idMal : null,
    titles: mediaTitles(media),
    synonyms: (media.synonyms ?? []).map((value) => value.trim()).filter(Boolean),
    episodeCount: typeof media.episodes === "number" && media.episodes > 0 ? media.episodes : null,
  };
}

function streamingEpisodeTitles(media: AnilistMedia): string[] {
  return (media.streamingEpisodes ?? [])
    .map((entry) => (typeof entry.title === "string" ? entry.title.trim() : ""))
    .filter(Boolean);
}

/** Single-request AniList identity + index-ordered streaming episode titles. */
export async function fetchAnilistIdentityAndEpisodes(showName: string): Promise<{
  identity: AnilistIdentity | null;
  streamingTitles: string[];
}> {
  const response = await fetch(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      query: RESOLVE_QUERY,
      variables: { search: showName.trim() },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    return { identity: null, streamingTitles: [] };
  }

  const payload = (await response.json()) as AnilistSearchResponse;
  const media = payload.data?.Page?.media?.[0];
  if (!media) {
    return { identity: null, streamingTitles: [] };
  }

  return {
    identity: toIdentity(media),
    streamingTitles: streamingEpisodeTitles(media),
  };
}
