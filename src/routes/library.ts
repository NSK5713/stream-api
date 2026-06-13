import { Router } from "express";
import { createHash } from "node:crypto";
import { kvGetJson, kvSetJson, streamCacheConfigured } from "../../lib/kv-cache";

type LibraryBackup = {
  version: 1;
  updatedAt: number;
  statuses: Record<number, string>;
  pins: Record<number, unknown>;
  watchProgress: Record<string, unknown>;
  progressMap: Record<number, { progress: number; lastWatchedEpisode: number }>;
};

function syncKey(code: string) {
  const normalized = code.trim().toLowerCase();
  const hash = createHash("sha256").update(normalized).digest("hex");
  return `nskanime:library:${hash}`;
}

function invalidCode(code: unknown) {
  return typeof code !== "string" || code.trim().length < 6;
}

export const libraryRouter = Router();

libraryRouter.get("/sync", async (req, res) => {
  if (!streamCacheConfigured()) {
    res.status(503).json({
      available: false,
      error: "sync_not_configured",
      message: "Cloud sync storage is not configured. Use export/import on each device instead.",
    });
    return;
  }

  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (invalidCode(code)) {
    res.status(400).json({ error: "invalid_code", message: "Sync code must be at least 6 characters." });
    return;
  }

  const backup = await kvGetJson<LibraryBackup>(syncKey(code));
  if (!backup) {
    res.status(200).json({ available: true, backup: null, updatedAt: null });
    return;
  }

  res.status(200).json({ available: true, backup, updatedAt: backup.updatedAt ?? null });
});

libraryRouter.post("/sync", async (req, res) => {
  if (!streamCacheConfigured()) {
    res.status(503).json({
      available: false,
      error: "sync_not_configured",
      message: "Cloud sync storage is not configured. Use export/import on each device instead.",
    });
    return;
  }

  const body = (req.body ?? {}) as { code?: string; backup?: LibraryBackup };
  if (invalidCode(body.code)) {
    res.status(400).json({ error: "invalid_code", message: "Sync code must be at least 6 characters." });
    return;
  }
  if (!body.backup || body.backup.version !== 1) {
    res.status(400).json({ error: "invalid_backup", message: "Library backup payload is invalid." });
    return;
  }

  const payload: LibraryBackup = {
    ...body.backup,
    updatedAt: Date.now(),
  };

  const saved = await kvSetJson(syncKey(body.code!), payload, 60 * 60 * 24 * 30);
  if (!saved) {
    res.status(500).json({ error: "save_failed", message: "Could not save library backup." });
    return;
  }

  res.status(200).json({ available: true, backup: payload, updatedAt: payload.updatedAt });
});
