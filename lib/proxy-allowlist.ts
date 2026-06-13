/** Hosts that may be fetched through the media proxy without a referer check. */
export const PROXY_ALWAYS_ALLOWED_HOSTS = [
  "allanime.day",
  "api.allanime.day",
  "youtu-chan.com",
  "repackager.wixmp.com",
  "video.wixstatic.com",
] as const;

/**
 * Referer values allowed for third-party CDN URLs (prevents open-proxy abuse).
 * Keep in sync with `src/lib/streaming/proxyAllowlist.ts`.
 */
export const PROXY_ALLOWED_REFERERS = [
  "https://youtu-chan.com",
  "https://allanime.day",
  "https://hianime.to",
  "https://hianime.bz",
  "https://aniwatch.to",
  "https://anikai.to",
  "https://megacloud.blog",
  "https://megacloud.tv",
  "https://vidstreaming.io",
  "https://vidcloud.pro",
  "https://streamsb.net",
  "https://streamtape.com",
  "https://streamtape.net",
] as const;

export function normalizeProxyReferer(referer: string | undefined): string {
  return (referer ?? "").trim();
}

export function isProxyRefererAllowed(referer: string | undefined): boolean {
  const normalized = normalizeProxyReferer(referer);
  if (!normalized) return false;
  if ((PROXY_ALLOWED_REFERERS as readonly string[]).includes(normalized)) return true;
  try {
    const origin = new URL(normalized).origin;
    return (PROXY_ALLOWED_REFERERS as readonly string[]).some((allowed) => {
      try {
        return new URL(allowed).origin === origin;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

export function isProxyTargetHostAllowed(hostname: string): boolean {
  return (PROXY_ALWAYS_ALLOWED_HOSTS as readonly string[]).includes(hostname);
}

export function isAllowedProxyRequest(url: string, referer: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    if (!parsed.hostname) return false;
    if (parsed.hostname === "localhost") return false;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(parsed.hostname) || parsed.hostname.includes(":")) {
      return false;
    }
    if (isProxyTargetHostAllowed(parsed.hostname)) return true;
    return isProxyRefererAllowed(referer);
  } catch {
    return false;
  }
}

export function shouldProxyPlaybackUrl(headers?: Record<string, string>): boolean {
  const referer = headers?.Referer ?? headers?.referer;
  const origin = headers?.Origin ?? headers?.origin;
  if (!referer && !origin) return false;
  return isProxyRefererAllowed(referer) || isProxyRefererAllowed(origin);
}
