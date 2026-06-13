const pageQuery = `
  query AnimePage($page: Int, $perPage: Int, $season: MediaSeason, $seasonYear: Int, $status: MediaStatus, $sort: [MediaSort], $startDate_greater: FuzzyDateInt) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total currentPage lastPage hasNextPage }
      media(type: ANIME, season: $season, seasonYear: $seasonYear, status: $status, sort: $sort, startDate_greater: $startDate_greater, isAdult: false) {
        id
        title { romaji }
        season
        seasonYear
      }
    }
  }
`;

const browseQuery = `
  query BrowseAnime($page: Int, $perPage: Int, $season: MediaSeason, $seasonYear: Int, $status: MediaStatus, $sort: [MediaSort], $isAdult: Boolean) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total currentPage lastPage hasNextPage }
      media(type: ANIME, season: $season, seasonYear: $seasonYear, status: $status, sort: $sort, isAdult: $isAdult) {
        id
        title { romaji }
        season
        seasonYear
      }
    }
  }
`;

function fuzzyDateMonthsAgo(months) {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

async function q(query, variables) {
  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await response.json();
  if (json.errors?.length) {
    console.log("ERR", json.errors[0].message);
  }
  return json.data?.Page;
}

const recent = fuzzyDateMonthsAgo(4);
console.log("4mo cutoff", recent);

const nr = await q(pageQuery, {
  page: 1,
  perPage: 36,
  status: "RELEASING",
  sort: ["START_DATE_DESC"],
  startDate_greater: recent,
});
console.log("NewReleases 4mo:", nr?.pageInfo, "items", nr?.media?.length);

const nrAll = await q(pageQuery, {
  page: 1,
  perPage: 36,
  status: "RELEASING",
  sort: ["START_DATE_DESC"],
});
console.log("NewReleases no date:", nrAll?.pageInfo, "items", nrAll?.media?.length);

const springBrowse = await q(browseQuery, {
  page: 1,
  perPage: 36,
  season: "SPRING",
  seasonYear: 2026,
  sort: ["START_DATE_DESC"],
  isAdult: null,
});
console.log(
  "Spring2026 browse isAdult:null:",
  springBrowse?.pageInfo,
  "items",
  springBrowse?.media?.length,
  springBrowse?.media?.slice(0, 3).map((m) => m.title.romaji),
);

const springPage = await q(pageQuery, {
  page: 1,
  perPage: 36,
  season: "SPRING",
  seasonYear: 2026,
  sort: ["START_DATE_DESC"],
});
console.log("Spring2026 pageQuery:", springPage?.pageInfo, "items", springPage?.media?.length);

const browseDefault = await q(browseQuery, {
  page: 1,
  perPage: 48,
  sort: ["POPULARITY_DESC"],
  isAdult: null,
});
console.log("Browse default isAdult:null:", browseDefault?.pageInfo);

const browseFalse = await q(browseQuery, {
  page: 1,
  perPage: 48,
  sort: ["POPULARITY_DESC"],
  isAdult: false,
});
console.log("Browse default isAdult:false:", browseFalse?.pageInfo);

const nrPage4 = await q(pageQuery, {
  page: 4,
  perPage: 36,
  status: "RELEASING",
  sort: ["START_DATE_DESC"],
  startDate_greater: recent,
});
console.log("NewReleases 4mo page4 items:", nrPage4?.media?.length, "pageInfo", nrPage4?.pageInfo);

const nrPage4NoDate = await q(pageQuery, {
  page: 4,
  perPage: 36,
  status: "RELEASING",
  sort: ["START_DATE_DESC"],
});
console.log("NewReleases no date page4 items:", nrPage4NoDate?.media?.length);

const springBrowseFalse = await q(browseQuery, {
  page: 1,
  perPage: 36,
  season: "SPRING",
  seasonYear: 2026,
  sort: ["START_DATE_DESC"],
  isAdult: false,
});
console.log("Spring2026 browse isAdult:false:", springBrowseFalse?.pageInfo, "items", springBrowseFalse?.media?.length);

function resolve(pageInfo, itemCount, perPage, trustCappedTotal) {
  if (!pageInfo.hasNextPage || itemCount < perPage) return Math.max(1, pageInfo.currentPage);
  if (pageInfo.total < 5000) return Math.max(1, pageInfo.lastPage);
  if (trustCappedTotal) return Math.max(1, pageInfo.lastPage);
  return pageInfo.currentPage + 1;
}

console.log("--- Resolved totals (after fix) ---");
console.log("NewReleases BEFORE 4mo page1:", resolve(nr.pageInfo, nr.media.length, 36, true));
console.log("NewReleases AFTER full page1:", resolve(nrAll.pageInfo, nrAll.media.length, 36, true));
console.log("Seasonal Spring2026 page1:", resolve(springPage.pageInfo, springPage.media.length, 36, false));
console.log("Seasonal Spring2026 page4 accurate:", resolve(nrPage4.pageInfo, nrPage4.media.length, 36, false));
