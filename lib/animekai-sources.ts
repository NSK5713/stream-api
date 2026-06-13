import { ANIME } from "@consumet/extensions";
import type { EpisodeServer, EpisodeSourcesResponse, StreamCategory } from "./provider";
import { extractMegaUpEmbed } from "./megaup-extract";
import { mapCategory, withTimeout } from "./consumet-providers";

const animeKaiClient = new ANIME.AnimeKai();
const SERVER_FETCH_ATTEMPTS = 3;

function slugifyServerName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "default";
}

function serverSlugToName(serverId: string): string {
  return serverId.replace(/-/g, " ");
}

async function fetchAnimeKaiServers(episodeId: string, category: StreamCategory) {
  let lastError: unknown;

  for (let attempt = 0; attempt < SERVER_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const servers = await withTimeout(
        animeKaiClient.fetchEpisodeServers(episodeId, mapCategory(category)),
        "AnimeKai episode servers",
      );
      if (servers.length) return servers;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("AnimeKai episode servers unavailable.");
}

export async function resolveAnimeKaiServers(
  episodeId: string,
  category: StreamCategory,
): Promise<{ servers: EpisodeServer[] }> {
  const servers = await fetchAnimeKaiServers(episodeId, category);
  return {
    servers: servers.flatMap((server) =>
      (["sub", "dub", "raw"] as StreamCategory[]).map((cat) => ({
        id: slugifyServerName(server.name),
        name: server.name,
        category: cat,
      })),
    ),
  };
}

export async function resolveAnimeKaiSources(
  episodeId: string,
  serverId: string,
  category: StreamCategory,
): Promise<EpisodeSourcesResponse> {
  const servers = await fetchAnimeKaiServers(episodeId, category);

  const preferredIndex = servers.findIndex(
    (server) =>
      slugifyServerName(server.name) === serverId ||
      server.name.toLowerCase().includes(serverSlugToName(serverId)),
  );

  const ordered =
    preferredIndex >= 0
      ? [servers[preferredIndex], ...servers.filter((_, index) => index !== preferredIndex)]
      : servers;

  let lastError: unknown;
  for (const server of ordered) {
    try {
      const extracted = await withTimeout(extractMegaUpEmbed(server.url), "AnimeKai MegaUp extract");
      return {
        sources: extracted.sources,
        headers: extracted.headers,
      };
    } catch {
      if (server.url.includes("anikai.to/iframe/")) {
        return {
          sources: [{ url: server.url, type: "iframe" }],
          headers: { Referer: "https://anikai.to/" },
        };
      }
      lastError = new Error("AnimeKai MegaUp extract failed.");
    }
  }

  throw lastError instanceof Error ? lastError : new Error("AnimeKai sources unavailable.");
}
