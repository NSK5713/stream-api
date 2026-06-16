import express from "express";
import dotenv from "dotenv";
import http from "http";

import { animeRouter } from "./routes/anime";
import { streamRouter } from "./routes/stream";
import { healthRouter } from "./routes/health";
import { metricsRouter } from "./routes/metrics";
import { streamProxyRouter } from "./routes/streamProxy";

dotenv.config();

const app = express();

app.use(express.json());

// -----------------------------
// ROUTES
// -----------------------------
app.use("/api/anime", animeRouter);
app.use("/api/stream", streamRouter);
app.use("/api/health", healthRouter);
app.use("/api/metrics", metricsRouter);

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
const DEFAULT_PORT = Number(process.env.PORT) || 3002;

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