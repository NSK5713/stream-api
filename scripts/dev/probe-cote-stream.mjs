process.env.ALLANIME_API_URL = "https://nskanime.uk/allanime-api";
process.env.ALLANIME_FETCH_RELAY_URL = "https://nskanime.uk/allanime-fetch";

import pkg from "../dist/lib/allanime-provider.js";
const { allanimeProvider } = pkg;

const episodeId = process.argv[2] || "gdcikK9DNZ5b3fKpR@5";
const [showId, ep] = episodeId.split("@");

console.log("Probing", episodeId);

const payload = await allanimeProvider.servers(episodeId);
console.log("servers:", payload.servers?.map((s) => s.id));

// Dump raw source metadata via internal path - call sources for each
for (const server of payload.servers ?? []) {
  try {
    const r = await allanimeProvider.sources(episodeId, server.id, "sub");
    console.log(`${server.id}: OK type=${r.sources[0]?.type} url=${String(r.sources[0]?.url).slice(0, 140)}`);
    break;
  } catch (e) {
    console.log(`${server.id}: ERR ${e.message}`);
  }
}
