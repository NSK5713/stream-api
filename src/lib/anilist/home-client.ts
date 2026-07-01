const ANILIST_URL = "https://graphql.anilist.co";
const REQUEST_TIMEOUT_MS = 12_000;
const MIN_GAP_MS = 600;

let requestChain: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scheduleAnilist<T>(task: () => Promise<T>): Promise<T> {
  const run = requestChain.then(async () => {
    const wait = MIN_GAP_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await delay(wait);
    lastRequestAt = Date.now();
    return task();
  });
  requestChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export type AniListSeason = "WINTER" | "SPRING" | "SUMMER" | "FALL";

type AniListMedia = {
  id: number;
  idMal?: number | null;
  averageScore?: number | null;
  popularity?: number | null;
  favourites?: number | null;
  duration?: number | null;
  episodes?: number | null;
  status?: string | null;
  format?: string | null;
  season?: string | null;
  seasonYear?: number | null;
  genres?: string[] | null;
  studios?: { nodes?: Array<{ name?: string | null }> | null } | null;
  title?: { english?: string | null; romaji?: string | null; native?: string | null };
  description?: string | null;
  coverImage?: { extraLarge?: string | null; large?: string | null; color?: string | null };
  bannerImage?: string | null;
  nextAiringEpisode?: { airingAt?: number | null; episode?: number | null } | null;
  airingSchedule?: { nodes?: Array<{ episode?: number | null; airingAt?: number | null }> | null } | null;
};

const listFields = `
  id
  idMal
  title { english romaji native }
  description(asHtml: false)
  coverImage { extraLarge large color }
  bannerImage
  averageScore
  popularity
  favourites
  duration
  episodes
  status
  format
  season
  seasonYear
  genres
  studios(isMain: true) { nodes { name } }
  nextAiringEpisode { airingAt episode }
  airingSchedule(notYetAired: false, perPage: 52) { nodes { episode airingAt } }
`;

const pageQuery = `
  query HomePage($page: Int, $perPage: Int, $season: MediaSeason, $seasonYear: Int, $status: MediaStatus, $sort: [MediaSort], $genre_in: [String]) {
    Page(page: $page, perPage: $perPage) {
      media(type: ANIME, season: $season, seasonYear: $seasonYear, status: $status, sort: $sort, genre_in: $genre_in, isAdult: false) {
        ${listFields}
      }
    }
  }
`;

const recommendationsQuery = `
  query HomeRecommendations($id: Int, $perPage: Int) {
    Media(id: $id, type: ANIME) {
      title { english romaji }
      recommendations(page: 1, perPage: $perPage, sort: RATING_DESC) {
        nodes {
          mediaRecommendation {
            ${listFields}
          }
        }
      }
    }
  }
`;

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  return scheduleAnilist(async () => {
    const response = await fetch(ANILIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`AniList request failed (${response.status})`);
    }
    const payload = (await response.json()) as { data?: T; errors?: unknown[] };
    if (payload.errors?.length) {
      throw new Error("AniList GraphQL error");
    }
    return payload.data as T;
  });
}

export function getCurrentSeason(date = new Date()): AniListSeason {
  const month = date.getUTCMonth() + 1;
  if (month <= 3) return "WINTER";
  if (month <= 6) return "SPRING";
  if (month <= 9) return "SUMMER";
  return "FALL";
}

export function getCurrentSeasonYear(date = new Date(), season: AniListSeason = getCurrentSeason(date)): number {
  const year = date.getUTCFullYear();
  return season === "WINTER" && date.getUTCMonth() === 0 ? year - 1 : year;
}

function resolveTitle(media: AniListMedia): string {
  return (
    media.title?.english?.trim() ||
    media.title?.romaji?.trim() ||
    media.title?.native?.trim() ||
    "Untitled"
  );
}

function mapSeason(value: string | null | undefined): "Winter" | "Spring" | "Summer" | "Fall" {
  switch (value) {
    case "WINTER":
      return "Winter";
    case "SPRING":
      return "Spring";
    case "SUMMER":
      return "Summer";
    case "FALL":
      return "Fall";
    default:
      return "Winter";
  }
}

function mapStatus(value: string | null | undefined): "Airing" | "Upcoming" | "Completed" {
  switch (value) {
    case "RELEASING":
      return "Airing";
    case "NOT_YET_RELEASED":
      return "Upcoming";
    default:
      return "Completed";
  }
}

function resolveAvailableEpisodes(media: AniListMedia): number {
  const schedule = media.airingSchedule?.nodes ?? [];
  const fromSchedule = schedule.reduce((max, node) => Math.max(max, node.episode ?? 0), 0);
  const total = media.episodes ?? 0;
  if (media.status === "RELEASING") {
    return Math.max(fromSchedule, media.nextAiringEpisode?.episode ? media.nextAiringEpisode.episode - 1 : 0, 0);
  }
  return total > 0 ? total : fromSchedule;
}

/** Map AniList media to the home dashboard anime shape. */
export function mapHomeAnime(media: AniListMedia) {
  const available = resolveAvailableEpisodes(media);
  const episodeCount = media.episodes ?? available;
  return {
    id: media.id,
    title: resolveTitle(media),
    description: typeof media.description === "string" ? media.description.replace(/<[^>]+>/g, "") : "",
    poster: media.coverImage?.extraLarge || media.coverImage?.large || "",
    banner: media.bannerImage || "",
    rating: Math.round((media.averageScore ?? 0) / 10) || 0,
    genres: media.genres ?? [],
    episodeCount,
    totalEpisodes: media.episodes ?? null,
    availableEpisodes: available,
    status: mapStatus(media.status),
    studio: media.studios?.nodes?.[0]?.name?.trim() || "Unknown",
    releaseYear: media.seasonYear ?? new Date().getFullYear(),
    season: mapSeason(media.season),
    releaseDay: "",
    releaseTime: "",
    progress: 0,
    lastWatchedEpisode: 0,
    episodes: [] as [],
    format: media.format ?? undefined,
    malId: media.idMal ?? undefined,
    nextAiringEpisode: media.nextAiringEpisode?.episode
      ? {
          airingAt: media.nextAiringEpisode.airingAt ?? undefined,
          episode: media.nextAiringEpisode.episode,
        }
      : null,
    posterColor: media.coverImage?.color ?? null,
    _popularity: media.popularity ?? 0,
    _favourites: media.favourites ?? 0,
    _duration: media.duration ?? 24,
  };
}

export type MappedHomeAnime = ReturnType<typeof mapHomeAnime>;

export async function fetchTrendingAnime(perPage = 12): Promise<MappedHomeAnime[]> {
  const data = await graphql<{ Page: { media: AniListMedia[] } }>(pageQuery, {
    page: 1,
    perPage,
    sort: ["TRENDING_DESC"],
  });
  return (data.Page?.media ?? []).map(mapHomeAnime);
}

export async function fetchSeasonalAnime(perPage = 12): Promise<MappedHomeAnime[]> {
  const season = getCurrentSeason();
  const seasonYear = getCurrentSeasonYear(new Date(), season);
  const data = await graphql<{ Page: { media: AniListMedia[] } }>(pageQuery, {
    page: 1,
    perPage,
    season,
    seasonYear,
    sort: ["POPULARITY_DESC"],
  });
  return (data.Page?.media ?? []).map(mapHomeAnime);
}

export async function fetchHiddenGemCandidates(
  genres: string[],
  perPage = 50,
): Promise<MappedHomeAnime[]> {
  const primaryGenre = genres[0] ?? "Slice of Life";
  const data = await graphql<{ Page: { media: AniListMedia[] } }>(pageQuery, {
    page: 1,
    perPage,
    sort: ["SCORE_DESC"],
    status: "FINISHED",
    genre_in: [primaryGenre],
  });
  return (data.Page?.media ?? []).map(mapHomeAnime);
}

export async function fetchRecommendationsForSeed(
  animeId: number,
  perPage = 8,
): Promise<{ seedTitle: string; items: MappedHomeAnime[] }> {
  const data = await graphql<{
    Media: {
      title?: { english?: string | null; romaji?: string | null };
      recommendations?: { nodes?: Array<{ mediaRecommendation?: AniListMedia | null }> | null };
    } | null;
  }>(recommendationsQuery, { id: animeId, perPage });

  const seedTitle =
    data.Media?.title?.english?.trim() ||
    data.Media?.title?.romaji?.trim() ||
    "this anime";

  const items = (data.Media?.recommendations?.nodes ?? [])
    .map((node) => node.mediaRecommendation)
    .filter((media): media is AniListMedia => Boolean(media?.id))
    .map(mapHomeAnime);

  return { seedTitle, items };
}
