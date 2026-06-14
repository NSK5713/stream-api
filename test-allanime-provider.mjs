import { allanimeProvider } from "./lib/allanime-provider.js";

const search = await allanimeProvider.search("naruto shippuden");
console.log("search", search.results.slice(0, 3));

const show = search.results.find((item) => /shippuden/i.test(item.title)) ?? search.results[0];
if (!show) throw new Error("no show");

const episodes = await allanimeProvider.episodes(show.id);
console.log("episodes", episodes.episodes.slice(-3));

const ep = episodes.episodes.find((item) => item.number === 1) ?? episodes.episodes.at(-1);
console.log("ep", ep);

const servers = await allanimeProvider.servers(ep.id);
console.log("servers", servers.servers.slice(0, 3));

const sources = await allanimeProvider.sources(ep.id, servers.servers[0].id, "sub");
console.log("sources", sources);
