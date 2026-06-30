import { Router } from "express";
import { resolveStreamV10, StreamResolutionError } from "../core/streamOrchestrator";
import type { StreamCategory } from "../lib/provider";
import { incrementMetric } from "../lib/metrics/runtime-metrics";
import { RESOLVED_STREAM_TTL_SECONDS } from "../lib/streamUrlCache";
import { setHttpCacheControl } from "../lib/kv-cache";
import { toEpisodeId, isValidEpisodeId } from "./ids";

export const streamRouter = Router();

streamRouter.get("/:episodeId", async (req, res) => {
  const rawId = String(req.params.episodeId || "").trim();
  const episodeId = toEpisodeId(rawId);

  console.log("🔥 STREAM REQUEST (V10)", { rawId, episodeId });

  incrementMetric("streamRequests");

  // Validate ID format
  if (!isValidEpisodeId(episodeId)) {
    return res.status(400).json({
      ok: false,
      error: `Invalid episode ID format: ${episodeId}`,
    });
  }

  try {
    const started = Date.now();
    const result = await resolveStreamV10(
      episodeId,
      String(req.query.category ?? "sub") as StreamCategory
    );

    if ("cached" in result && result.cached) {
      setHttpCacheControl(res, Math.min(RESOLVED_STREAM_TTL_SECONDS, 300));
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("✅ STREAM RESPONSE (V10)", {
        episodeId,
        cached: "cached" in result ? result.cached : false,
        ms: Date.now() - started,
      });
    }

    return res.json({
      ok: true,
      version: "v10",
      ...result,
    });
  } catch (err: any) {
    console.error("❌ STREAM ERROR:", err);
    incrementMetric("streamFailures");

    return res.status(err.statusCode || 500).json({
      ok: false,
      error: err.message || "stream failed",
    });
  }
});