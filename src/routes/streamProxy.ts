import { Router } from "express";

export const streamProxyRouter = Router();

// CDN-style proxy endpoint
streamProxyRouter.get("/proxy", async (req, res) => {
  const url = req.query.url as string;

  if (!url) {
    return res.status(400).json({ ok: false, error: "Missing url" });
  }

  try {
    const response = await fetch(url);

    if (!response.ok || !response.body) {
      return res.status(500).json({ ok: false, error: "Stream failed" });
    }

    res.setHeader("Content-Type", "video/mp4");

    // pipe stream (CDN behaviour)
    //@ts-ignore
    response.body.pipe(res);
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ ok: false, error: "Proxy failed" });
  }
});