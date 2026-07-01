import { createHash } from "node:crypto";
import {
  fetchHiddenGemCandidates,
  fetchRecommendationsForSeed,
  fetchSeasonalAnime,
  fetchTrendingAnime,
  type MappedHomeAnime,
} from "../lib/anilist/home-client";
import type {
  HomeDashboardResponse,
  HomeHiddenGem,
  HomeRecommendationGroup,
  HomeRequestContext,
  HomepageInsights,
} from "../types/home";

const HOME_CACHE_TTL_MS = 15 * 60 * 1000;
const HOME_CACHE_STALE_MS = 24 * 60 * 60 * 1000;
/** Catalog row size for trending/seasonal on GET /api/home (matches NSKAnime HOME_*_ROW_LIMIT). */
const HOME_CATALOG_ROW_LIMIT = 40;
/** Recommendation items per seed (matches NSKAnime HOME_BECAUSE_YOU_WATCHED_LIMIT). */
const HOME_RECOMMENDATIONS_PER_SEED = 32;

type CacheEntry = {
  expiresAt: number;
  staleUntil: number;
  payload: Partial<HomeDashboardResponse>;
  refreshPromise?: Promise<Partial<HomeDashboardResponse>>;
};

const catalogCache = new Map<string, CacheEntry>();
const hiddenGemUserCache = new Map<string, { gem: HomeHiddenGem; staleUntil: number }>();

function cacheHiddenGemForUser(userId: string, gem: HomeHiddenGem | null) {
  if (!gem) return;
  hiddenGemUserCache.set(stableDayKey(userId || "guest"), {
    gem,
    staleUntil: Date.now() + HOME_CACHE_STALE_MS,
  });
}

function readCachedHiddenGemForUser(userId: string): HomeHiddenGem | null {
  const entry = hiddenGemUserCache.get(stableDayKey(userId || "guest"));
  if (!entry || entry.staleUntil <= Date.now()) return null;
  return entry.gem;
}

function withHiddenGemFallback(
  payload: Partial<HomeDashboardResponse>,
  userId: string,
): Partial<HomeDashboardResponse> {
  if (payload.hiddenGem) return payload;
  const cached = readCachedHiddenGemForUser(userId) ?? findStaleHiddenGemFallback(userId);
  if (!cached) return payload;
  return {
    ...payload,
    hiddenGem: cached,
    homepageInsights: {
      ...(payload.homepageInsights ?? emptyInsights()),
      hiddenGemReason: cached.explanation,
    },
  };
}

function stripInternalFields(anime: MappedHomeAnime) {
  const { _popularity, _favourites, _duration, ...rest } = anime;
  void _popularity;
  void _favourites;
  void _duration;
  return rest;
}

function stableDayKey(userId: string): string {
  return new Date().toISOString().slice(0, 10) + ":" + userId;
}

function seededIndex(seed: string, length: number): number {
  if (length <= 0) return 0;
  const hash = createHash("sha256").update(seed).digest();
  const value = hash.readUInt32BE(0);
  return value % length;
}

function pickHiddenGem(
  candidates: MappedHomeAnime[],
  userId: string,
  favouriteGenres: string[],
): HomeHiddenGem | null {
  if (!candidates.length) return null;

  const filtered = candidates
    .filter((item) => item.rating >= 7)
    .filter((item) => item._popularity > 0 && item._popularity < 80_000)
    .sort((a, b) => {
      const scoreDelta = b.rating - a.rating;
      if (scoreDelta !== 0) return scoreDelta;
      return a._popularity - b._popularity;
    });

  const pool = filtered.length ? filtered : candidates;
  const daySeed = stableDayKey(userId || "guest");
  const pick = pool[seededIndex(daySeed, pool.length)];
  if (!pick) return null;

  const genreHint = favouriteGenres[0] ?? pick.genres[0] ?? "underrated";
  const explanation = `A highly rated ${genreHint} pick with a smaller audience — worth a look today.`;

  return {
    anime: stripInternalFields(pick),
    explanation,
  };
}

function emptyInsights(hiddenGemReason = ""): HomepageInsights {
  return {
    completionRate: 0,
    favouriteGenres: [],
    favouriteStudios: [],
    preferredEpisodeLength: 24,
    averageWeeklyWatchTime: 0,
    mostActiveDay: "",
    mostActiveTime: "",
    hiddenGemReason,
  };
}

function buildCacheKey(context: HomeRequestContext): string {
  return JSON.stringify({
    genres: context.favouriteGenres ?? [],
    seeds: context.seedAnimeIds ?? [],
    userId: context.userId ?? "guest",
  });
}

function findStaleCatalogFallback(): Partial<HomeDashboardResponse> | null {
  const now = Date.now();
  for (const [, entry] of catalogCache) {
    if (entry.staleUntil <= now) continue;
    if (entry.payload.trending?.length || entry.payload.seasonal?.length) {
      return entry.payload;
    }
  }
  return null;
}

function findStaleHiddenGemFallback(userId: string): HomeHiddenGem | null {
  const now = Date.now();
  const preferredUser = userId || "guest";

  for (const [key, entry] of catalogCache) {
    if (entry.staleUntil <= now || !entry.payload.hiddenGem) continue;
    if (key.includes(`"userId":"${preferredUser}"`)) {
      return entry.payload.hiddenGem;
    }
  }

  for (const [, entry] of catalogCache) {
    if (entry.staleUntil <= now || !entry.payload.hiddenGem) continue;
    return entry.payload.hiddenGem;
  }

  return null;
}

async function refreshCatalogSections(
  context: HomeRequestContext,
  cacheKey: string,
): Promise<Partial<HomeDashboardResponse>> {
  const userId = context.userId ?? "guest";
  const [trending, seasonal] = await Promise.all([
    fetchTrendingAnime(HOME_CATALOG_ROW_LIMIT),
    fetchSeasonalAnime(HOME_CATALOG_ROW_LIMIT),
  ]);

  const seedId = (context.seedAnimeIds ?? []).filter((id) => Number.isFinite(id) && id > 0)[0];

  const recommendationPromise = (async (): Promise<HomeRecommendationGroup[]> => {
    if (!seedId) return [];
    try {
      const group = await fetchRecommendationsForSeed(seedId, HOME_RECOMMENDATIONS_PER_SEED);
      if (!group.items.length) return [];
      return [
        {
          seedId,
          seedTitle: group.seedTitle,
          items: group.items.map(stripInternalFields),
        },
      ];
    } catch {
      return [];
    }
  })();

  const hiddenGemPromise = (async (): Promise<HomeHiddenGem | null> => {
    try {
      const candidates = await fetchHiddenGemCandidates(context.favouriteGenres ?? [], 50);
      return pickHiddenGem(candidates, userId, context.favouriteGenres ?? []);
    } catch {
      return (
        readCachedHiddenGemForUser(userId) ??
        findStaleHiddenGemFallback(userId)
      );
    }
  })();

  const [recommendationGroups, hiddenGem] = await Promise.all([
    recommendationPromise,
    hiddenGemPromise,
  ]);

  const hiddenGemReason = hiddenGem?.explanation ?? "";
  if (hiddenGem) {
    cacheHiddenGemForUser(userId, hiddenGem);
  }

  const payload: Partial<HomeDashboardResponse> = {
    trending: trending.map(stripInternalFields),
    seasonal: seasonal.map(stripInternalFields),
    recommendations: recommendationGroups,
    hiddenGem,
    homepageInsights: emptyInsights(hiddenGemReason),
  };

  const now = Date.now();
  catalogCache.set(cacheKey, {
    expiresAt: now + HOME_CACHE_TTL_MS,
    staleUntil: now + HOME_CACHE_STALE_MS,
    payload,
  });
  return payload;
}

async function loadCatalogSections(context: HomeRequestContext): Promise<Partial<HomeDashboardResponse>> {
  const cacheKey = buildCacheKey(context);
  const userId = context.userId ?? "guest";
  const now = Date.now();
  const cached = catalogCache.get(cacheKey);

  if (cached?.expiresAt && cached.expiresAt > now) {
    return withHiddenGemFallback(cached.payload, userId);
  }

  if (cached?.staleUntil && cached.staleUntil > now) {
    if (!cached.refreshPromise) {
      cached.refreshPromise = refreshCatalogSections(context, cacheKey).finally(() => {
        const entry = catalogCache.get(cacheKey);
        if (entry) entry.refreshPromise = undefined;
      });
    }
    return withHiddenGemFallback(cached.payload, userId);
  }

  const inFlight = cached?.refreshPromise;
  if (inFlight) return inFlight.then((payload) => withHiddenGemFallback(payload, userId));

  const refreshPromise = refreshCatalogSections(context, cacheKey);
  if (cached) {
    cached.refreshPromise = refreshPromise.finally(() => {
      const entry = catalogCache.get(cacheKey);
      if (entry) entry.refreshPromise = undefined;
    });
    const stalePayload = withHiddenGemFallback(cached.payload, userId);
    if (stalePayload.hiddenGem || stalePayload.trending?.length || stalePayload.seasonal?.length) {
      return stalePayload;
    }
    return refreshPromise;
  }

  const warmFallback = withHiddenGemFallback(findStaleCatalogFallback() ?? {}, userId);
  if (warmFallback.hiddenGem || warmFallback.trending?.length || warmFallback.seasonal?.length) {
    catalogCache.set(cacheKey, {
      expiresAt: 0,
      staleUntil: now + HOME_CACHE_STALE_MS,
      payload: warmFallback,
      refreshPromise: refreshPromise.finally(() => {
        const entry = catalogCache.get(cacheKey);
        if (entry) entry.refreshPromise = undefined;
      }),
    });
    return warmFallback;
  }

  return refreshPromise;
}

function parseStringList(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseNumberList(value: unknown): number[] {
  if (typeof value !== "string" || !value.trim()) return [];
  return value
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((id) => Number.isFinite(id) && id > 0);
}

/** Parse GET query or POST JSON body into a normalized home request context. */
export function parseHomeRequestContext(
  query: Record<string, unknown>,
  body?: Record<string, unknown>,
): HomeRequestContext {
  const merged = { ...query, ...(body ?? {}) };
  return {
    userId: typeof merged.userId === "string" ? merged.userId : undefined,
    username: typeof merged.username === "string" ? merged.username : undefined,
    favouriteGenres: Array.isArray(merged.favouriteGenres)
      ? merged.favouriteGenres.map(String).filter(Boolean)
      : parseStringList(merged.genres ?? merged.favouriteGenres),
    seedAnimeIds: Array.isArray(merged.seedAnimeIds)
      ? merged.seedAnimeIds.map((value) => Number(value)).filter((id) => Number.isFinite(id) && id > 0)
      : parseNumberList(merged.seedIds ?? merged.seedAnimeIds),
    libraryPinIds: Array.isArray(merged.libraryPinIds)
      ? merged.libraryPinIds.map((value) => Number(value)).filter((id) => Number.isFinite(id) && id > 0)
      : parseNumberList(merged.libraryPinIds),
  };
}

/**
 * Aggregate catalog-backed home sections from AniList.
 * User-specific rows (continue watching, watchlist) are composed on the client.
 */
export async function aggregateHomeDashboard(context: HomeRequestContext): Promise<HomeDashboardResponse> {
  const catalog = await loadCatalogSections(context);

  return {
    welcome: null,
    continueWatching: [],
    newEpisodes: [],
    recommendations: catalog.recommendations ?? [],
    watchlist: [],
    hiddenGem: catalog.hiddenGem ?? null,
    trending: catalog.trending ?? [],
    seasonal: catalog.seasonal ?? [],
    homepageInsights: catalog.homepageInsights ?? emptyInsights(),
  };
}
