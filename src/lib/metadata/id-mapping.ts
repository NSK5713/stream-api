const KOMETA_ANIME_IDS_URL =
  "https://raw.githubusercontent.com/Kometa-Team/Anime-IDs/master/anime_ids.json";

type KometaEntry = {
  mal_id?: number | string;
  anilist_id?: number | string;
  tmdb_show_id?: number | string;
};

type MalMapping = {
  anidbAid: number | null;
  tmdbShowId: number | null;
};

let mappingPromise: Promise<Map<number, MalMapping>> | null = null;

function parseNumericId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const first = value.split(",")[0]?.trim();
    const parsed = Number(first);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

async function loadMalMapping(): Promise<Map<number, MalMapping>> {
  const response = await fetch(KOMETA_ANIME_IDS_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return new Map();

  const payload = (await response.json()) as Record<string, KometaEntry>;
  const byMal = new Map<number, MalMapping>();

  for (const [aidKey, entry] of Object.entries(payload)) {
    const anidbAid = Number(aidKey);
    if (!Number.isFinite(anidbAid) || anidbAid <= 0) continue;

    const malRaw = entry.mal_id;
    const malIds =
      typeof malRaw === "string"
        ? malRaw.split(",").map((part) => Number(part.trim())).filter((id) => id > 0)
        : [parseNumericId(malRaw)].filter((id): id is number => id !== null);

    const tmdbShowId = parseNumericId(entry.tmdb_show_id);

    for (const malId of malIds) {
      if (!byMal.has(malId)) {
        byMal.set(malId, { anidbAid, tmdbShowId });
      }
    }
  }

  return byMal;
}

export async function resolveExternalIdsFromMalId(malId: number): Promise<MalMapping> {
  if (!mappingPromise) {
    mappingPromise = loadMalMapping().catch(() => new Map());
  }

  const mapping = await mappingPromise;
  return mapping.get(malId) ?? { anidbAid: null, tmdbShowId: null };
}
