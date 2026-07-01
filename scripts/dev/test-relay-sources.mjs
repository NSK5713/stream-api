import { allanimeProvider } from "../dist/lib/allanime-provider.js";

process.env.RAILWAY_ENVIRONMENT = "production";

const cases = [
  { label: "Witch Hat ep1", episodeId: "2P7kFgthrEfRRkcdm@1" },
  { label: "Naruto ep1", episodeId: null },
];

const naruto = await allanimeProvider.search("Naruto");
console.log("naruto", naruto.results[0]?.id, naruto.results[0]?.title);
if (naruto.results[0]) {
  const eps = await allanimeProvider.episodes(naruto.results[0].id);
  cases[1].episodeId = eps.episodes?.[0]?.id ?? null;
}

for (const c of cases) {
  if (!c.episodeId) {
    console.log(c.label, "skip - no episode");
    continue;
  }
  try {
    const servers = await allanimeProvider.servers(c.episodeId);
    const sources = await allanimeProvider.sources(c.episodeId, servers.servers?.[0]?.id ?? "default", "sub");
    console.log(c.label, "OK", sources.sources?.length, sources.sources?.[0]?.url?.slice(0, 100));
  } catch (e) {
    console.log(c.label, "FAIL", e.message);
  }
}
