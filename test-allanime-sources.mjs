const REF = "https://youtu-chan.com";
const API = "https://api.allanime.day/api";
const AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

async function gql(query, variables, extensions) {
  const body = extensions ? { variables, extensions } : { query, variables };
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: REF,
      Origin: REF,
      "User-Agent": AGENT,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

const showId = "vkD8H5e7HsG2jctw9";
const episodeQuery =
  "query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode( showId: $showId translationType: $translationType episodeString: $episodeString ) { episodeString sourceUrls }}";

const epResp = await gql(episodeQuery, {
  showId,
  translationType: "sub",
  episodeString: "1",
});

console.log(JSON.stringify(epResp, null, 2));

const hash = "d405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec";
const persisted = await gql(
  null,
  { showId, translationType: "sub", episodeString: "1" },
  { persistedQuery: { version: 1, sha256Hash: hash } },
);
console.log("persisted", JSON.stringify(persisted, null, 2).slice(0, 1500));
