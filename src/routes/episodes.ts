import { Router } from "express";
import { load } from "cheerio";
import axios from "axios";

export const episodesRouter = Router();

const ALLANIME_BASE = "https://allanime.day";

// Get episode list from anime ID
episodesRouter.get("/:id", async (req, res) => {
  try {
    const id = req.params.id;

    if (!id) {
      return res.status(400).json({ error: "Missing anime id" });
    }

    // fetch anime page (AllAnime internal structure)
    const url = `${ALLANIME_BASE}/anime/${id}`;

    const { data } = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122",
      },
    });

    const $ = load(data);

    const episodes: any[] = [];

    // NOTE: selector may change depending on AllAnime layout
    $(".episode-item, .episode, [data-episode]").each((_, el) => {
      const element = $(el);

      const epId =
        element.attr("data-id") ||
        element.attr("data-episode-id") ||
        element.text();

      const title = element.text().trim();

      if (epId) {
        episodes.push({
          id: epId,
          title: title || `Episode ${episodes.length + 1}`,
        });
      }
    });

    return res.json({
      animeId: id,
      episodes,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Failed to fetch episodes",
    });
  }
});