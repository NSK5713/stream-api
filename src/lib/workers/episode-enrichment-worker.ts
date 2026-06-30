import redis from "../redis";
import {
  getCanonicalMeta,
  getDisplayCache,
  invalidateCanonicalEpisodes,
  setCanonicalEpisodes,
} from "../cache/canonical-episode-cache";
import {
  enrichmentLockKey,
  setEnrichmentStatus,
} from "../cache/enrichment-status-cache";
import {
  createAllanimeFallbackSnapshot,
  createSnapshot,
  deriveDisplay,
  deriveRaw,
  toEnrichedEpisodes,
  validateSnapshot,
} from "../episodes/canonical-snapshot";
import { detectEpisodeDrift } from "../episodes/drift-detector";
import {
  computeEpisodeConsensus,
  preferBetterDisplay,
  toConsensusDisplay,
} from "../episodes/episode-consensus-v8";
import { fetchV8MetadataSources } from "../episodes/episode-metadata-v8-sources";
import { resolveEpisodeTitlesV3 } from "../episodes/episode-metadata-v3";
import { enqueueSelfHeal } from "./self-heal-worker";
import { streamProvider } from "../provider";

const ENRICHMENT_LOCK_TTL_SECONDS = 600;
const inProcessLocks = new Set<string>();

async function acquireEnrichmentLock(animeId: string): Promise<boolean> {
  const key = enrichmentLockKey(animeId);

  if (inProcessLocks.has(animeId)) {
    return false;
  }

  try {
    if (redis) {
      const result = await redis.set(key, "1", "EX", ENRICHMENT_LOCK_TTL_SECONDS, "NX");
      if (result !== "OK") return false;
    }
  } catch {
    // Fall through to in-process lock.
  }

  inProcessLocks.add(animeId);
  return true;
}

async function releaseEnrichmentLock(animeId: string): Promise<void> {
  inProcessLocks.delete(animeId);

  try {
    if (redis) {
      await redis.del(enrichmentLockKey(animeId));
    }
  } catch {
    // Best-effort release.
  }
}

async function runEpisodeEnrichment(animeId: string): Promise<void> {
  const locked = await acquireEnrichmentLock(animeId);
  if (!locked) {
    console.info(`[v6-worker] skip animeId=${animeId} reason=lock_active`);
    return;
  }

  const startedAt = Date.now();
  await setEnrichmentStatus(animeId, { status: "pending", startedAt, source: "jikan" });
  console.info(`[v6-worker] start animeId=${animeId}`);

  try {
    const res = await streamProvider.episodes(animeId);
    const allAnimeEpisodes = (res as any)?.episodes ?? (res as any)?.data ?? [];
    if (!Array.isArray(allAnimeEpisodes) || allAnimeEpisodes.length === 0) {
      await setEnrichmentStatus(animeId, {
        status: "failed",
        startedAt,
        completedAt: Date.now(),
        error: "no_allanime_episodes",
      });
      return;
    }

    const result = await resolveEpisodeTitlesV3(animeId, allAnimeEpisodes);
    const identityHash = result.identityHash ?? "unknown";

    let snapshot = createSnapshot(
      animeId,
      toEnrichedEpisodes(result.episodes),
      identityHash,
      allAnimeEpisodes.length,
    );
    let valid = validateSnapshot(snapshot);

    if (!valid) {
      snapshot = createAllanimeFallbackSnapshot(animeId, allAnimeEpisodes, identityHash);
      valid = validateSnapshot(snapshot);
    }

    console.info(
      `[v7.1-worker] snapshot_created animeId=${animeId} episodes=${snapshot.episodes.length} confidence=${snapshot.avgConfidence.toFixed(2)} valid=${valid}`,
    );

    const rawEpisodes = deriveRaw(snapshot);
    const v71Display = deriveDisplay(snapshot);

    const sources = await fetchV8MetadataSources(animeId, allAnimeEpisodes, snapshot.episodes);
    const consensus = computeEpisodeConsensus({
      jikan: sources.jikan,
      anilist: sources.anilist,
      anidb: sources.anidb,
      tmdb: sources.tmdb,
      base: snapshot.episodes,
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

    if (drift.drift || drift.reasons.length) {
      console.info(`[v8-drift] animeId=${animeId} reasons=${JSON.stringify(drift.reasons)}`);
    }

    console.info(
      `[v8-consensus] animeId=${animeId} identity=${consensus.confidenceScore.identity.toFixed(2)} episode=${consensus.confidenceScore.episode.toFixed(2)} title=${consensus.confidenceScore.title.toFixed(2)}`,
    );

    const consensusDisplay = toConsensusDisplay(consensus.episodes);
    const displayEpisodes = preferBetterDisplay(
      v71Display,
      consensusDisplay,
      snapshot.avgConfidence,
      consensus.confidenceScore.title,
    );

    const staleMeta = await getCanonicalMeta(animeId);
    const staleDisplay = await getDisplayCache(animeId);
    if (
      staleMeta &&
      staleDisplay &&
      (staleDisplay.episodes.length !== displayEpisodes.length ||
        staleMeta.identityHash !== snapshot.identityHash)
    ) {
      await invalidateCanonicalEpisodes(animeId);
    }

    await setCanonicalEpisodes({
      animeId,
      rawEpisodes,
      displayEpisodes,
      identityHash: snapshot.identityHash,
      avgConfidence: consensus.confidenceScore.title,
      enriched: true,
      driftDetected: drift.drift,
      driftReasons: drift.reasons,
      consensusScore: consensus.confidenceScore,
      v8ConsensusDisplay: displayEpisodes,
    });

    await setEnrichmentStatus(animeId, {
      status: "complete",
      startedAt,
      completedAt: Date.now(),
      source: "jikan",
    });

    enqueueSelfHeal(animeId);

    console.info(
      `[v7-worker] animeId=${animeId} raw=${rawEpisodes.length} display=${displayEpisodes.length} avgConfidence=${consensus.confidenceScore.title.toFixed(2)}`,
    );
  } catch (error) {
    await setEnrichmentStatus(animeId, {
      status: "failed",
      startedAt,
      completedAt: Date.now(),
      error: error instanceof Error ? error.message : "enrichment_failed",
    });
    console.error(`[v6-worker] failed animeId=${animeId}`, error);
  } finally {
    await releaseEnrichmentLock(animeId);
  }
}

/** Fire-and-forget background enrichment — never blocks API response. */
export function enqueueEpisodeEnrichment(animeId: string): void {
  void runEpisodeEnrichment(animeId);
}
