import { isAllowedProxyRequest } from "./proxy-allowlist";

export function isM3u8Response(url: string, contentType: string | null | undefined): boolean {
  if (url.includes(".m3u8")) return true;
  if (contentType && /mpegurl|vnd\.apple\.mpegurl/i.test(contentType)) return true;
  return false;
}

function resolveManifestUri(manifestUrl: string, uri: string): string {
  try {
    return new URL(uri.trim(), manifestUrl).href;
  } catch {
    return uri.trim();
  }
}

function buildProxyPath(absoluteUrl: string, referer: string, origin: string): string | null {
  if (!isAllowedProxyRequest(absoluteUrl, referer)) return null;
  let path = `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`;
  if (referer) path += `&referer=${encodeURIComponent(referer)}`;
  if (origin) path += `&origin=${encodeURIComponent(origin)}`;
  return path;
}

function rewriteTaggedUri(
  line: string,
  manifestUrl: string,
  referer: string,
  origin: string,
): string {
  return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => {
    const absolute = resolveManifestUri(manifestUrl, uri);
    const proxied = buildProxyPath(absolute, referer, origin);
    return proxied ? `URI="${proxied}"` : `URI="${uri}"`;
  });
}

/**
 * Rewrite HLS manifest segment and nested playlist URLs to same-origin proxy paths
 * so mobile Safari / native HLS players do not fetch CDN segments without Referer.
 */
export function rewriteM3u8Manifest(
  body: string,
  manifestUrl: string,
  referer: string,
  origin: string,
): string {
  const lines = body.split(/\r?\n/);

  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith("#")) {
        if (trimmed.includes('URI="')) {
          return rewriteTaggedUri(line, manifestUrl, referer, origin);
        }
        return line;
      }

      const absolute = resolveManifestUri(manifestUrl, trimmed);
      const proxied = buildProxyPath(absolute, referer, origin);
      return proxied ?? line;
    })
    .join("\n");
}
