import { Router } from "express";
import {
  activeStreamProviderMode,
  ensureProviderConfigured,
  streamProviderCacheEnabled,
} from "../lib/provider";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  let providerConfigured = false;
  try {
    ensureProviderConfigured();
    providerConfigured = true;
  } catch {
    providerConfigured = false;
  }

  res.status(200).json({
    ok: true,
    providerConfigured,
    providerMode: activeStreamProviderMode,
    streamCache: streamProviderCacheEnabled ? "upstash-redis" : "disabled",
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  });
});
