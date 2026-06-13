import { ANIME } from "@consumet/extensions";
import { allanimeProvider } from "./lib/allanime-provider.js";

async function main() {
  console.log("=== HiAnime ===");
  try {
    const h = new ANIME.Hianime();
    const hs = await h.search("naruto");
    console.log("hianime results", hs.results.length, hs.results[0]?.id, hs.results[0]?.title);
    if (hs.results[0]) {
      const info = await h.fetchAnimeInfo(hs.results[0].id);
      const ep = info.episodes?.[0];
      console.log("ep", ep?.id, ep?.number);
      if (ep) {
        const src = await h.fetchEpisodeSources(ep.id);
        console.log("hls", src.sources[0]?.url?.slice(0, 120));
      }
    }
  } catch (error) {
    console.log("hianime fail", error instanceof Error ? error.message : error);
  }

  console.log("\n=== AllAnime ===");
  try {
    const search = await allanimeProvider.search("Naruto");
    console.log(
      "allanime search",
      search.results.slice(0, 5).map((item) => item.title),
    );
    const show =
      search.results.find(
        (item) => item.title.toLowerCase() === "naruto" || item.title.toLowerCase().includes("naruto"),
      ) ?? search.results[0];
    console.log("show", show?.title, show?.id);
    if (!show) return;

    const episodes = await allanimeProvider.episodes(show.id);
    const episode = episodes.episodes[0];
    console.log("episode", episode?.id);
    const servers = await allanimeProvider.servers(episode.id);
    console.log("servers", servers.servers);
    const sources = await allanimeProvider.sources(episode.id, servers.servers[0]?.id ?? "default", "sub");
    console.log("source", sources.sources[0]?.url?.slice(0, 120));
  } catch (error) {
    console.log("allanime fail", error instanceof Error ? error.message : error);
  }
}

main();
