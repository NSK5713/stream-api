import { Router } from "express";
import { Readable } from "node:stream";
import { isAllowedProxyRequest } from "../lib/proxy-allowlist";
import { rewriteM3u8Manifest } from "../lib/m3u8-rewrite";

export const proxyRouter = Router();

proxyRouter.get("/", async (req, res) => {
  const url = String(req.query.url ?? "");
  const referer = String(req.query.referer ?? "");
  const origin = String(req.query.origin ?? "");

  if (!url) {
    res.status(400).json({ error: "Missing url" });
    return;
  }

  if (!isAllowedProxyRequest(url, referer)) {
    res.status(400).json({ error: "URL not allowed for this referer" });
    return;
  }

  try {
    const upstream = await fetch(url, {
      headers: {
        ...(referer ? { Referer: referer } : {}),
        ...(origin ? { Origin: origin } : {}),
        ...(req.headers.range ? { Range: String(req.headers.range) } : {}),
        Accept: req.headers.accept ? String(req.headers.accept) : "*/*",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      redirect: "follow",
    });

    res.status(upstream.status);

    const contentType = upstream.headers.get("content-type");
    const mightBeM3u8 =
      (contentType && /mpegurl/i.test(contentType)) || /\.m3u8(\?|$)/i.test(url);

    const passthroughHeaders = [
      "content-length",
      "content-range",
      "accept-ranges",
      "cache-control",
      "etag",
      "last-modified",
    ];

    for (const name of passthroughHeaders) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }

    if (contentType) {
      res.setHeader("content-type", contentType);
    }

    res.setHeader("Access-Control-Expose-Headers", "Content-Length,Content-Range,Accept-Ranges");

    if (!upstream.body) {
      res.end();
      return;
    }

    if (mightBeM3u8 && upstream.ok) {
      const text = await upstream.text();
      if (text.trimStart().startsWith("#EXTM3U")) {
        res.setHeader(
          "content-type",
          contentType && /mpegurl/i.test(contentType)
            ? contentType
            : "application/vnd.apple.mpegurl",
        );
        res.removeHeader("content-length");
        res.send(rewriteM3u8Manifest(text, url, referer, origin));
        return;
      }

      if (contentType) res.setHeader("content-type", contentType);
      res.send(text);
      return;
    }

    if (mightBeM3u8) {
      const text = await upstream.text();
      if (contentType) res.setHeader("content-type", contentType);
      res.send(text);
      return;
    }

    const nodeStream = (Readable as { fromWeb?: (body: unknown) => Readable }).fromWeb
      ? (Readable as { fromWeb: (body: unknown) => Readable }).fromWeb(upstream.body)
      : Readable.from(upstream.body as AsyncIterable<Uint8Array>);
    nodeStream.pipe(res);
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Proxy failed" });
  }
});
