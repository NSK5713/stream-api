"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const allanime_provider_1 = require("../src/lib/allanime-provider");
async function main() {
    const ids = [
        ["Main", "XjZScvcpvP9hizG8v"],
        ["Zero", "ANgg8jGMbJ5RC52eE"],
        ["Specials", "PKGEAf8GwdKb2M63b"],
    ];
    for (const [name, id] of ids) {
        const eps = await allanime_provider_1.allanimeProvider.episodes(id);
        console.log(name, "count", eps.episodes.length, "max", eps.episodes.at(-1)?.number, "has12", eps.episodes.some((e) => e.number === 12));
    }
    const ep12Id = "XjZScvcpvP9hizG8v@12";
    const sources = await allanime_provider_1.allanimeProvider.sources(ep12Id, "default", "sub");
    console.log("\nEp12 sources:");
    for (const s of sources.sources) {
        console.log(" type:", s.type, "isM3U8:", s.isM3U8, "url:", s.url?.slice(0, 160));
    }
}
main().catch(console.error);
