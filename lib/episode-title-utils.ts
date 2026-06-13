import { scoreProviderTitleMatch } from "./provider-match-utils";
import type { ProviderAnime, ProviderEpisode } from "./provider";

const GENERIC_PROVIDER_TITLE = /^Episode\s*\d+\s*$/i;

function normalizeTitleKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function isGenericProviderTitle(title: string, showName?: string): boolean {
  const normalized = title.trim();
  if (!normalized) return true;
  if (GENERIC_PROVIDER_TITLE.test(normalized)) return true;

  if (showName) {
    const showKey = normalizeTitleKey(showName);
    const titleKey = normalizeTitleKey(normalized);
    if (titleKey === showKey) return true;
    if (titleKey.startsWith(showKey)) {
      const remainder = titleKey.slice(showKey.length).trim();
      if (!remainder || /^episode\s*\d+$/.test(remainder)) return true;
    }
  }

  return false;
}

export function hasUsefulEpisodeTitles(episodes: ProviderEpisode[], showName?: string): boolean {
  if (!episodes.length) return false;
  const unique = new Set(episodes.map((episode) => episode.title.trim().toLowerCase()));
  if (unique.size <= 1) return false;
  return episodes.some((episode) => !isGenericProviderTitle(episode.title, showName));
}

export function mergeProviderEpisodeTitles(
  base: ProviderEpisode[],
  enriched: ProviderEpisode[],
  showName?: string,
): ProviderEpisode[] {
  if (!enriched.length) return base;

  const enrichedByNumber = new Map(enriched.map((episode) => [episode.number, episode]));
  return base.map((episode) => {
    const alt = enrichedByNumber.get(episode.number);
    if (!alt) return episode;

    const baseGeneric = isGenericProviderTitle(episode.title, showName);
    const altGeneric = isGenericProviderTitle(alt.title, showName);

    if (altGeneric) return episode;
    if (baseGeneric) {
      return { ...episode, title: alt.title, isFiller: alt.isFiller ?? episode.isFiller };
    }

    if (alt.title.length > episode.title.length && !altGeneric) {
      return { ...episode, title: alt.title, isFiller: alt.isFiller ?? episode.isFiller };
    }

    return episode;
  });
}

function addQueryVariants(queries: Set<string>, value: string) {
  const trimmed = value.trim();
  if (!trimmed) return;
  queries.add(trimmed);

  const withoutSeason = trimmed
    .replace(/\s*(?:season|s)\s*\d+[^a-z0-9]*.*$/i, "")
    .replace(/\s*\d+(?:st|nd|rd|th)?\s*season.*$/i, "")
    .trim();
  if (withoutSeason && withoutSeason !== trimmed) queries.add(withoutSeason);

  const beforeColon = trimmed.split(":")[0]?.trim();
  if (beforeColon && beforeColon.length > 3 && beforeColon !== trimmed) queries.add(beforeColon);
}

export function buildConsumetSearchQueries(showName: string, extraHints: string[] = []): string[] {
  const queries = new Set<string>();
  addQueryVariants(queries, showName);
  for (const hint of extraHints) {
    addQueryVariants(queries, hint);
  }
  return [...queries];
}

export function pickBestConsumetMatch(results: ProviderAnime[], query: string): ProviderAnime | null {
  if (!results.length) return null;

  let best = results[0]!;
  let bestScore = scoreProviderTitleMatch(best.title, query);

  for (const candidate of results.slice(1, 8)) {
    const score = scoreProviderTitleMatch(candidate.title, query);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}
