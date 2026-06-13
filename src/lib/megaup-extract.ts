import axios from "axios";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

const ANIKAI_HEADERS: Record<string, string> = {
  "User-Agent": USER_AGENT,
  Referer: "https://anikai.to/",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
};

export type ExtractedStream = {
  sources: { url: string; type: "hls" | "mp4"; isM3U8?: boolean; quality?: string }[];
  headers?: Record<string, string>;
};

const MEGAUP_HOST_PATTERN = "(?:megaup\\.(?:cc|live|site)|4spromax\\.site)";

function extractMegaUpUrl(html: string): string | null {
  const patterns = [
    new RegExp(`src=["'](https:\\/\\/${MEGAUP_HOST_PATTERN}\\/e\\/[^"']+)["']`, "i"),
    new RegExp(`(https:\\/\\/${MEGAUP_HOST_PATTERN}\\/e\\/[^\\s"'<>]+)`, "i"),
    new RegExp(`(${MEGAUP_HOST_PATTERN}\\/e\\/[^"'\\s<>]+)`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match?.[1]) continue;
    const value = match[1];
    if (value.startsWith("http")) return value;
    return `https://${value}`;
  }

  return null;
}

async function fetchHtml(url: string, headers: Record<string, string> = ANIKAI_HEADERS): Promise<string> {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.text();
}

async function fetchIframeHtml(iframeUrl: string): Promise<string> {
  const proxyCandidates = [
  {
      url: `https://api.allorigins.win/raw?url=${encodeURIComponent(iframeUrl)}`,
      headers: { "User-Agent": USER_AGENT },
    },
    {
      url: `https://corsproxy.io/?${encodeURIComponent(iframeUrl)}`,
      headers: { "User-Agent": USER_AGENT },
    },
    { url: iframeUrl, headers: ANIKAI_HEADERS },
  ];

  let lastHtml = "";
  for (const candidate of proxyCandidates) {
    try {
      const html = await fetchHtml(candidate.url, candidate.headers);
      lastHtml = html;
      if (extractMegaUpUrl(html)) return html;
    } catch {
      // Try the next fetch strategy.
    }
  }

  return lastHtml;
}

async function fetchNestedEmbedUrl(iframeUrl: string): Promise<string> {
  if (/megaup\.(?:cc|live|site)|4spromax\.site/i.test(iframeUrl) && iframeUrl.includes("/e/")) {
    return iframeUrl;
  }

  const html = await fetchIframeHtml(iframeUrl);
  const megaupUrl = extractMegaUpUrl(html);
  if (!megaupUrl) {
    const preview = html.replace(/\s+/g, " ").slice(0, 160);
    throw new Error(`No MegaUp embed URL found in AnimeKai iframe. Preview: ${preview}`);
  }

  return megaupUrl;
}

const MEGAUP_HOSTS = ["megaup.cc", "megaup.live", "megaup.site", "4spromax.site"] as const;

function getMegaUpMediaId(megaupUrl: string): string {
  const match = megaupUrl.match(/\/e\/([^/?#]+)/i);
  return match?.[1] ?? "";
}

async function decryptMegaUpPayload(encrypted: string) {
  const decryptResponse = await fetch("https://enc-dec.app/api/dec-mega", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: encrypted, agent: USER_AGENT }),
  });
  if (!decryptResponse.ok) {
    throw new Error(`MegaUp decrypt request failed: ${decryptResponse.status}`);
  }

  const decryptPayload = (await decryptResponse.json()) as {
    status?: number;
    result?: { sources?: { file: string }[] };
  };
  if (decryptPayload.status && decryptPayload.status !== 200) {
    throw new Error(`MegaUp decrypt failed with status ${decryptPayload.status}.`);
  }

  const files = decryptPayload.result?.sources ?? [];
  if (!files.length) {
    throw new Error("MegaUp decrypt returned no sources.");
  }

  return files;
}

async function resolveMegaUpSources(megaupUrl: string) {
  const mediaId = getMegaUpMediaId(megaupUrl);
  if (!mediaId) throw new Error(`MegaUp media id missing for embed: ${megaupUrl}`);

  const directAttempts = MEGAUP_HOSTS.map((host) => ({
    url: `https://${host}/media/${mediaId}`,
    referer: `https://${host}/e/${mediaId}`,
  }));

  const proxyAttempts = MEGAUP_HOSTS.map((host) => ({
    url: `https://api.allorigins.win/get?url=${encodeURIComponent(`https://${host}/media/${mediaId}`)}`,
    referer: `https://${host}/e/${mediaId}`,
  }));

  let lastStatus = 0;
  for (const attempt of directAttempts) {
    try {
      const response = await axios.get<{ result?: string }>(attempt.url, {
        headers: {
          "User-Agent": USER_AGENT,
          Referer: attempt.referer,
          Origin: new URL(attempt.referer).origin,
          Accept: "application/json, text/plain, */*",
        },
        timeout: 12_000,
      });
      lastStatus = response.status;
      const encrypted = response.data?.result;
      if (typeof encrypted !== "string" || encrypted.length <= 20) continue;
      const files = await decryptMegaUpPayload(encrypted);
      return files;
    } catch {
      // Try the next host.
    }
  }

  for (const attempt of proxyAttempts) {
    try {
      const response = await fetch(attempt.url, {
        headers: { "User-Agent": USER_AGENT },
      });
      lastStatus = response.status;
      if (!response.ok) continue;

      const raw = await response.text();
      const wrapped = JSON.parse(raw) as { contents?: string };
      if (!wrapped.contents) continue;
      const mediaPayload = JSON.parse(wrapped.contents) as { result?: string };
      const encrypted = mediaPayload.result;
      if (typeof encrypted !== "string" || encrypted.length <= 20) continue;

      const files = await decryptMegaUpPayload(encrypted);
      return files;
    } catch {
      // Try the next proxy host.
    }
  }

  throw new Error(`MegaUp media request failed: ${lastStatus || 403}`);
}

export async function extractMegaUpEmbed(embedUrl: string): Promise<ExtractedStream> {
  const megaupUrl = await fetchNestedEmbedUrl(embedUrl);
  const files = await resolveMegaUpSources(megaupUrl);

  return {
    sources: files.map((entry) => ({
      url: entry.file,
      type: entry.file.includes(".m3u8") ? ("hls" as const) : ("mp4" as const),
      isM3U8: entry.file.includes(".m3u8"),
    })),
    headers: { Referer: megaupUrl },
  };
}
