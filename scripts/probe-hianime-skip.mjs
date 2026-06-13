/**
 * Probe HiAnime intro/outro from AJAX sources (same data the stream API uses).
 * Usage: node scripts/probe-hianime-skip.mjs [search query]
 */
import axios from "axios";
import * as cheerio from "cheerio";
import { ANIME, StreamingServers, SubOrSub } from "@consumet/extensions";

const HIANIME_BASE = "https://hianime.to";
const AJAX_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "X-Requested-With": "XMLHttpRequest",
};

const query = process.argv[2] || "Frieren";
const hianime = new ANIME.Hianime();

const search = await hianime.search(query);
const hit = search.results?.[0];
if (!hit) {
  console.error("No search results for:", query);
  process.exit(1);
}

console.log("anime:", hit.id);

const info = await hianime.fetchAnimeInfo(hit.id);
const episode = info.episodes?.[0];
if (!episode?.id) {
  console.error("No episodes");
  process.exit(1);
}

console.log("episode id:", episode.id);

const raw = episode.id;
const match = raw.match(/^(.*)\$episode\$(\d+)/i);
if (!match) {
  console.error("Unexpected episode id format:", raw);
  process.exit(1);
}

const slug = match[1];
const ep = match[2];
const watchUrl = `${HIANIME_BASE}/watch/${slug}?ep=${ep}`;
const headers = { ...AJAX_HEADERS, Referer: watchUrl };

const serversRes = await axios.get(`${HIANIME_BASE}/ajax/v2/episode/servers?episodeId=${ep}`, {
  headers,
});
const $ = cheerio.load(serversRes.data.html);
let serverId = null;
$(".ps_-block.ps_-block-sub.servers-sub > .ps__-list .server-item").each((_, el) => {
  const item = $(el);
  if (item.attr("data-server-id") === "1") {
    serverId = item.attr("data-id");
    return false;
  }
});
console.log("server data-id:", serverId);

if (!serverId) {
  console.error("No vidcloud server id");
  process.exit(1);
}

const sourcesRes = await axios.get(`${HIANIME_BASE}/ajax/v2/episode/sources?id=${serverId}`, { headers });
console.log("ajax sources payload:", JSON.stringify(sourcesRes.data, null, 2));

const consumetSources = await hianime.fetchEpisodeSources(
  episode.id,
  StreamingServers.VidCloud,
  SubOrSub.SUB,
);
console.log("consumet stream count:", consumetSources.sources?.length);
