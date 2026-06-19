import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";

import { animeRouter } from "./routes/anime";
import { streamRouter } from "./routes/stream";
import { healthRouter } from "./routes/health";
import { metricsRouter } from "./routes/metrics";
import { proxyRouter } from "./routes/proxy";
import { skipTimesRouter } from "./routes/skipTimes";
import { libraryRouter } from "./routes/library";
import { anilistRouter } from "./routes/anilist";
import { isDeployedRuntime, NSKANIME_ORIGINS } from "./lib/deploy-env";

dotenv.config();

function parseAllowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN || process.env.FRONTEND_ORIGIN || "";
  const configured = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (configured.length) return configured;

  if (isDeployedRuntime()) return [...NSKANIME_ORIGINS];

  return [];
}

const allowedOrigins = parseAllowedOrigins();

const app = express();

app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
  }),
);
app.use(express.json());

// -----------------------------
// ROUTES
// -----------------------------
app.use("/api/anime", animeRouter);
app.use("/api/stream", streamRouter);
app.use("/api/health", healthRouter);
app.use("/api/metrics", metricsRouter);
app.use("/api/proxy", proxyRouter);
app.use("/api/skip-times", skipTimesRouter);
app.use("/api/library", libraryRouter);
app.use("/api/anilist", anilistRouter);

// -----------------------------
// BASIC ROOT
// -----------------------------
app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "NSKAnime Stream API",
    status: "running",
  });
});

// -----------------------------
// PORT SAFETY (FIXES EADDRINUSE ISSUES)
// -----------------------------
const DEFAULT_PORT = Number(process.env.PORT) || 3003;

function findAvailablePort(startPort: number): Promise<number> {
  return new Promise((resolve) => {
    const testServer = http.createServer();

    testServer.listen(startPort, () => {
      testServer.close(() => resolve(startPort));
    });

    testServer.on("error", () => {
      resolve(findAvailablePort(startPort + 1));
    });
  });
}

// -----------------------------
// SERVER START
// -----------------------------
async function startServer() {
  // Railway and other PaaS set PORT — bind exactly (no port scan).
  const port = process.env.PORT
    ? Number(process.env.PORT)
    : await findAvailablePort(DEFAULT_PORT);

  const server = app.listen(port, () => {
    console.log("🔥 SERVER STARTED");
    console.log(`PORT: ${port}`);
    console.log(`ENV: ${process.env.NODE_ENV || "development"}`);
  });

  // -----------------------------
  // GRACEFUL SHUTDOWN
  // -----------------------------
  const shutdown = (signal: string) => {
    console.log(`\n⚠️ Received ${signal}. Shutting down gracefully...`);

    server.close(() => {
      console.log("✅ HTTP server closed");
      process.exit(0);
    });

    // force shutdown after 10s
    setTimeout(() => {
      console.log("❌ Forced shutdown");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // -----------------------------
  // GLOBAL ERROR HANDLING
  // -----------------------------
  process.on("unhandledRejection", (reason) => {
    console.error("❌ Unhandled Promise Rejection:", reason);
  });

  process.on("uncaughtException", (err) => {
    console.error("❌ Uncaught Exception:", err);
  });

  server.on("error", (err: any) => {
    console.error("❌ Server error:", err);

    if (err.code === "EADDRINUSE") {
      console.log("⚠️ Port in use, trying next port...");
    }
  });
}

startServer();