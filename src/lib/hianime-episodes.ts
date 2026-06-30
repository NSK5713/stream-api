import axios from "axios";
import * as cheerio from "cheerio";
import type { ProviderEpisode } from "./provider";

const HIANIME_BASE = (process.env.HIANIME_BASE_URL ?? "https://hianime.to").replace(/\/$/, "");
const PROVIDER_TIMEOUT_MS = 25_000;
const MAX_EPISODE_PAGES = 64;

const AJAX_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "X-Requested-With": "XMLHttpRequest",
  Referer: `${HIANIME_BASE}/`,
};

type ParsedEpisodePage = {
  episodes: ProviderEpisode[];
  hasNextPage: boolean;
  nextPage: number | null;
};

function parseEpisodeListHtml(html: string, watchReferer: string): ParsedEpisodePage {
  const $ = cheerio.load(html);
  const episodes: ProviderEpisode[] = [];

  $("div.detail-infor-content > div > a").each((_, element) => {
    const anchor = $(element);
    const href = anchor.attr("href") ?? "";
    const episodeToken = href.split("/")[2]?.replace("?ep=", "$episode$");
    const number = Number.parseInt(anchor.attr("data-number") ?? "", 10);
    if (!episodeToken || !Number.isFinite(number) || number <= 0) return;

    episodes.push({
      id: episodeToken,
      number,
      title: (anchor.attr("title") ?? `Episode ${number}`).trim(),
      isFiller: anchor.hasClass("ssl-item-filler"),
    });
  });

  const pagination = $("ul.pagination");
  const activePage = Number.parseInt(pagination.find(".page-item.active").text().trim(), 10);
  const nextHref = pagination.find('a[title="Next"]').attr("href") ?? "";
  const lastHref = pagination.find('a[title="Last"]').attr("href") ?? "";

  let nextPage: number | null = null;
  const nextMatch = nextHref.match(/[?&]page=(\d+)/i);
  if (nextMatch) {
    nextPage = Number.parseInt(nextMatch[1]!, 10);
  } else if (Number.isFinite(activePage)) {
    nextPage = activePage + 1;
  }

  let lastPage = Number.isFinite(activePage) ? activePage : 1;
  const lastMatch = lastHref.match(/[?&]page=(\d+)/i);
  if (lastMatch) {
    lastPage = Number.parseInt(lastMatch[1]!, 10);
  }

  const hasNextPage =
    Boolean(nextHref) ||
    (Number.isFinite(activePage) && Number.isFinite(lastPage) && activePage < lastPage);

  return {
    episodes,
    hasNextPage,
    nextPage: hasNextPage ? nextPage : null,
  };
}

function mergeEpisodesByNumber(
  target: Map<number, ProviderEpisode>,
  incoming: ProviderEpisode[],
): void {
  for (const episode of incoming) {
    const number = Math.trunc(episode.number);
    if (!Number.isFinite(number) || number <= 0) continue;
    if (!target.has(number)) {
      target.set(number, { ...episode, number });
    }
  }
}

/** Fetch every HiAnime episode page and merge into one ascending list. */
export async function fetchAllHianimeEpisodes(animeId: string): Promise<ProviderEpisode[]> {
  const numericId = animeId.split("-").pop()?.trim();
  if (!numericId) return [];

  const watchReferer = `${HIANIME_BASE}/watch/${animeId}`;
  const byNumber = new Map<number, ProviderEpisode>();
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage && page <= MAX_EPISODE_PAGES) {
    const url =
      page === 1
        ? `${HIANIME_BASE}/ajax/v2/episode/list/${numericId}`
        : `${HIANIME_BASE}/ajax/v2/episode/list/${numericId}?page=${page}`;

    const response = await axios.get<{ html?: string }>(url, {
      headers: { ...AJAX_HEADERS, Referer: watchReferer },
      timeout: PROVIDER_TIMEOUT_MS,
    });

    const html = response.data?.html;
    if (!html?.trim()) break;

    const parsed = parseEpisodeListHtml(html, watchReferer);
    if (!parsed.episodes.length) break;

    mergeEpisodesByNumber(byNumber, parsed.episodes);

    if (!parsed.hasNextPage) break;
    page = parsed.nextPage && parsed.nextPage > page ? parsed.nextPage : page + 1;
    hasNextPage = parsed.hasNextPage;
  }

  return [...byNumber.values()].sort((left, right) => left.number - right.number);
}
