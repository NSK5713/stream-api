"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const allanime_provider_1 = require("../src/lib/allanime-provider");
const ALLANIME_REFERER = "https://youtu-chan.com";
const ALLANIME_API = "https://api.allanime.day/api";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
async function rawEpisode(showId, ep) {
    const variables = { showId, translationType: "sub", episodeString: ep };
    const extensions = {
        persistedQuery: {
            version: 1,
            sha256Hash: "d405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec",
        },
    };
    const getRes = await fetch(`${ALLANIME_API}?variables=${encodeURIComponent(JSON.stringify(variables))}&extensions=${encodeURIComponent(JSON.stringify(extensions))}`, {
        headers: { Referer: ALLANIME_REFERER, Origin: ALLANIME_REFERER, "User-Agent": USER_AGENT },
    });
    const getJson = await getRes.json();
    console.log("GET raw", JSON.stringify(getJson).slice(0, 400));
    const decryptedGet = JSON.parse((0, allanime_provider_1.decryptAllAnimePayload)(getJson));
    console.log("GET decrypted", JSON.stringify(decryptedGet, null, 2)?.slice(0, 1200));
    const postRes = await fetch(ALLANIME_API, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Referer: ALLANIME_REFERER,
            Origin: ALLANIME_REFERER,
            "User-Agent": USER_AGENT,
        },
        body: JSON.stringify({
            variables,
            query: `query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) {
        episode(showId: $showId, translationType: $translationType, episodeString: $episodeString) {
          episodeString sourceUrls
        }
      }`,
        }),
    });
    const postJson = await postRes.json();
    const decryptedPost = JSON.parse((0, allanime_provider_1.decryptAllAnimePayload)(postJson));
    console.log("POST episode", JSON.stringify(decryptedPost.data?.episode, null, 2)?.slice(0, 800));
}
async function main() {
    const search = await allanime_provider_1.allanimeProvider.search("Naruto");
    const show = search.results.find((item) => item.title === "Naruto") ?? search.results[0];
    console.log("show", show?.title, show?.id);
    if (show)
        await rawEpisode(show.id, "1");
}
main();
