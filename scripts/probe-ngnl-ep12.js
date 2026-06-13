"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const allanime_provider_1 = require("../src/lib/allanime-provider");
const provider_match_utils_1 = require("../src/lib/provider-match-utils");
const provider_chain_1 = require("../src/lib/provider-chain");
const QUERIES = ["No Game, No Life", "No Game No Life", "NGNL"];
async function main() {
    console.log("=== AllAnime search scores ===");
    for (const query of QUERIES) {
        const search = await allanime_provider_1.allanimeProvider.search(query);
        const scored = search.results
            .slice(0, 8)
            .map((item) => ({
            title: item.title,
            id: item.id,
            score: (0, provider_match_utils_1.scoreProviderTitleMatch)(item.title, query),
        }))
            .sort((a, b) => b.score - a.score);
        console.log(`\nQuery: "${query}"`);
        for (const row of scored) {
            console.log(`  [${row.score}] ${row.title} (${row.id})`);
        }
    }
    console.log("\n=== Provider chain search ===");
    const chainSearch = await provider_chain_1.consumetMultiProvider.search("No Game, No Life");
    for (const item of chainSearch.results.slice(0, 10)) {
        console.log(`  ${item.id} — ${item.title}`);
    }
    const best = chainSearch.results.find((item) => item.id.startsWith("allanime:")) ??
        chainSearch.results[0];
    if (!best) {
        console.log("No match found");
        return;
    }
    console.log(`\n=== Episodes for ${best.title} (${best.id}) ===`);
    const episodeList = await provider_chain_1.consumetMultiProvider.episodes(best.id, {
        searchHints: ["No Game, No Life", "No Game No Life"],
    });
    console.log(`  Count: ${episodeList.episodes.length}`);
    console.log(`  Last: ep ${episodeList.episodes.at(-1)?.number}`);
    const ep12 = episodeList.episodes.find((e) => e.number === 12);
    console.log(`  Ep 12 in list: ${Boolean(ep12)} — ${ep12?.id ?? "missing"}`);
    if (!ep12) {
        console.log("\nEp 12 not listed — checking alternate AllAnime matches...");
        for (const item of chainSearch.results.filter((r) => r.id.startsWith("allanime:")).slice(0, 5)) {
            const eps = await provider_chain_1.consumetMultiProvider.episodes(item.id);
            const has12 = eps.episodes.some((e) => e.number === 12);
            console.log(`  ${item.title}: ${eps.episodes.length} eps, ep12=${has12}`);
        }
        return;
    }
    console.log("\n=== Sources ep 12 sub ===");
    try {
        const sources = await provider_chain_1.consumetMultiProvider.sources(ep12.id, "default", "sub");
        console.log("  sources:", sources.sources?.length ?? 0);
        console.log("  url:", sources.sources?.[0]?.url?.slice(0, 120));
        console.log("  type:", sources.sources?.[0]?.type);
    }
    catch (error) {
        console.log("  FAIL:", error instanceof Error ? error.message : error);
    }
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
