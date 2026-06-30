import redis from "../redis";
import {
  getCanonicalMeta,
  getDisplayCache,
  getRawCache,
  updateDisplayCacheOnly,
} from "../cache/canonical-episode-cache";
import { selfHealLockKey } from "../cache/canonical-cache-store";
import { fetchV8MetadataSources } from "../episodes/episode-metadata-v8-sources";
import {
  computeEpisodeConsensus,
  preferBetterDisplay,
  toConsensusDisplay,
} from "../episodes/episode-consensus-v8";
import { detectEpisodeDrift } from "../episodes/drift-detector";
import type { EnrichedEpisode } from "../episodes/canonical-snapshot";
import { streamProvider } from "../provider";

const SELF_HEAL_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SELF_HEAL_LOCK_TTL_SECONDS = 600;
const CONFIDENCE_IMPROVEMENT_THRESHOLD = 0.05;

const inProcessLocks = new Set<string>();
const scheduledSelfHeal = new Set<string>();

async function acquireSelfHealLock(animeId: string): Promise<boolean> {
  if (inProcessLocks.has(animeId)) return false;

  try {
    if (redis) {
      const result = await redis.set(
        selfHealLockKey(animeId),
        "1",
        "EX",
        SELF_HEAL_LOCK_TTL_SECONDS,
        "NX",
      );
      if (result !== "OK") return false;
    }
  } catch {
    // Fall through to in-process lock.
  }

  inProcessLocks.add(animeId);
  return true;
}

async function releaseSelfHealLock(animeId: string): Promise<void> {
  inProcessLocks.delete(animeId);

  try {
    if (redis) {
      await redis.del(selfHealLockKey(animeId));
    }
  } catch {
    // Best-effort release.
  }
}

function rawToEnriched(raw: Awaited<ReturnType<typeof getRawCache>>, displayIds: Map<number, string>): EnrichedEpisode[] {
  if (!raw?.length) return [];
  return raw.map((episode) => ({
    number: episode.number,
    title: episode.title,
    id: displayIds.get(episode.number) ?? `unknown:${episode.number}`,
    source: episode.source,
    confidence: episode.confidence,
  }));
}

async function runSelfHeal(animeId: string): Promise<void> {
  const locked = await acquireSelfHealLock(animeId);
  if (!locked) return;

  try {
    const storedMeta = await getCanonicalMeta(animeId);
    const storedDisplay = await getDisplayCache(animeId);
    const storedRaw = await getRawCache(animeId);
    if (!storedMeta || !storedDisplay?.episodes.length || !storedRaw?.length) return;

    const lastUpdated = storedMeta.lastUpdated ?? storedMeta.timestamp;
    if (Date.now() - lastUpdated < SELF_HEAL_INTERVAL_MS) return;

    const res = await streamProvider.episodes(animeId);
    const allAnimeEpisodes = (res as any)?.episodes ?? (res as any)?.data ?? [];
    if (!Array.isArray(allAnimeEpisodes) || allAnimeEpisodes.length === 0) return;

    const idByNumber = new Map(allAnimeEpisodes.map((episode) => [episode.number, episode.id]));
    const baseEpisodes = rawToEnriched(storedRaw, idByNumber);

    const sources = await fetchV8MetadataSources(animeId, allAnimeEpisodes, baseEpisodes);
    if (sources.identityHash !== "unknown" && sources.identityHash !== storedMeta.identityHash) {
      console.info(`[v8-selfheal] skip animeId=${animeId} reason=identity_changed`);
      return;
    }

    const consensus = computeEpisodeConsensus({
      jikan: sources.jikan,
      anilist: sources.anilist,
      anidb: sources.anidb,
      tmdb: sources.tmdb,
      base: baseEpisodes,
      sourceCounts: sources.sourceCounts,
    });

    const drift = detectEpisodeDrift({
      jikanCount: sources.sourceCounts.jikan,
      anilistCount: sources.sourceCounts.anilist,
      anidbCount: sources.sourceCounts.anidb,
      tmdbCount: sources.sourceCounts.tmdb,
      baseCount: allAnimeEpisodes.length,
      anilistEpisodeCount: sources.sourceCounts.anilistEpisodeCount,
      identityKnown: sources.sourceCounts.identityKnown,
    });

    if (drift.reasons.length) {
      console.info(`[v8-drift] animeId=${animeId} reasons=${JSON.stringify(drift.reasons)}`);
    }

    const storedTitleScore =
      storedMeta.consensusScore?.title ?? storedMeta.avgConfidence ?? 0;
    const improvement = consensus.confidenceScore.title - storedTitleScore;

    if (improvement < CONFIDENCE_IMPROVEMENT_THRESHOLD) return;

    const consensusDisplay = toConsensusDisplay(consensus.episodes);
    const nextDisplay = preferBetterDisplay(
      storedDisplay.episodes,
      consensusDisplay,
      storedTitleScore,
      consensus.confidenceScore.title,
    );

    await updateDisplayCacheOnly(animeId, nextDisplay, {
      avgConfidence: consensus.confidenceScore.title,
      consensusScore: consensus.confidenceScore,
    });

    console.info(`[v8-selfheal] updated display animeId=${animeId} reason=higher_confidence`);
    console.info(
      `[v8-selfheal] animeId=${animeId} improved_title_confidence=+${improvement.toFixed(2)}`,
    );
  } catch (error) {
    console.error(`[v8-selfheal] failed animeId=${animeId}`, error);
  } finally {
    await releaseSelfHealLock(animeId);
  }
}

/** Schedule a 24h self-heal pass for cached anime. */
export function enqueueSelfHeal(animeId: string): void {
  if (scheduledSelfHeal.has(animeId)) return;
  scheduledSelfHeal.add(animeId);

  setTimeout(() => {
    scheduledSelfHeal.delete(animeId);
    void runSelfHeal(animeId);
  }, SELF_HEAL_INTERVAL_MS);
}
