import crypto from "node:crypto";
import type { EpisodeSourcesResponse } from "./provider";
import { isDeployedRuntime } from "./deploy-env";
import { isAdHeavyEmbedUrl } from "./ad-embed-domains";
import { isEdgeProxyBlockedPlaybackUrl } from "./proxy-allowlist";

export type AllAnimeProviderConfig = {
  apiUrl?: string;
  fetchUrl?: string;
  relayToken?: string;
};

let providerConfig: AllAnimeProviderConfig = {};

/** Runtime config for Workers (env bindings) and optional Node overrides. */
export function configureAllAnimeProvider(config: AllAnimeProviderConfig): void {
  providerConfig = { ...providerConfig, ...config };
}

function readNodeEnv(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  const value = process.env?.[name];
  return typeof value === "string" ? value.trim() : undefined;
}

function configuredValue(key: keyof AllAnimeProviderConfig, nodeEnvName: string): string | undefined {
  const fromConfig = providerConfig[key]?.trim();
  if (fromConfig) return fromConfig;
  return readNodeEnv(nodeEnvName);
}

const ALLANIME_REFERER = "https://youtu-chan.com";
const ALLANIME_ORIGIN = "https://allanime.day";
const ALLANIME_BASE = "https://allanime.day";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const ALLANIME_KEY = crypto.createHash("sha256").update("Xot36i3lK3:v1").digest();
const ALLANIME_FETCH_TIMEOUT_MS = 10_000;
const DIRECT_MIRROR_TIMEOUT_MS = 4_000;
const CLOCK_MIRROR_TIMEOUT_MS = 6_000;
const EMBED_EXTRACT_TIMEOUT_MS = 8_000;
const FAST_MIRROR_PROBE_COUNT = 2;
const MIRROR_RESOLVE_TIMEOUT_MS = 6_000;
const MIRROR_PROBE_BATCH_SIZE = 4;

const PRODUCTION_ALLANIME_RELAY = "https://nskanime.uk/r/v1/gql";
const PRODUCTION_ALLANIME_RELAY_FALLBACK = "https://nskanime.uk/allanime-api";
const PRODUCTION_ALLANIME_RELAY_WORKERS_DEV = "https://nskanime.nskanime.workers.dev/r/v1/gql";
const PRODUCTION_FETCH_RELAY = "https://nskanime.uk/r/v1/fetch";
const PRODUCTION_FETCH_RELAY_FALLBACK = "https://nskanime.uk/allanime-fetch";
const PRODUCTION_FETCH_RELAY_WORKERS_DEV = "https://nskanime.nskanime.workers.dev/r/v1/fetch";
const DIRECT_ALLANIME_API = "https://api.allanime.day/api";

function resolveAllAnimeApiCandidates(): string[] {
  const configured =
    configuredValue("apiUrl", "ALLANIME_API_URL")?.replace(/\/$/, "") ?? "";
  const workersDev = process.env.ALLANIME_WORKERS_DEV_URL?.trim()?.replace(/\/$/, "") ?? "";
  const usesRelay =
    configured.includes("/allanime-api") ||
    configured.includes("/r/v1/gql") ||
    configured.includes("workers.dev");
  const candidates: string[] = [];

  if (configured) {
    if (usesRelay) {
      return [configured];
    }
    candidates.push(configured);
  }

  // Railway/datacenter egress is blocked by AllAnime — relay must win on deployed runtimes.
  if (isDeployedRuntime()) {
    candidates.push(
      PRODUCTION_ALLANIME_RELAY,
      PRODUCTION_ALLANIME_RELAY_FALLBACK,
      PRODUCTION_ALLANIME_RELAY_WORKERS_DEV,
    );
    if (workersDev) candidates.push(workersDev);
    if (
      configured &&
      configured !== DIRECT_ALLANIME_API &&
      configured !== PRODUCTION_ALLANIME_RELAY &&
      configured !== PRODUCTION_ALLANIME_RELAY_FALLBACK
    ) {
      // already pushed when not relay-only
    }
    candidates.push(DIRECT_ALLANIME_API);
    return [...new Set(candidates.filter(Boolean))];
  }

  if (configured) candidates.push(configured);
  candidates.push(DIRECT_ALLANIME_API);
  return [...new Set(candidates.filter(Boolean))];
}

async function fetchAllAnimeApi(init: RequestInit): Promise<Response> {
  const candidates = resolveAllAnimeApiCandidates();
  let lastResponse: Response | null = null;
  let lastError: unknown = null;

  for (const apiUrl of candidates) {
    try {
      const response = await fetchAllAnime(apiUrl, init);
      if (response.ok) return response;
      if ([401, 403, 429, 502, 503, 504].includes(response.status)) {
        lastResponse = response;
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError instanceof Error ? lastError : new Error("AllAnime request failed");
}

function resolveFetchRelayCandidates(): string[] {
  const configured =
    configuredValue("fetchUrl", "ALLANIME_FETCH_RELAY_URL")?.replace(/\/$/, "") ??
    configuredValue("fetchUrl", "ALLANIME_FETCH_URL")?.replace(/\/$/, "") ??
    "";
  if (configured) return [configured];

  if (isDeployedRuntime()) {
    return [
      ...new Set([
        PRODUCTION_FETCH_RELAY,
        PRODUCTION_FETCH_RELAY_FALLBACK,
        PRODUCTION_FETCH_RELAY_WORKERS_DEV,
      ]),
    ];
  }

  return [PRODUCTION_FETCH_RELAY];
}

function allAnimeRelayHeaders(): Record<string, string> {
  const token = configuredValue("relayToken", "ALLANIME_RELAY_TOKEN");
  if (!token) return {};
  return { "x-allanime-relay-token": token };
}

function shouldUseFetchRelay(): boolean {
  if (process.env.ALLANIME_FETCH_RELAY_URL?.trim()) return true;
  return isDeployedRuntime();
}

async function fetchForAllAnime(targetUrl: string, accept = "*/*"): Promise<Response> {
  if (shouldUseFetchRelay()) {
    let lastError: unknown = null;
    for (const relayBase of resolveFetchRelayCandidates()) {
      try {
        const relayUrl = `${relayBase}?url=${encodeURIComponent(targetUrl)}`;
        const response = await fetchAllAnime(relayUrl, {
          headers: {
            ...buildAllAnimeHeaders({ Accept: accept }),
            ...allAnimeRelayHeaders(),
          },
        });
        if (response.ok) return response;
        if ([403, 429, 502, 503, 504].includes(response.status)) continue;
        return response;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("AllAnime fetch relay failed");
  }

  return fetchAllAnime(targetUrl, {
    headers: {
      Referer: ALLANIME_REFERER,
      Origin: ALLANIME_ORIGIN,
      Accept: accept,
      "User-Agent": USER_AGENT,
    },
  });
}

function resolveAllAnimeApiUrl(): string {
  const configured = configuredValue("apiUrl", "ALLANIME_API_URL");
  if (configured) return configured.replace(/\/$/, "");

  if (isDeployedRuntime()) {
    return PRODUCTION_ALLANIME_RELAY;
  }

  return DIRECT_ALLANIME_API;
}

function buildAllAnimeHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    Referer: ALLANIME_REFERER,
    Origin: ALLANIME_REFERER,
    "User-Agent": USER_AGENT,
    ...extra,
  };

  const relayToken = configuredValue("relayToken", "ALLANIME_RELAY_TOKEN");
  if (relayToken) {
    headers["x-allanime-relay-token"] = relayToken;
  }

  return headers;
}

async function fetchAllAnime(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ALLANIME_FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

const PREFERRED_PROVIDERS = ["S-mp4", "Luf-Mp4", "Default", "Yt-mp4", "Ss-Hls"];

/** Static server list — avoids a slow episode payload round-trip during stream resolution. */
export const DEFAULT_ALLANIME_EPISODE_SERVERS = PREFERRED_PROVIDERS.map((name) => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "default",
  name,
  category: "sub" as const,
}));
const EPISODE_QUERY_HASH = "d405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec";

type AllAnimeShowEdge = {
  _id: string;
  name: string;
  availableEpisodes?: { sub?: number; dub?: number; raw?: number };
};

type AllAnimeEpisodeSource = {
  sourceUrl?: string;
  sourceName?: string;
  type?: string;
  stype?: string;
  fallBack?: string;
};

type ClockLink = {
  link?: string;
  resolutionStr?: string;
  hls?: boolean;
  headers?: Record<string, string>;
};

type ClockResponse = {
  links?: ClockLink[];
};

export function decryptAllAnimePayload(payload: unknown): string {
  const record = payload as { data?: { tobeparsed?: string }; tobeparsed?: string };
  const encoded = record?.data?.tobeparsed ?? record?.tobeparsed;
  if (!encoded) {
    return typeof payload === "string" ? payload : JSON.stringify(payload);
  }

  const buffer = Buffer.from(encoded, "base64");
  const iv = buffer.subarray(1, 13);
  const ciphertext = buffer.subarray(13, buffer.length - 16);
  const counter = new Uint8Array([...iv, 0, 0, 0, 2]);
  const key = new Uint8Array(ALLANIME_KEY.buffer, ALLANIME_KEY.byteOffset, ALLANIME_KEY.byteLength);
  const decipher = crypto.createDecipheriv("aes-256-ctr", key, counter);
  const part1 = decipher.update(new Uint8Array(ciphertext));
  const part2 = decipher.final();
  const decrypted = new Uint8Array(part1.length + part2.length);
  decrypted.set(part1, 0);
  decrypted.set(part2, part1.length);
  return new TextDecoder().decode(decrypted);
}

function normalizeTobeparsed(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeTobeparsed(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    normalized[key] = normalizeTobeparsed(entry);
  }

  const encrypted = typeof normalized.tobeparsed === "string" ? normalized.tobeparsed : null;
  if (encrypted) {
    try {
      const decrypted = JSON.parse(decryptAllAnimePayload({ tobeparsed: encrypted }));
      delete normalized.tobeparsed;
      if (decrypted && typeof decrypted === "object" && !Array.isArray(decrypted)) {
        return { ...normalized, ...(decrypted as Record<string, unknown>) };
      }
      normalized.data = decrypted;
    } catch {
      // Keep encrypted payload if decryption fails.
    }
  }

  return normalized;
}

function unwrapAllAnimeGqlData(normalized: Record<string, unknown>): Record<string, unknown> {
  let layer = (normalized.data ?? normalized) as Record<string, unknown>;
  if (layer.data && typeof layer.data === "object" && !Array.isArray(layer.data)) {
    const inner = layer.data as Record<string, unknown>;
    if (inner.show || inner.shows || inner.episode) {
      layer = inner;
    }
  }
  return layer;
}

async function allAnimeGql<T extends Record<string, unknown>>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await fetchAllAnimeApi({
    method: "POST",
    headers: buildAllAnimeHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ variables, query }),
  });

  if (!response.ok) {
    throw new Error(`AllAnime request failed: ${response.status}`);
  }

  const json = (await response.json()) as unknown;
  const normalized = normalizeTobeparsed(json) as Record<string, unknown>;
  return unwrapAllAnimeGqlData(normalized) as T;
}

type EpisodePayload = { episode?: { sourceUrls?: AllAnimeEpisodeSource[] } };

const episodePayloadCache = new Map<string, { payload: EpisodePayload; expires: number }>();
const EPISODE_PAYLOAD_CACHE_TTL_MS = 5 * 60 * 1000;

const showEpisodesCache = new Map<string, { episodes: Array<{ id: string; number: number; title: string }>; expires: number }>();
const SHOW_EPISODES_CACHE_TTL_MS = 60 * 60 * 1000;

async function fetchEpisodePayload(
  showId: string,
  translationType: string,
  episodeStringValue: string,
): Promise<EpisodePayload> {
  const variables = { showId, translationType, episodeString: episodeStringValue };
  const extensions = { persistedQuery: { version: 1, sha256Hash: EPISODE_QUERY_HASH } };

  const response = await fetchAllAnimeApi({
    method: "POST",
    headers: buildAllAnimeHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ variables, extensions }),
  });

  if (!response.ok) {
    throw new Error(`AllAnime episode request failed: ${response.status}`);
  }

  const json = (await response.json()) as unknown;
  const normalized = normalizeTobeparsed(json) as Record<string, unknown>;
  return unwrapAllAnimeGqlData(normalized) as EpisodePayload;
}

async function getEpisodePayload(
  showId: string,
  translationType: string,
  episodeStringValue: string,
): Promise<EpisodePayload> {
  const cacheKey = `${showId}:${translationType}:${episodeStringValue}`;
  const cached = episodePayloadCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    const cachedSources = cached.payload.episode?.sourceUrls ?? [];
    if (cachedSources.length > 0) return cached.payload;
  }

  let lastPayload: EpisodePayload = { episode: undefined };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const payload = await fetchEpisodePayload(showId, translationType, episodeStringValue);
      lastPayload = payload;
      const sourceUrls = payload.episode?.sourceUrls ?? [];
      if (sourceUrls.length > 0) {
        episodePayloadCache.set(cacheKey, {
          payload,
          expires: Date.now() + EPISODE_PAYLOAD_CACHE_TTL_MS,
        });
        return payload;
      }
    } catch (error) {
      if (attempt === 2) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 400 + attempt * 300));
  }

  episodePayloadCache.set(cacheKey, {
    payload: lastPayload,
    expires: Date.now() + EPISODE_PAYLOAD_CACHE_TTL_MS,
  });
  return lastPayload;
}

function mapMode(category: string): "sub" | "dub" | "raw" {
  if (category === "dub") return "dub";
  if (category === "raw") return "raw";
  return "sub";
}

function sortSourcesByPreference(sources: AllAnimeEpisodeSource[]): AllAnimeEpisodeSource[] {
  return [...sources].sort((left, right) => {
    const leftIndex = PREFERRED_PROVIDERS.indexOf(left.sourceName ?? "");
    const rightIndex = PREFERRED_PROVIDERS.indexOf(right.sourceName ?? "");
    const leftRank = leftIndex === -1 ? PREFERRED_PROVIDERS.length : leftIndex;
    const rightRank = rightIndex === -1 ? PREFERRED_PROVIDERS.length : rightIndex;
    return leftRank - rightRank;
  });
}

function isIframeSource(source: AllAnimeEpisodeSource): boolean {
  if (decodeProviderPath(source.sourceUrl ?? "")) return false;
  if (source.type === "iframe" && !decodeProviderPath(source.sourceUrl ?? "")) {
    return true;
  }
  const providerUrl = resolveProviderUrl(source.sourceUrl ?? "");
  if (!providerUrl.startsWith("http") || providerUrl.includes("allanime.day")) return false;
  if (source.type === "iframe") return true;
  if (/\/e\/[A-Za-z0-9_-]+/.test(providerUrl)) return true;
  return false;
}

function isAdHeavyEmbedSource(source: AllAnimeEpisodeSource): boolean {
  return isAdHeavyEmbedUrl(resolveProviderUrl(source.sourceUrl ?? ""));
}

function classifyPlaybackSource(url: string): EpisodeSourcesResponse["sources"][0] | null {
  if (isAdHeavyEmbedUrl(url)) return null;

  const isHls = url.includes(".m3u8");
  const isDirectMedia =
    /\.(m3u8|mp4)(\?|#|$)/i.test(url) || url.includes("tools.fast4speed.rsvp/");
  if (isDirectMedia) {
    return { url, type: isHls ? "hls" : "mp4", isM3U8: isHls };
  }

  if (isEdgeProxyBlockedPlaybackUrl(url)) return null;
  return { url, type: "iframe" };
}

function resolveIframeSource(source: AllAnimeEpisodeSource): EpisodeSourcesResponse | null {
  const rawUrl = source.sourceUrl ?? "";
  if (decodeProviderPath(rawUrl)) return null;

  const embedUrl = resolveProviderUrl(rawUrl);
  if (!embedUrl.startsWith("http") || embedUrl.includes("allanime.day")) return null;

  const playback = classifyPlaybackSource(embedUrl);
  if (!playback) return null;

  return {
    sources: [playback],
    headers: { Referer: ALLANIME_REFERER },
  };
}

function isDirectSource(source: AllAnimeEpisodeSource, providerUrl: string): boolean {
  if (source.type === "iframe") return false;
  if (source.type === "player" || source.fallBack === "mp4") return true;
  if (decodeProviderPath(source.sourceUrl ?? "")) return false;
  return providerUrl.startsWith("http") && !providerUrl.includes("allanime.day");
}

function decodeJsonUrl(value: string): string {
  return value.replace(/\\u0026/g, "&").replace(/\\\//g, "/");
}

function extractSourcesFromEmbedHtml(html: string, embedUrl: string): EpisodeSourcesResponse | null {
  const referer = html.match(/"Referer":"([^"]*)"/)?.[1] ?? ALLANIME_REFERER;

  const hlsMatch =
    html.match(/"hls","url":"([^"]+)"/) ??
    html.match(/"file"\s*:\s*"([^"]+\.m3u8[^"]*)"/i) ??
    html.match(/"url"\s*:\s*"([^"]+\.m3u8[^"]*)"/i);
  if (hlsMatch?.[1]) {
    return {
      sources: [{ url: decodeJsonUrl(hlsMatch[1]), type: "hls", isM3U8: true }],
      headers: { Referer: referer },
    };
  }

  const mp4Match =
    html.match(/"link":"([^"]+)".*"resolutionStr":"([^"]+)"/) ??
    html.match(/"file"\s*:\s*"([^"]+\.mp4[^"]*)"/i) ??
    html.match(/"sources"\s*:\s*\[\s*\{\s*"file"\s*:\s*"([^"]+\.mp4[^"]*)"/i);
  if (mp4Match?.[1]) {
    return {
      sources: [{
        url: decodeJsonUrl(mp4Match[1]),
        type: "mp4",
        quality: mp4Match[2],
      }],
      headers: { Referer: referer },
    };
  }

  const escapedM3u8 = html.match(/https?:\\\/\\\/[^"\\]+\.m3u8[^"\\]*/i);
  if (escapedM3u8?.[0]) {
    return {
      sources: [{ url: decodeJsonUrl(escapedM3u8[0]), type: "hls", isM3U8: true }],
      headers: { Referer: referer },
    };
  }

  const directM3u8 = html.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
  if (directM3u8?.[0]) {
    return {
      sources: [{ url: directM3u8[0], type: "hls", isM3U8: true }],
      headers: { Referer: referer },
    };
  }

  if (embedUrl.includes(".m3u8")) {
    return {
      sources: [{ url: embedUrl, type: "hls", isM3U8: true }],
      headers: { Referer: referer },
    };
  }

  return null;
}

function slugifyServer(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "default";
}

function decodeProviderPath(raw: string): string | null {
  if (!raw.startsWith("--")) return null;

  const bytes = raw.slice(2);
  if (bytes.length % 2 !== 0) return null;

  let decoded = "";
  for (let index = 0; index < bytes.length; index += 2) {
    const pair = bytes.slice(index, index + 2).toLowerCase();
    const byte = Number.parseInt(pair, 16);
    if (!Number.isFinite(byte)) return null;
    const char = String.fromCharCode(byte ^ 0x38);
    if (char.charCodeAt(0) < 33 || char.charCodeAt(0) > 126) return null;
    decoded += char;
  }

  if (decoded.includes("/clock") && !decoded.includes(".json")) {
    decoded = decoded.replace("/clock", "/clock.json");
  }

  return decoded;
}

function resolveProviderUrl(raw: string): string {
  const decoded = decodeProviderPath(raw);
  if (decoded) {
    return decoded.startsWith("http") ? decoded : `${ALLANIME_BASE}${decoded}`;
  }
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("http")) return raw;
  if (raw.startsWith("/")) return `${ALLANIME_BASE}${raw}`;
  return raw;
}

async function fetchClockJson(url: string): Promise<ClockResponse> {
  const response = await fetchForAllAnime(url, "application/json");

  if (!response.ok) {
    throw new Error(`AllAnime clock request failed: ${response.status}`);
  }

  const text = await response.text();
  try {
    return JSON.parse(text) as ClockResponse;
  } catch {
    const isExternal = url.startsWith("http") && !url.includes("allanime.day");
    if (isExternal) {
      return {
        links: [{ link: url, hls: url.includes(".m3u8"), resolutionStr: "auto" }],
      };
    }
    throw new Error("AllAnime clock response was not valid JSON.");
  }
}

async function resolveEmbedSources(embedUrl: string): Promise<EpisodeSourcesResponse> {
  let response: Response;
  try {
    response = await fetchForAllAnime(embedUrl, "text/html,application/xhtml+xml,*/*");
  } catch {
    throw new Error("AllAnime embed fetch failed.");
  }

  if (!response.ok) {
    throw new Error(`AllAnime embed fetch failed: ${response.status}`);
  }

  const html = await response.text().catch(() => "");
  const extracted = extractSourcesFromEmbedHtml(html, embedUrl);
  if (extracted) return extracted;

  throw new Error("No playable AllAnime embed source found.");
}

function shouldRejectResolvedPlaybackUrl(url: string): boolean {
  return isAdHeavyEmbedUrl(url);
}

async function resolveSourceWithTimeout(
  source: AllAnimeEpisodeSource,
  timeoutMs: number,
): Promise<EpisodeSourcesResponse> {
  const resolved = await Promise.race([
    resolveSourceDescriptor(source),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`AllAnime mirror "${source.sourceName ?? "unknown"}" timed out`)), timeoutMs);
    }),
  ]);

  const playback = resolved.sources[0];
  const playbackUrl = playback?.url;
  if (!playback || !playbackUrl) {
    throw new Error(`AllAnime mirror "${source.sourceName ?? "unknown"}" returned no playback URL`);
  }

  if (playback.type === "iframe") {
    const reclassified = classifyPlaybackSource(playbackUrl);
    if (reclassified && reclassified.type !== "iframe") {
      return { ...resolved, sources: [reclassified] };
    }
    throw new Error(`AllAnime mirror "${source.sourceName ?? "unknown"}" returned iframe-only source`);
  }

  if (shouldRejectResolvedPlaybackUrl(playbackUrl)) {
    throw new Error(`AllAnime mirror "${source.sourceName ?? "unknown"}" blocked from edge proxy`);
  }

  return resolved;
}

async function resolveSourceDescriptor(source: AllAnimeEpisodeSource): Promise<EpisodeSourcesResponse> {
  const rawUrl = source.sourceUrl ?? "";
  const providerUrl = resolveProviderUrl(rawUrl);

  if (isDirectSource(source, providerUrl)) {
    const isHls = providerUrl.includes(".m3u8") || source.sourceName?.toLowerCase().includes("hls");
    return {
      sources: [{ url: providerUrl, type: isHls ? "hls" : "mp4", isM3U8: isHls }],
      headers: { Referer: ALLANIME_REFERER },
    };
  }

  if (decodeProviderPath(rawUrl)) {
    const clock = await fetchClockJson(providerUrl);
    const links = clock.links ?? [];
    if (!links.length) {
      throw new Error("AllAnime clock returned no links.");
    }

    const sortedByResolution = [...links].sort(
      (a, b) => Number(b.resolutionStr?.replace(/\D/g, "") ?? 0) - Number(a.resolutionStr?.replace(/\D/g, "") ?? 0),
    );
    const best =
      sortedByResolution.find(
        (link) => link.link && !link.hls && !link.link.includes(".m3u8"),
      ) ??
      sortedByResolution.find((link) => link.hls || link.link?.includes(".m3u8")) ??
      sortedByResolution[0];

    if (!best?.link) {
      throw new Error("AllAnime clock link missing.");
    }

    const isHls = Boolean(best.hls || best.link.includes(".m3u8"));
    return {
      sources: [{ url: best.link, type: isHls ? "hls" : "mp4", isM3U8: isHls, quality: best.resolutionStr }],
      headers: { Referer: best.headers?.Referer ?? ALLANIME_REFERER, ...best.headers },
    };
  }

  return resolveEmbedSources(providerUrl);
}

async function resolveSourcesFromMirrors(
  tryOrder: AllAnimeEpisodeSource[],
  adHeavyTail: AllAnimeEpisodeSource[],
): Promise<EpisodeSourcesResponse> {
  const allSources = [...tryOrder, ...adHeavyTail];
  let iframeFallback: EpisodeSourcesResponse | null = null;
  let lastError: unknown;

  for (let index = 0; index < allSources.length; index += MIRROR_PROBE_BATCH_SIZE) {
    const batch = allSources.slice(index, index + MIRROR_PROBE_BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map((source) => resolveSourceWithTimeout(source, MIRROR_RESOLVE_TIMEOUT_MS)),
    );

    for (let batchIndex = 0; batchIndex < settled.length; batchIndex += 1) {
      const outcome = settled[batchIndex];
      const source = batch[batchIndex];
      if (outcome.status === "fulfilled") {
        return outcome.value;
      }

      lastError = outcome.reason;
      const iframe = resolveIframeSource(source);
      if (iframe && !iframeFallback) {
        iframeFallback = iframe;
      }
    }

    // Prefer a clean iframe after non-ad-heavy mirrors are exhausted.
    if (iframeFallback && index + MIRROR_PROBE_BATCH_SIZE >= tryOrder.length) {
      return iframeFallback;
    }
  }

  if (iframeFallback) return iframeFallback;
  throw lastError instanceof Error ? lastError : new Error("AllAnime sources unavailable.");
}

export const allanimeProvider = {
  async search(query: string) {
    const data = await allAnimeGql<{ shows?: { edges?: AllAnimeShowEdge[] } }>(
      `query($search: SearchInput, $limit: Int, $page: Int, $translationType: VaildTranslationTypeEnumType, $countryOrigin: VaildCountryOriginEnumType) {
        shows(search: $search, limit: $limit, page: $page, translationType: $translationType, countryOrigin: $countryOrigin) {
          edges { _id name availableEpisodes __typename }
        }
      }`,
      {
        search: { allowAdult: false, allowUnknown: false, query },
        limit: 25,
        page: 1,
        translationType: "sub",
        countryOrigin: "ALL",
      },
    );

    const results = (data.shows?.edges ?? []).map((edge) => ({
      id: edge._id,
      title: edge.name,
      releaseYear: undefined,
    }));

    return { results };
  },

  async getShowName(showId: string): Promise<string | null> {
    const data = await allAnimeGql<{ show?: { name?: string } }>(
      `query($showId: String!) { show(_id: $showId) { name } }`,
      { showId },
    );
    return data.show?.name ?? null;
  },

  async episodes(showId: string) {
    const cached = showEpisodesCache.get(showId);
    if (cached && cached.expires > Date.now() && cached.episodes.length > 0) {
      return { episodes: cached.episodes };
    }

    const data = await allAnimeGql<{ show?: { availableEpisodesDetail?: Record<string, string[]> } }>(
      `query($showId: String!) { show(_id: $showId) { _id availableEpisodesDetail }}`,
      { showId },
    );

    const detail = data.show?.availableEpisodesDetail ?? {};
    const episodeNumbers = new Set<number>();
    for (const bucket of Object.values(detail)) {
      for (const episodeStringValue of bucket) {
        const number = Number(episodeStringValue);
        if (Number.isFinite(number) && number > 0) {
          episodeNumbers.add(number);
        }
      }
    }

    const episodes = [...episodeNumbers]
      .sort((left, right) => left - right)
      .map((number) => ({
        id: `${showId}@${episodeString(number)}`,
        number,
        title: `Episode ${number}`,
      }));

    if (episodes.length > 0) {
      showEpisodesCache.set(showId, {
        episodes,
        expires: Date.now() + SHOW_EPISODES_CACHE_TTL_MS,
      });
    }

    if (process.env.NODE_ENV !== "production") {
      console.info("[allanime-episodes]", { showId, episodeListLength: episodes.length });
    }

    return { episodes };
  },

  async servers(episodeId: string) {
    const [showId, episodeStringValue] = episodeId.split("@");
    if (!showId || !episodeStringValue) return { servers: [] };

    const payload = await getEpisodePayload(showId, "sub", episodeStringValue);

    const servers = sortSourcesByPreference(payload.episode?.sourceUrls ?? []).map((source) => ({
      id: slugifyServer(source.sourceName ?? "default"),
      name: source.sourceName ?? "Default",
      category: "sub" as const,
    }));

    return { servers: servers.length ? servers : [{ id: "default", name: "Default", category: "sub" as const }] };
  },

  async sources(episodeId: string, server: string, category: string) {
    const [showId, episodeStringValue] = episodeId.split("@");
    if (!showId || !episodeStringValue) throw new Error("Invalid AllAnime episode id.");

    const payload = await getEpisodePayload(showId, mapMode(category), episodeStringValue);

    const sourceUrls = sortSourcesByPreference(payload.episode?.sourceUrls ?? []);
    if (!sourceUrls.length) throw new Error("No AllAnime source URL found.");

    const selectedByServer = sourceUrls.find((item) => slugifyServer(item.sourceName ?? "") === server);

    const directSources: AllAnimeEpisodeSource[] = [];
    const indirectSources: AllAnimeEpisodeSource[] = [];
    for (const source of sourceUrls) {
      const providerUrl = resolveProviderUrl(source.sourceUrl ?? "");
      if (isDirectSource(source, providerUrl)) {
        directSources.push(source);
      } else {
        indirectSources.push(source);
      }
    }

    const ordered = [
      ...directSources,
      ...(selectedByServer ? [selectedByServer] : []),
      ...indirectSources,
      ...PREFERRED_PROVIDERS.map((name) => sourceUrls.find((item) => item.sourceName === name)).filter(
        (item): item is AllAnimeEpisodeSource => Boolean(item),
      ),
      ...sourceUrls,
    ];

    const seen = new Set<string>();
    const tryOrder: AllAnimeEpisodeSource[] = [];
    const adHeavyTail: AllAnimeEpisodeSource[] = [];

    for (const source of ordered) {
      if (!source?.sourceUrl) continue;
      const key = `${source.sourceName}:${source.sourceUrl}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (isAdHeavyEmbedSource(source)) {
        adHeavyTail.push(source);
      } else {
        tryOrder.push(source);
      }
    }

    return resolveSourcesFromMirrors(tryOrder, adHeavyTail);
  },
};

function episodeString(number: number): string {
  return String(number);
}

export { scoreProviderTitleMatch as scoreAllAnimeMatch } from "./provider-match-utils";

export async function probeAllAnimeSearch(): Promise<{
  ok: boolean;
  latencyMs: number;
  apiUrl: string;
  sample?: string;
  error?: string;
}> {
  const started = Date.now();
  const apiUrl = resolveAllAnimeApiUrl();
  try {
    const result = await allanimeProvider.search("Naruto");
    return {
      ok: result.results.length > 0,
      latencyMs: Date.now() - started,
      apiUrl,
      sample: result.results[0]?.title,
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      apiUrl,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
