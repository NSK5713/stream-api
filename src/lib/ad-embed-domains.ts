/** Third-party embed hosts that inject ad overlays or copyright blocks — never use as iframe player. */
export const AD_HEAVY_EMBED_HOSTS = [
  "bysekoze.com",
  "vidnest.io",
  "allanime.uns.bio",
  "ok.ru",
  "okcdn.ru",
  "odnoklassniki.ru",
  "vidsrc.cc",
  "vidsrc.net",
  "vidsrc.to",
  "vidsrc.xyz",
  "2embed.cc",
  "2embed.org",
  "embedsito.com",
  "multiembed.mov",
  "player.autoembed.cc",
  "warezcdn.com",
  "rabbitstream.net",
  "megacloud.blog",
  "megacloud.tv",
  "megacloud.love",
  "streamwish.to",
  "streamwish.com",
  "filemoon.sx",
  "filemoon.to",
  "doodstream.com",
  "dood.watch",
  "dood.to",
  "mixdrop.co",
  "mixdrop.ch",
  "mixdrop.to",
  "mp4upload.com",
  "mp4upload.to",
  "streamtape.com",
  "streamtape.net",
  "streamsb.net",
  "embedsb.net",
] as const;

export function isAdHeavyEmbedHost(hostname: string): boolean {
  const host = hostname.replace(/^www\./, "").toLowerCase();
  return (AD_HEAVY_EMBED_HOSTS as readonly string[]).some(
    (blocked) => host === blocked || host.endsWith(`.${blocked}`),
  );
}

export function isAdHeavyEmbedUrl(url: string): boolean {
  try {
    return isAdHeavyEmbedHost(new URL(url).hostname);
  } catch {
    return false;
  }
}
