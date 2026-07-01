import { allanimeProvider } from "../dist/lib/allanime-provider.js";

const episodeId = "2P7kFgthrEfRRkcdm@1";
const servers = ["s-mp4", "luf-mp4", "default", "yt-mp4", "ss-hls"];

async function probeUrl(label, url, referer) {
  const direct = await fetch(url, {
    headers: { Range: "bytes=0-1023", Referer: referer, Accept: "*/*" },
    redirect: "follow",
  });
  const ref = encodeURIComponent(referer);
  const worker = await fetch(
    `https://nskanime.uk/api/proxy?url=${encodeURIComponent(url)}&referer=${ref}`,
    { headers: { Range: "bytes=0-1023" } },
  );
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "?";
    }
  })();
  console.log(
    `${label} [${host}] direct=${direct.status} worker=${worker.status} ${url.includes(".m3u8") ? "hls" : "mp4"}`,
  );
}

for (const server of servers) {
  try {
    const response = await allanimeProvider.sources(episodeId, server, "sub");
    const source = response.sources[0];
    if (!source?.url) {
      console.log(`${server}: no source`);
      continue;
    }
    const referer = response.headers?.Referer ?? response.headers?.referer ?? "https://youtu-chan.com";
    console.log(`${server} url=${source.url.slice(0, 140)}`);
    await probeUrl(server, source.url, referer);
  } catch (error) {
    console.log(`${server}: ERR ${error instanceof Error ? error.message : error}`);
  }
}
