import { Router } from "express";
import {
  activeStreamProviderMode,
  ensureProviderConfigured,
  streamProviderCacheEnabled,
} from "../lib/provider";
import { probeAllAnimeSearch } from "../lib/allanime-provider";

export const healthRouter = Router();

healthRouter.get("/", async (req, res) => {
  let providerConfigured = false;
  try {
    ensureProviderConfigured();
    providerConfigured = true;
  } catch {
    providerConfigured = false;
  }

  const payload: Record<string, unknown> = {
    ok: true,
    providerConfigured,
    providerMode: activeStreamProviderMode,
    streamCache: streamProviderCacheEnabled ? "upstash-redis" : "disabled",
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  };

  if (String(req.query.probe ?? "") === "allanime") {
    payload.allanime = await probeAllAnimeSearch();
    payload.ok = providerConfigured && (payload.allanime as { ok: boolean }).ok;
  }

  res.status(200).json(payload);
});
