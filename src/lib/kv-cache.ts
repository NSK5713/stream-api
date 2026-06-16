import { createHash } from "node:crypto";

const CACHE_PREFIX = "nskanime:stream:v1:";

/** Supports legacy Vercel KV names and current Upstash Redis integration env vars. */
export function resolveRedisRestCredentials(): { url: string | null; token: string | null } {
  const url =
    process.env.KV_REST_API_URL?.trim() ||
    process.env.UPSTASH_REDIS_REST_URL?.trim() ||
    null;
  const token =
    process.env.KV_REST_API_TOKEN?.trim() ||
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    null;
  return { url, token };
}

export function streamCacheConfigured(): boolean {
  const { url, token } = resolveRedisRestCredentials();
  return Boolean(url && token);
}

function kvBaseUrl(): string | null {
  const { url } = resolveRedisRestCredentials();
  return url ? url.replace(/\/$/, "") : null;
}

function kvToken(): string | null {
  return resolveRedisRestCredentials().token;
}

async function kvCommand<T = unknown>(command: unknown[]): Promise<T | null> {
  const url = kvBaseUrl();
  const token = kvToken();
  if (!url || !token) return null;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
    });

    if (!response.ok) return null;
    const payload = (await response.json()) as { result?: T };
    return payload.result ?? null;
  } catch {
    return null;
  }
}

export async function kvGetJson<T>(key: string): Promise<T | null> {
  const url = kvBaseUrl();
  const token = kvToken();
  if (!url || !token) return null;

  try {
    const response = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as { result?: string | null };
    if (!payload.result) return null;
    return JSON.parse(payload.result) as T;
  } catch {
    return null;
  }
}

export async function kvSetJson(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
  const serialized = JSON.stringify(value);
  const result = await kvCommand<string>(["SET", key, serialized, "EX", ttlSeconds]);
  return result === "OK";
}

export function streamCacheKey(kind: string, parts: string[]): string {
  const digest = createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 32);
  return `${CACHE_PREFIX}${kind}:${digest}`;
}

export async function getOrSetCached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<{ value: T; cacheHit: boolean }> {
  if (streamCacheConfigured()) {
    const cached = await kvGetJson<T>(key);
    if (cached !== null) {
      return { value: cached, cacheHit: true };
    }
  }

  const value = await fetcher();

  if (streamCacheConfigured()) {
    void kvSetJson(key, value, ttlSeconds).catch(() => undefined);
  }

  return { value, cacheHit: false };
}

export function setHttpCacheControl(res: { setHeader: (name: string, value: string) => void }, ttlSeconds: number) {
  res.setHeader(
    "Cache-Control",
    `public, s-maxage=${ttlSeconds}, stale-while-revalidate=${Math.min(600, Math.floor(ttlSeconds / 6))}`,
  );
}

/** TTLs (seconds) — sources expire quickly; search/episodes are stable longer. */
export const STREAM_CACHE_TTL = {
  search: 10 * 60,
  episodes: 60 * 60,
  servers: 60 * 60,
  /** Short CDN cache only — playback URLs are time-limited. */
  sources: 30 * 60,
} as const;
