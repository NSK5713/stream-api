import { allanimeProvider } from "../dist/lib/allanime-provider.js";

const episodeId = "2P7kFgthrEfRRkcdm@1";
const servers = ["fm-hls", "vn-hls", "mp4", "ok", "uni", "s-mp4", "luf-mp4", "yt-mp4"];

async function probe(label, url, referer) {
  const direct = await fetch(url, {
    headers: { Range: "bytes=0-1023", Referer: referer, Accept: "*/*" },
  });
  const worker = await fetch(
    `https://nskanime.uk/api/proxy?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}`,
    { headers: { Range: "bytes=0-1023" } },
  );
  const host = new URL(url).hostname;
  console.log(`${label} [${host}] direct=${direct.status} worker=${worker.status} ${url.includes(".m3u8") ? "hls" : url.includes("embed") ? "embed" : "file"}`);
}

for (const server of servers) {
  try {
    const response = await allanimeProvider.sources(episodeId, server, "sub");
    const source = response.sources[0];
    if (!source?.url) {
      console.log(`${server}: no source`);
      continue;
    }
    const referer = response.headers?.Referer ?? "https://youtu-chan.com";
    console.log(`${server} type=${source.type} url=${source.url.slice(0, 160)}`);
    if (source.type !== "iframe") await probe(server, source.url, referer);
  } catch (error) {
    console.log(`${server}: ERR ${error instanceof Error ? error.message : error}`);
  }
}
