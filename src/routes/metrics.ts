import { Router } from "express";
import { getMetrics } from "../lib/observability";

export const metricsRouter = Router();

metricsRouter.get("/", (_req, res) => {
  res.status(200).json({
    ok: true,
    ...getMetrics(),
  });
});
