import axios from "axios";
import * as cheerio from "cheerio";
import type { StreamCategory } from "./provider";

export type ProviderSkipRange = { start: number; end: number };

export type ProviderSkipTimes = {
  intro?: ProviderSkipRange | null;
  outro?: ProviderSkipRange | null;
};

const HIANIME_BASE = "https://hianime.to";

const HIANIME_SERVER_INDEX: Record<string, number> = {
  vidcloud: 1,
  vidstreaming: 4,
  streamsb: 5,
  streamtape: 3,
};

const AJAX_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "X-Requested-With": "XMLHttpRequest",
};

function parseSkipRange(value: unknown): ProviderSkipRange | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { start?: number; end?: number };
  const start = record.start;
  const end = record.end;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { start, end };
}

/** HiAnime embed timeline length implied by intro/outro markers. */
export function providerSkipReferenceDuration(skip: ProviderSkipTimes | null | undefined): number {
  if (!skip) return 0;
  const introEnd = skip.intro?.end ?? 0;
  const outroEnd = skip.outro?.end ?? 0;
  return Math.max(introEnd, outroEnd);
}

export function skipTimesFromPayload(payload: {
  intro?: unknown;
  outro?: unknown;
}): ProviderSkipTimes | null {
  const intro = parseSkipRange(payload.intro);
  const outro = parseSkipRange(payload.outro);
  if (!intro && !outro) return null;
  return {
    intro: intro ?? null,
    outro: outro ?? null,
  };
}

function stripProviderPrefix(episodeId: string): string {
  const colon = episodeId.indexOf(":");
  return colon > 0 ? episodeId.slice(colon + 1) : episodeId;
}

function parseHianimeEpisodeRef(episodeId: string): { watchUrl: string; episodeNumericId: string } | null {
  const raw = stripProviderPrefix(episodeId);
  const match = raw.match(/^(.*)\$episode\$(\d+)/i);
  if (!match) return null;

  const slug = match[1].replace(/\$(auto|sub|dub)$/i, "");
  const episodeNumericId = match[2];
  const watchUrl = `${HIANIME_BASE}/watch/${slug}?ep=${episodeNumericId}`;
  return { watchUrl, episodeNumericId };
}

/** Mirrors @consumet/extensions Hianime.retrieveServerId for the same embed server. */
function retrieveHianimeServerId(
  $: cheerio.CheerioAPI,
  serverIndex: number,
  category: StreamCategory,
): string | null {
  const subOrDub = category === "raw" ? "raw" : category === "dub" ? "dub" : "sub";

  const pickFromBlock = (useRaw: boolean): string | null => {
    const blockSuffix = useRaw ? "raw" : subOrDub;
    let found: string | null = null;
    $(`.ps_-block.ps_-block-sub.servers-${blockSuffix} > .ps__-list .server-item`).each((_, el) => {
      const item = $(el);
      if (item.attr("data-server-id") === String(serverIndex)) {
        found = item.attr("data-id") ?? null;
        return false;
      }
    });
    return found;
  };

  return pickFromBlock(false) ?? pickFromBlock(true);
}

export function mapStreamServerToHianimeIndex(server: string): number {
  const key = server.toLowerCase();
  return HIANIME_SERVER_INDEX[key] ?? 1;
}

/** HiAnime AJAX embeds intro/outro on `/ajax/v2/episode/sources` (Consumet discards them). */
export async function fetchHianimeProviderSkip(
  episodeId: string,
  server: string,
  category: StreamCategory,
): Promise<ProviderSkipTimes | null> {
  const ref = parseHianimeEpisodeRef(episodeId);
  if (!ref) return null;

  const serverIndex = HIANIME_SERVER_INDEX[server.toLowerCase()] ?? 1;
  const headers = { ...AJAX_HEADERS, Referer: ref.watchUrl };

  try {
    const serversRes = await axios.get<{ html?: string }>(
      `${HIANIME_BASE}/ajax/v2/episode/servers?episodeId=${ref.episodeNumericId}`,
      { headers, timeout: 15_000 },
    );
    const html = serversRes.data?.html;
    if (typeof html !== "string") return null;

    const $ = cheerio.load(html);
    const serverId = retrieveHianimeServerId($, serverIndex, category);
    if (!serverId) return null;

    const sourcesRes = await axios.get(`${HIANIME_BASE}/ajax/v2/episode/sources?id=${serverId}`, {
      headers,
      timeout: 15_000,
    });

    return skipTimesFromPayload(sourcesRes.data ?? {});
  } catch {
    return null;
  }
}
