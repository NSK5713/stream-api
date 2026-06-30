import { Router } from "express";
import type { StreamCategory } from "../lib/provider";
import { setHttpCacheControl, STREAM_CACHE_TTL } from "../lib/kv-cache";
import { incrementMetric } from "../lib/metrics/runtime-metrics";
import {
  toAnimeId,
  toEpisodeId,
  isValidAnimeId,
  isValidEpisodeId,
} from "./ids";
import {
  getAnimeInfo,
  getEpisodeServers,
  getEpisodeWatchSources,
  searchAnime,
} from "../services/animeService";
import { logEpisodeResolution } from "../lib/episode-resolution";

export const animeRouter = Router();

animeRouter.get("/search", async (req, res) => {
  const query = String(req.query.q ?? req.query.query ?? "").trim();
  if (!query) {
    res.status(400).json({ error: "Missing query" });
    return;
  }

  try {
    const results = await searchAnime(query);
    setHttpCacheControl(res, STREAM_CACHE_TTL.search);
    res.status(200).json({ results });
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : "Provider search failed",
    });
  }
});

animeRouter.get("/info", async (req, res) => {
  const rawId = String(req.query.id ?? "").trim();
  if (!rawId) {
    res.status(400).json({ error: "Missing anime id" });
    return;
  }

  const animeId = toAnimeId(rawId);
  if (!isValidAnimeId(animeId)) {
    res.status(400).json({ error: `Invalid anime id format: ${rawId}` });
    return;
  }

  const hintsParam = req.query.hints;
  const searchHints =
    typeof hintsParam === "string"
      ? hintsParam
          .split("|")
          .map((hint) => decodeURIComponent(hint.trim()))
          .filter(Boolean)
      : [];
  const malId = Number(req.query.malId);
  const resolvedMalId = Number.isFinite(malId) && malId > 0 ? malId : undefined;
  const posterUrl = String(req.query.posterUrl ?? "").trim() || undefined;

  incrementMetric("animeInfoRequests");

  try {
    const result = await getAnimeInfo(animeId, searchHints, {
      malId: resolvedMalId,
      posterUrl,
    });
    logEpisodeResolution({
      incomingAnimeId: rawId,
      resolvedProviderAnime: { id: animeId },
      episodeListLength: Array.isArray(result.episodes) ? result.episodes.length : 0,
      requestedEpisodeNumber: 0,
      mappedEpisode: null,
    });
    setHttpCacheControl(res, STREAM_CACHE_TTL.episodes);
    res.status(200).json(result);
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : "Provider episodes failed",
    });
  }
});

animeRouter.get("/watch", async (req, res) => {
  const rawEpisodeId = String(req.query.episodeId ?? req.query.id ?? "").trim();
  const server = String(req.query.server ?? "").trim();
  const category = String(req.query.category ?? "sub") as StreamCategory;

  if (!rawEpisodeId) {
    res.status(400).json({ error: "Missing episode id" });
    return;
  }

  const episodeId = toEpisodeId(rawEpisodeId);
  if (!isValidEpisodeId(episodeId)) {
    res.status(400).json({ error: `Invalid episode id format: ${rawEpisodeId}` });
    return;
  }

  try {
    if (!server) {
      const data = await getEpisodeServers(episodeId);
      setHttpCacheControl(res, STREAM_CACHE_TTL.servers);
      res.status(200).json(data);
      return;
    }

    const data = await getEpisodeWatchSources(episodeId, server, category);
    res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
    res.status(200).json(data);
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : "Provider watch failed",
    });
  }
});

// Get anime episodes by id (path param)
animeRouter.get("/:id", async (req, res) => {
  const rawId = String(req.params.id ?? "").trim();
  if (!rawId) {
    res.status(400).json({ error: "Missing anime id" });
    return;
  }

  const animeId = toAnimeId(rawId);
  if (!isValidAnimeId(animeId)) {
    res.status(400).json({ error: `Invalid anime id format: ${rawId}` });
    return;
  }

  incrementMetric("animeInfoRequests");

  try {
    const result = await getAnimeInfo(animeId);
    logEpisodeResolution({
      incomingAnimeId: rawId,
      resolvedProviderAnime: { id: animeId },
      episodeListLength: Array.isArray(result.episodes) ? result.episodes.length : 0,
      requestedEpisodeNumber: 0,
      mappedEpisode: null,
    });
    setHttpCacheControl(res, STREAM_CACHE_TTL.episodes);
    res.status(200).json(result);
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : "Provider episodes failed",
    });
  }
});
