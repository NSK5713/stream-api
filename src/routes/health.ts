import { Router } from "express";
import {
  activeStreamProviderMode,
  ensureProviderConfigured,
  streamProviderCacheEnabled,
} from "../lib/provider";
import { probeAllAnimeSearch } from "../lib/allanime-provider";
import { isDeployedRuntime } from "../lib/deploy-env";

const API_REVISION = "2026-06-19-episode-cache-v2";

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
    revision: API_REVISION,
    deploy: {
      railway: Boolean(process.env.RAILWAY_ENVIRONMENT),
      nodeEnv: process.env.NODE_ENV ?? "unset",
      gitCommit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      deployed: isDeployedRuntime(),
    },
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  };

  if (String(req.query.probe ?? "") === "allanime") {
    payload.allanime = await probeAllAnimeSearch();
    payload.ok = providerConfigured && (payload.allanime as { ok: boolean }).ok;
  }

  if (String(req.query.probe ?? "") === "episodes") {
    try {
      const { allanimeProvider } = await import("../lib/allanime-provider");
      const result = await allanimeProvider.episodes("2P7kFgthrEfRRkcdm");
      payload.episodesProbe = { ok: result.episodes.length > 0, count: result.episodes.length };
    } catch (error) {
      payload.episodesProbe = {
        ok: false,
        error: error instanceof Error ? error.message : "episodes probe failed",
      };
    }
  }

  res.status(200).json(payload);
});
