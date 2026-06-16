import { streamProvider, type StreamCategory } from "../lib/provider";
import type { EpisodeSourcesResponse } from "../lib/provider";
import type { EpisodeId } from "../types/episode";
import { getCache, setCache } from "../lib/cache";
import { acquireLock, releaseLock } from "../lib/lock";
import { canRequest, recordFailure, recordSuccess } from "../lib/circuitBreaker";
import {
  isTimeoutError,
  logStreamFailure,
  recordCacheHit,
  recordCircuitOpenSkip,
  recordResolutionOutcome,
  recordResolutionStart,
  recordServerAttempt,
} from "../lib/observability";
// ONLY allowed mapping layer for provider response shape
function extractServers(serverData: any) {
  if (!serverData) return [];
  if (Array.isArray(serverData.servers)) return serverData.servers;
  if (Array.isArray(serverData.data)) return serverData.data;
  return [];
}

/* ============================================================ */

export class StreamResolutionError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
  }
}

/* ============================================================
   STREAM VALIDATION (lightweight fallback check)
============================================================ */

/* ============================================================
   V10 STREAM ENGINE (PRODUCTION)
============================================================ */

export async function resolveStreamV10(
  episodeId: EpisodeId,
  category: StreamCategory,
) {
  const cacheKey = `stream:${episodeId}:${category}`;

  /* ---------------- CACHE ---------------- */
  const cached = await getCache(cacheKey);
  if (cached) {
    recordCacheHit();
    return { ...cached, cached: true };
  }

  /* ---------------- LOCK ---------------- */
  const locked = await acquireLock(cacheKey, 10);

  if (!locked) {
    // retry cache while another instance resolves
    recordCircuitOpenSkip("lock-contention");
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 300));
      const retry = await getCache(cacheKey);
      if (retry) {
        recordCacheHit();
        return { ...retry, cached: true };
      }
    }
  }

  recordResolutionStart();
  const resolutionStart = Date.now();
  const serversTried: string[] = [];

  try {
    /* ---------------- SERVERS ---------------- */
    const serverData = await streamProvider.servers(episodeId);
    const servers = extractServers(serverData);

    if (!servers.length) {
      logStreamFailure({
        episodeId,
        category: "no_servers",
        message: "No servers available for episode",
      });
      recordResolutionOutcome(false);
      throw new StreamResolutionError("No servers available", 404);
    }

    /* ---------------- TRY SERVERS ---------------- */
    for (const server of servers) {
      if (!canRequest(server.id)) {
        recordCircuitOpenSkip(server.id);
        continue;
      }

      const attemptStart = Date.now();
      serversTried.push(server.id);

      try {
        const res = (await streamProvider.sources(
          episodeId,
          server.id,
          category,
        )) as EpisodeSourcesResponse;

        if (!res?.sources?.length) {
          const latencyMs = Date.now() - attemptStart;
          recordServerAttempt(server.id, latencyMs, "failure");
          logStreamFailure({
            episodeId,
            category: "no_sources",
            serverId: server.id,
            latencyMs,
            serversTried: [...serversTried],
            message: "Provider returned no sources",
          });
          recordFailure(server.id);
          continue;
        }


        
        // DO NOT validate stream URLs
// trust provider output directly

        const latencyMs = Date.now() - attemptStart;
        recordServerAttempt(server.id, latencyMs, "success");
        recordSuccess(server.id);
        recordResolutionOutcome(true);

        const output = {
          episodeId,
          server,
          sources: res.sources,
          headers: res.headers,
          subtitles: res.subtitles,
        };

        await setCache(cacheKey, output, 60 * 10);

        return output;
      } catch (err) {
        const latencyMs = Date.now() - attemptStart;
        const category = isTimeoutError(err) ? "timeout" : "provider_error";
        recordServerAttempt(server.id, latencyMs, "failure");
        logStreamFailure({
          episodeId,
          category,
          serverId: server.id,
          latencyMs,
          serversTried: [...serversTried],
          message:
            category === "timeout"
              ? "Provider request timed out"
              : "Provider sources call failed",
          error: err instanceof Error ? err.message : String(err),
        });
        recordFailure(server.id);
        continue;
      }
    }

    logStreamFailure({
      episodeId,
      category: "all_servers_failed",
      latencyMs: Date.now() - resolutionStart,
      serversTried: [...serversTried],
      message: "Exhausted all servers without a valid stream",
    });
    recordResolutionOutcome(false);
    throw new StreamResolutionError("No stream found", 404);
  } finally {
    await releaseLock(cacheKey).catch(() => {});
  }
}