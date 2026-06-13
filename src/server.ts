console.log("🔥 SERVER STARTING...");
console.log("PORT:", process.env.PORT);
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";

import { animeRouter } from "./routes/anime";
import { healthRouter } from "./routes/health";
import { proxyRouter } from "./routes/proxy";
import { skipTimesRouter } from "./routes/skipTimes";
import { anilistRouter } from "./routes/anilist";
import { libraryRouter } from "./routes/library";

const app = express();
const port = Number(process.env.PORT) || 3000;

const allowedOrigins = (process.env.FRONTEND_ORIGIN || "*")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.includes("*") ? true : allowedOrigins,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: [
      "Content-Length",
      "Content-Range",
      "Accept-Ranges",
      "X-NSKAnime-Cache",
      "Retry-After",
    ],
  })
);

app.use(express.json({ limit: "1mb" }));

app.get("/", (_req: Request, res: Response) => {
  res.status(200).json({ ok: true, service: "nskanime-stream-api" });
});

app.use("/api/health", healthRouter);
app.use("/api/anime", animeRouter);
app.use("/api/proxy", proxyRouter);
app.use("/api/skip-times", skipTimesRouter);
app.use("/api/anilist", anilistRouter);
app.use("/api/library", libraryRouter);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// IMPORTANT: proper Express error handler signature
app.use(
  (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Unhandled route error:", error);

    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
);

app.listen(port, "0.0.0.0", () => {
  console.log(`NSKAnime stream API listening on http://0.0.0.0:${port}`);
});