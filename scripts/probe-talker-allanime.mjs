import { allanimeProvider } from "../lib/allanime-provider.ts";

const queries = [
  "The Most Notorious Talker Runs the World Greatest Clan",
  "Saikyou no Shienshoku Wajutsushi",
  "最凶の支援職",
  "Talker",
];

for (const query of queries) {
  console.log(`\n=== ${query}`);
  const search = await allanimeProvider.search(query);
  for (const r of search.results.slice(0, 8)) {
    console.log(`  ${r.id} | ${r.title}`);
  }
}

const search = await allanimeProvider.search("Saikyou no Shienshoku");
const main = search.results.find(
  (r) =>
    /wajutsushi|話術|notorious|talker|支援職/i.test(r.title) &&
    !/special|ova|movie|manga|novel/i.test(r.title),
);
if (main) {
  const eps = await allanimeProvider.episodes(main.id);
  console.log("\nMAIN", main.id, main.title, "eps", eps.episodes.length);
}
