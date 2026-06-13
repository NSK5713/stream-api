import { allanimeProvider } from "../src/lib/allanime-provider";
import { scoreProviderTitleMatch } from "../src/lib/provider-match-utils";
import { consumetMultiProvider } from "../src/lib/provider-chain";

const ZERO_QUERIES = [
  "No Game No Life Zero",
  "No Game, No Life Zero",
  "No Game No Life",
];

async function main() {
  console.log("=== AllAnime search (Zero movie probes) ===");
  for (const query of ZERO_QUERIES) {
    const search = await allanimeProvider.search(query);
    const scored = search.results
      .slice(0, 12)
      .map((item) => ({
        title: item.title,
        id: item.id,
        score: scoreProviderTitleMatch(item.title, query),
      }))
      .sort((a, b) => b.score - a.score);
    console.log(`\nQuery: "${query}"`);
    for (const row of scored) {
      console.log(`  [${row.score}] ${row.title} (${row.id})`);
    }
  }

  console.log("\n=== Provider chain search: Zero ===");
  const chainZero = await consumetMultiProvider.search("No Game No Life Zero");
  for (const item of chainZero.results.slice(0, 8)) {
    console.log(`  ${item.id} — ${item.title}`);
  }

  const zeroMatch =
    chainZero.results.find((r) => /\bzero\b/i.test(r.title)) ??
    chainZero.results[0];
  if (!zeroMatch) {
    console.log("No Zero match");
    return;
  }

  console.log(`\n=== Episodes: ${zeroMatch.title} (${zeroMatch.id}) ===`);
  const eps = await consumetMultiProvider.episodes(zeroMatch.id, {
    searchHints: ["No Game No Life Zero", "No Game, No Life Zero"],
  });
  console.log(`  Count: ${eps.episodes.length}`);
  for (const ep of eps.episodes.slice(0, 5)) {
    console.log(`  ep ${ep.number}: ${ep.id}`);
  }

  const ep1 = eps.episodes.find((e) => e.number === 1) ?? eps.episodes[0];
  if (!ep1) return;

  console.log(`\n=== Sources ep ${ep1.number} (sub) ===`);
  try {
    const sources = await consumetMultiProvider.sources(ep1.id, "default", "sub");
    const url = sources.sources?.[0]?.url ?? "";
    console.log("  sources:", sources.sources?.length ?? 0);
    console.log("  type:", sources.sources?.[0]?.type);
    console.log("  url:", url.slice(0, 160));
  } catch (error) {
    console.log("  FAIL:", error instanceof Error ? error.message : error);
  }

  console.log("\n=== TV series ep 1 (wrong match check) ===");
  const chainTv = await consumetMultiProvider.search("No Game, No Life");
  const tv = chainTv.results.find((r) => r.id === "allanime:XjZScvcpvP9hizG8v") ?? chainTv.results[0];
  if (!tv) return;
  const tvEps = await consumetMultiProvider.episodes(tv.id);
  const tvEp1 = tvEps.episodes.find((e) => e.number === 1);
  if (!tvEp1) return;
  const tvSources = await consumetMultiProvider.sources(tvEp1.id, "default", "sub");
  console.log("  TV ep1 url:", (tvSources.sources?.[0]?.url ?? "").slice(0, 160));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
