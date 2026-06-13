import { consumetMultiProvider } from "../lib/provider-chain.ts";

const title = `The Most Notorious "Talker" Runs the World's Greatest Clan`;

const queries = [
  "Talker",
  "The Most Notorious Talker",
  "Saikyou no Shienshoku Wajutsushi",
  "最凶の支援職",
];

for (const query of queries) {
  console.log(`\n=== search: ${query}`);
  const search = await consumetMultiProvider.search(query);
console.log("search results:");
for (const r of search.results.slice(0, 12)) {
  console.log(`  ${r.id} | ${r.title}`);
}

const candidates = search.results.filter(
  (r) => /notorious|talker|wajutsushi|話術/i.test(r.title) && !/special|ova|movie|manga/i.test(r.title),
);

  for (const match of candidates.slice(0, 3)) {
    const eps = await consumetMultiProvider.episodes(match.id, { searchHints: [title] });
    const nums = eps.episodes.map((e) => e.number);
    console.log("\nmatch:", match.id, match.title);
    console.log("  ep count:", eps.episodes.length, "max:", Math.max(...nums), "min:", Math.min(...nums));
  }
}
