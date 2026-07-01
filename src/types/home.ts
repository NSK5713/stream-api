/** Slim anime shape returned by GET /api/home (matches NSKAnime frontend Anime fields used on home). */
export type HomeAnime = {
  id: number;
  title: string;
  description: string;
  poster: string;
  banner: string;
  rating: number;
  genres: string[];
  episodeCount: number;
  totalEpisodes?: number | null;
  availableEpisodes?: number;
  status: "Airing" | "Upcoming" | "Completed";
  studio: string;
  releaseYear: number;
  season: "Winter" | "Spring" | "Summer" | "Fall";
  releaseDay: string;
  releaseTime: string;
  progress: number;
  lastWatchedEpisode: number;
  episodes: [];
  format?: string;
  malId?: number;
  nextAiringEpisode?: { airingAt?: number; episode: number } | null;
  posterColor?: string | null;
};

export type HomeWelcome = {
  message: string;
  variant: "new" | "returning" | "continue" | "new_episodes";
  highlightTitle?: string;
  newEpisodeCount?: number;
};

export type HomeHiddenGem = {
  anime: HomeAnime;
  explanation: string;
};

export type HomeRecommendationGroup = {
  seedTitle: string;
  seedId: number;
  items: HomeAnime[];
};

export type HomepageInsights = {
  completionRate: number;
  favouriteGenres: string[];
  favouriteStudios: string[];
  preferredEpisodeLength: number;
  averageWeeklyWatchTime: number;
  mostActiveDay: string;
  mostActiveTime: string;
  hiddenGemReason: string;
};

export type HomeDashboardResponse = {
  welcome: HomeWelcome | null;
  continueWatching: HomeAnime[];
  newEpisodes: HomeAnime[];
  recommendations: HomeRecommendationGroup[];
  watchlist: HomeAnime[];
  hiddenGem: HomeHiddenGem | null;
  trending: HomeAnime[];
  seasonal: HomeAnime[];
  homepageInsights: HomepageInsights;
};

export type HomeRequestContext = {
  userId?: string;
  username?: string;
  favouriteGenres?: string[];
  seedAnimeIds?: number[];
  libraryPinIds?: number[];
};
