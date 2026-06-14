import { consumetMultiProvider } from "./lib/provider-chain";

const search = await consumetMultiProvider.search("naruto");
console.log("multi search", search.results.slice(0, 3).map((item) => `${item.id} | ${item.title}`));

if (search.results[0]) {
  const episodes = await consumetMultiProvider.episodes(search.results[0].id);
  console.log("episodes", episodes.episodes.length, episodes.episodes[0]);
}

const allanimeSearch = await consumetMultiProvider.search("one piece");
console.log(
  "fallback candidates",
  allanimeSearch.results.slice(0, 3).map((item) => `${item.id} | ${item.title}`),
);
