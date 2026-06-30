import { jikanGet } from "./mal-resolver";

export type JikanEpisodeTitle = {
  number: number;
  title: string;
};

type JikanEpisodeEntry = {
  title?: string;
};

type JikanEpisodesResponse = {
  data?: JikanEpisodeEntry[];
  pagination?: {
    has_next_page?: boolean;
  };
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetch episode titles from Jikan for a MyAnimeList anime id. */
export async function fetchJikanEpisodes(malId: number): Promise<JikanEpisodeTitle[]> {
  const episodes: JikanEpisodeTitle[] = [];
  let page = 1;
  let episodeNumber = 1;
  let hasNextPage = true;

  while (hasNextPage && page <= 32) {
    const payload = await jikanGet<JikanEpisodesResponse>(`/anime/${malId}/episodes?page=${page}`);
    if (!payload?.data?.length) break;

    for (const entry of payload.data) {
      const title = typeof entry.title === "string" ? entry.title.trim() : "";
      episodes.push({
        number: episodeNumber,
        title: title || `Episode ${episodeNumber}`,
      });
      episodeNumber += 1;
    }

    hasNextPage = Boolean(payload.pagination?.has_next_page);
    page += 1;

    if (hasNextPage) {
      await sleep(350);
    }
  }

  return episodes;
}
