import { resolveExternalIdsFromMalId } from "../metadata/id-mapping";
import type { MetadataEpisode } from "../metadata/types";

const ANIDB_API_BASE = "http://api.anidb.net:9001/httpapi";
const REQUEST_TIMEOUT_MS = 20_000;

function pickEpisodeTitle(block: string): string {
  const english = block.match(/<title xml:lang="en">([^<]+)<\/title>/i)?.[1]?.trim();
  if (english) return english;

  const romanized = block.match(/<title xml:lang="x-jat">([^<]+)<\/title>/i)?.[1]?.trim();
  if (romanized) return romanized;

  const anyTitle = block.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  return anyTitle ?? "";
}

function parseAnidbEpisodes(xml: string): MetadataEpisode[] {
  const episodes: MetadataEpisode[] = [];
  const blocks = xml.match(/<episode id="[^"]+"[^>]*>[\s\S]*?<\/episode>/gi) ?? [];

  for (const block of blocks) {
    const epnoMatch = block.match(/<epno type="1">(\d+)<\/epno>/i);
    if (!epnoMatch) continue;

    const number = Number(epnoMatch[1]);
    if (!Number.isFinite(number) || number <= 0) continue;

    const title = pickEpisodeTitle(block);
    if (!title) continue;

    episodes.push({ number, title });
  }

  return episodes.sort((left, right) => left.number - right.number);
}

async function fetchAnidbEpisodesByAid(aid: number): Promise<MetadataEpisode[]> {
  const client = process.env.ANIDB_CLIENT?.trim();
  const clientVer = process.env.ANIDB_CLIENT_VER?.trim() || "1";
  if (!client) return [];

  const params = new URLSearchParams({
    request: "anime",
    client,
    clientver: clientVer,
    protover: "1",
    aid: String(aid),
  });

  const response = await fetch(`${ANIDB_API_BASE}?${params.toString()}`, {
    headers: { Accept: "application/xml,text/xml" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) return [];
  const xml = await response.text();
  return parseAnidbEpisodes(xml);
}

/** Fetch AniDB episode titles using MAL id mapping (fallback provider). */
export async function fetchAnidbEpisodes(malId: number): Promise<MetadataEpisode[]> {
  try {
    const { anidbAid } = await resolveExternalIdsFromMalId(malId);
    if (!anidbAid) return [];
    return await fetchAnidbEpisodesByAid(anidbAid);
  } catch {
    return [];
  }
}

export { fetchAnidbEpisodesByAid };
