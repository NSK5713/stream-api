import { Router } from "express";
import { resolveStreamV10, StreamResolutionError } from "../core/streamOrchestrator";
import type { StreamCategory } from "../lib/provider";
import { toEpisodeId, isValidEpisodeId } from "./ids";

export const streamRouter = Router();

streamRouter.get("/:episodeId", async (req, res) => {
  const rawId = String(req.params.episodeId || "").trim();
  const episodeId = toEpisodeId(rawId);

  console.log("🔥 STREAM REQUEST (V10)", { rawId, episodeId });

  // Validate ID format
  if (!isValidEpisodeId(episodeId)) {
    return res.status(400).json({
      ok: false,
      error: `Invalid episode ID format: ${episodeId}`,
    });
  }

  try {
    const result = await resolveStreamV10(
      episodeId,
      String(req.query.category ?? "sub") as StreamCategory
    );

    return res.json({
      ok: true,
      version: "v10",
      ...result,
    });
  } catch (err: any) {
    console.error("❌ STREAM ERROR:", err);

    return res.status(err.statusCode || 500).json({
      ok: false,
      error: err.message || "stream failed",
    });
  }
});