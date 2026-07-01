import { Router } from "express";
import { aggregateHomeDashboard, parseHomeRequestContext } from "../services/homeAggregationService";

export const homeRouter = Router();

async function handleHomeRequest(
  req: { query: Record<string, unknown>; body?: Record<string, unknown> },
  res: {
    status: (code: number) => { json: (body: unknown) => void };
  },
) {
  try {
    const context = parseHomeRequestContext(
      req.query as Record<string, unknown>,
      req.body as Record<string, unknown> | undefined,
    );
    const payload = await aggregateHomeDashboard(context);
    res.status(200).json(payload);
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : "Home aggregation failed",
      welcome: null,
      continueWatching: [],
      newEpisodes: [],
      recommendations: [],
      watchlist: [],
      hiddenGem: null,
      trending: [],
      seasonal: [],
      homepageInsights: {
        completionRate: 0,
        favouriteGenres: [],
        favouriteStudios: [],
        preferredEpisodeLength: 24,
        averageWeeklyWatchTime: 0,
        mostActiveDay: "",
        mostActiveTime: "",
        hiddenGemReason: "",
      },
    });
  }
}

/** Public + personalized catalog aggregation (query params for seeds, genres, user id). */
homeRouter.get("/", (req, res) => {
  void handleHomeRequest(req, res);
});

/** Same aggregation with JSON body (library context metadata for cache keys). */
homeRouter.post("/", (req, res) => {
  void handleHomeRequest(req, res);
});
