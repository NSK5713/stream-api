import { streamProvider, type StreamCategory } from "../lib/provider";
import type { EpisodeSourcesResponse } from "../lib/provider";
import type { EpisodeId } from "../types/episode";
import { acquireLock, releaseLock } from "../lib/lock";
import { canRequest, recordFailure, recordSuccess } from "../lib/circuitBreaker";
import {
  dedupeStreamResolution,
  getResolvedStreamCache,
  setResolvedStreamCache,
  type ResolvedStreamPayload,
} from "../lib/streamUrlCache";
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
function extractServers(serverData: unknown) {
  if (!serverData || typeof serverData !== "object") return [];
  const record = serverData as { servers?: unknown; data?: unknown };
  if (Array.isArray(record.servers)) return record.servers;
  if (Array.isArray(record.data)) return record.data;
  return [];
}

export class StreamResolutionError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
  }
}

function isAllAnimeEpisodeId(episodeId: EpisodeId): boolean {
  return episodeId.startsWith("allanime:");
}

async function resolveStreamUncached(
  episodeId: EpisodeId,
  category: StreamCategory,
): Promise<ResolvedStreamPayload> {
  const locked = await acquireLock(`stream:${episodeId}:${category}`, 10);

  if (!locked) {
    recordCircuitOpenSkip("lock-contention");
    for (let i = 0; i < 8; i++) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      const retry = await getResolvedStreamCache(episodeId, category);
      if (retry) {
        recordCacheHit();
        return retry;
      }
    }
  }

  recordResolutionStart();
  const resolutionStart = Date.now();
  const serversTried: string[] = [];

  try {
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

    // AllAnime sources() already walks every mirror — one call is enough.
    const serversToTry = isAllAnimeEpisodeId(episodeId) ? servers.slice(0, 1) : servers;

    for (const server of serversToTry) {
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

        const latencyMs = Date.now() - attemptStart;
        recordServerAttempt(server.id, latencyMs, "success");
        recordSuccess(server.id);
        recordResolutionOutcome(true);

        const output: ResolvedStreamPayload = {
          episodeId,
          server,
          sources: res.sources,
          headers: res.headers,
          subtitles: res.subtitles,
        };

        await setResolvedStreamCache(episodeId, category, output);
        return output;
      } catch (err) {
        const latencyMs = Date.now() - attemptStart;
        const failureCategory = isTimeoutError(err) ? "timeout" : "provider_error";
        recordServerAttempt(server.id, latencyMs, "failure");
        logStreamFailure({
          episodeId,
          category: failureCategory,
          serverId: server.id,
          latencyMs,
          serversTried: [...serversTried],
          message:
            failureCategory === "timeout"
              ? "Provider request timed out"
              : "Provider sources call failed",
          error: err instanceof Error ? err.message : String(err),
        });
        recordFailure(server.id);
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
    await releaseLock(`stream:${episodeId}:${category}`).catch(() => undefined);
  }
}

export async function resolveStreamV10(episodeId: EpisodeId, category: StreamCategory) {
  const cached = await getResolvedStreamCache(episodeId, category);
  if (cached) {
    recordCacheHit();
    return { ...cached, cached: true };
  }

  return dedupeStreamResolution(episodeId, category, async () => {
    const retry = await getResolvedStreamCache(episodeId, category);
    if (retry) {
      recordCacheHit();
      return { ...retry, cached: true };
    }

    const output = await resolveStreamUncached(episodeId, category);
    return output;
  });
}
