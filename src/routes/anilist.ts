import { Router } from "express";

const ANILIST_URL = "https://graphql.anilist.co";
const FRESH_TTL_MS = 25 * 60 * 1000;
const STALE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 400;
const UPSTREAM_MIN_GAP_MS = 600;
const UPSTREAM_MAX_GAP_MS = 5000;
const UPSTREAM_RATE_LIMIT_BACKOFF_BASE_MS = 2000;
const UPSTREAM_RATE_LIMIT_MAX_RETRIES = 3;

type CacheEntry = {
  status: number;
  body: string;
  freshUntil: number;
  staleUntil: number;
};

const responseCache = new Map<string, CacheEntry>();
const inflightUpstream = new Map<string, Promise<{ status: number; body: string }>>();

let upstreamRequestChain: Promise<unknown> = Promise.resolve();
let lastUpstreamRequestAt = 0;
let upstreamRequestGapMs = UPSTREAM_MIN_GAP_MS;

function stableCacheKey(query: string, variables: Record<string, unknown> | undefined): string {
  return JSON.stringify({ query, variables: variables ?? {} });
}

function readCachedResponse(key: string, allowStale: boolean): CacheEntry | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() <= entry.freshUntil) return entry;
  if (allowStale && Date.now() <= entry.staleUntil) return entry;
  if (Date.now() > entry.staleUntil) responseCache.delete(key);
  return null;
}

function writeCachedResponse(key: string, status: number, body: string) {
  const now = Date.now();
  responseCache.set(key, {
    status,
    body,
    freshUntil: now + FRESH_TTL_MS,
    staleUntil: now + STALE_TTL_MS,
  });

  if (responseCache.size <= MAX_CACHE_ENTRIES) return;

  const oldest = [...responseCache.entries()].sort((a, b) => a[1].freshUntil - b[1].freshUntil);
  for (const [cacheKey] of oldest.slice(0, responseCache.size - MAX_CACHE_ENTRIES)) {
    responseCache.delete(cacheKey);
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function noteUpstreamRateLimit() {
  upstreamRequestGapMs = Math.min(upstreamRequestGapMs * 2, UPSTREAM_MAX_GAP_MS);
}

function noteUpstreamSuccess() {
  if (upstreamRequestGapMs > UPSTREAM_MIN_GAP_MS) {
    upstreamRequestGapMs = Math.max(UPSTREAM_MIN_GAP_MS, Math.floor(upstreamRequestGapMs * 0.75));
  }
}

async function waitForUpstreamSlot() {
  const waitMs = upstreamRequestGapMs - (Date.now() - lastUpstreamRequestAt);
  if (waitMs > 0) await delay(waitMs);
  lastUpstreamRequestAt = Date.now();
}

function scheduleUpstreamRequest<T>(task: () => Promise<T>): Promise<T> {
  const run = upstreamRequestChain.then(async () => {
    await waitForUpstreamSlot();
    return task();
  }, async () => {
    await waitForUpstreamSlot();
    return task();
  });
  upstreamRequestChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function fetchUpstream(
  payload: { query: string; variables?: Record<string, unknown> },
  staleFallback: CacheEntry | null,
): Promise<{ status: number; body: string }> {
  let lastResult: { status: number; body: string } | null = null;

  for (let attempt = 0; attempt <= UPSTREAM_RATE_LIMIT_MAX_RETRIES; attempt += 1) {
    const upstream = await scheduleUpstreamRequest(() =>
      fetch(ANILIST_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          query: payload.query,
          variables: payload.variables ?? {},
        }),
      }),
    );

    const text = await upstream.text();
    lastResult = { status: upstream.status, body: text };

    if (upstream.ok) {
      noteUpstreamSuccess();
      return lastResult;
    }

    if (upstream.status === 404) {
      noteUpstreamSuccess();
      return { status: 200, body: JSON.stringify({ data: { Media: null } }) };
    }

    if (upstream.status !== 429) {
      return lastResult;
    }

    noteUpstreamRateLimit();
    if (staleFallback) {
      return { status: staleFallback.status, body: staleFallback.body };
    }
    if (attempt >= UPSTREAM_RATE_LIMIT_MAX_RETRIES) break;

    const backoffMs = UPSTREAM_RATE_LIMIT_BACKOFF_BASE_MS * 2 ** attempt;
    await delay(backoffMs);
  }

  return lastResult ?? { status: 502, body: JSON.stringify({ error: "AniList upstream failed" }) };
}

async function resolveUpstream(
  cacheKey: string,
  payload: { query: string; variables?: Record<string, unknown> },
): Promise<{ status: number; body: string; cache: "HIT" | "STALE" | "MISS" }> {
  const staleCached = readCachedResponse(cacheKey, true);

  const inflight = inflightUpstream.get(cacheKey);
  if (inflight) {
    const result = await inflight;
    return { ...result, cache: "MISS" };
  }

  const task = fetchUpstream(payload, staleCached);
  inflightUpstream.set(cacheKey, task);
  try {
    const result = await task;
    if (result.status >= 200 && result.status < 300) {
      writeCachedResponse(cacheKey, result.status, result.body);
      return { ...result, cache: "MISS" };
    }

    if (result.status === 429 && staleCached) {
      return { status: 200, body: staleCached.body, cache: "STALE" };
    }

    return { ...result, cache: "MISS" };
  } finally {
    inflightUpstream.delete(cacheKey);
  }
}

export const anilistRouter = Router();

anilistRouter.post("/", async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object" || typeof (body as { query?: unknown }).query !== "string") {
    res.status(400).json({ error: "Missing GraphQL query" });
    return;
  }

  const payload = body as { query: string; variables?: Record<string, unknown> };
  const cacheKey = stableCacheKey(payload.query, payload.variables);
  const freshCached = readCachedResponse(cacheKey, false);
  if (freshCached) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("X-NSKAnime-Cache", "HIT");
    res.status(freshCached.status).end(freshCached.body);
    return;
  }

  try {
    const upstream = await resolveUpstream(cacheKey, payload);

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    if (upstream.cache === "STALE") {
      res.setHeader("X-NSKAnime-Cache", "STALE");
      res.setHeader("Retry-After", "60");
      res.status(200).end(upstream.body);
      return;
    }

    if (upstream.status === 429) {
      res.setHeader("Retry-After", "60");
    }
    res.status(upstream.status).end(upstream.body);
  } catch (error) {
    const staleCached = readCachedResponse(cacheKey, true);
    if (staleCached) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("X-NSKAnime-Cache", "STALE");
      res.status(200).end(staleCached.body);
      return;
    }

    res.status(502).json({
      error: error instanceof Error ? error.message : "AniList proxy failed",
    });
  }
});
