import { Router } from "express";

const ANISKIP_BASE = "https://api.aniskip.com/v2/skip-times";
const UPSTREAM_TIMEOUT_MS = 12_000;
const DEFAULT_EPISODE_LENGTH = 1440;

export const skipTimesRouter = Router();

skipTimesRouter.get("/", async (req, res) => {
  const malId = Number(req.query.malId);
  const episode = Number(req.query.episode);
  const lengthRaw = req.query.episodeLength ?? req.query.duration;

  if (!Number.isFinite(malId) || malId <= 0 || !Number.isFinite(episode) || episode <= 0) {
    res.status(400).json({ found: false, error: "Invalid malId or episode" });
    return;
  }

  const parsedLength = Number(lengthRaw);
  const episodeLength =
    Number.isFinite(parsedLength) && parsedLength >= 60
      ? Math.round(parsedLength)
      : DEFAULT_EPISODE_LENGTH;

  const params = new URLSearchParams();
  for (const type of ["op", "ed", "mixed-op", "mixed-ed"]) {
    params.append("types", type);
  }
  params.set("episodeLength", String(episodeLength));

  try {
    const upstream = await fetch(`${ANISKIP_BASE}/${malId}/${episode}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(body);
  } catch {
    res.status(502).json({ found: false, error: "AniSkip request failed" });
  }
});
