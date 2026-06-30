import { Router, type Request, type Response, type NextFunction } from "express";
import { getMetricsSnapshot } from "../lib/metrics/runtime-metrics";

export const adminRouter = Router();

function requireAdminToken(req: Request, res: Response, next: NextFunction): void {
  const configured = process.env.ADMIN_TOKEN?.trim();
  if (!configured) {
    res.status(503).json({ error: "Admin metrics not configured" });
    return;
  }

  const provided = req.header("x-admin-token")?.trim();
  if (!provided || provided !== configured) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}

adminRouter.get("/metrics", requireAdminToken, (_req, res) => {
  res.status(200).json({
    uptime: process.uptime(),
    metrics: getMetricsSnapshot(),
    timestamp: new Date().toISOString(),
  });
});
