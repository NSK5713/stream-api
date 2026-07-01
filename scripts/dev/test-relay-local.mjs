import { allanimeProvider } from "../dist/lib/allanime-provider.js";

process.env.RAILWAY_ENVIRONMENT = "production";

const search = await allanimeProvider.search("Witch Hat Atelier");
console.log("search count", search.results.length, search.results[0]?.title, search.results[0]?.id);

if (search.results[0]) {
  const showId = search.results[0].id;
  const episodes = await allanimeProvider.episodes(showId);
  console.log("episodes", episodes.episodes?.length ?? 0);

  const ep1 = episodes.episodes?.[0];
  if (ep1) {
    const servers = await allanimeProvider.servers(ep1.id);
    console.log("servers", servers.servers?.map((s) => s.id));
    const sources = await allanimeProvider.sources(
      ep1.id,
      servers.servers?.[0]?.id ?? "default",
      "sub",
    );
    console.log("sources", sources.sources?.length, sources.sources?.[0]?.url?.slice(0, 80));
  }
}
