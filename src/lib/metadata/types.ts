export type MetadataEpisode = {
  number: number;
  title: string;
};

export type EpisodeTitleSource = "jikan" | "anidb" | "tmdb" | "fallback";

export type EpisodeTitleMeta = {
  title: string;
  source: EpisodeTitleSource;
  confidence: number;
};

export type EnrichedProviderEpisode = {
  id: string;
  number: number;
  title: string;
  isFiller?: boolean;
  titleMeta: EpisodeTitleMeta;
};
