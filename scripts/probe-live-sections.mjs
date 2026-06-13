const mediaFields = `
  id
  title { english romaji native }
  synonyms
  description(asHtml: false)
  coverImage { extraLarge large medium color }
  bannerImage
  averageScore
  genres
  episodes
  status
  format
  countryOfOrigin
  season
  seasonYear
  startDate { year month day }
  endDate { year month day }
  nextAiringEpisode { airingAt episode }
  streamingEpisodes {
    title
    thumbnail
  }
  studios { nodes { name isAnimationStudio } }
  isAdult
  tags { name rank isAdult }
`;

const pageQuery = `
  query AnimePage($page: Int, $perPage: Int, $sort: [MediaSort]) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total currentPage lastPage hasNextPage }
      media(type: ANIME, sort: $sort, isAdult: false) {
        ${mediaFields}
      }
    }
  }
`;

async function probe(label, variables) {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: pageQuery, variables }),
  });
  const text = await res.text();
  console.log(`\n=== ${label} ===`);
  console.log("status", res.status, "bytes", text.length);
  try {
    const json = JSON.parse(text);
    if (json.errors?.length) {
      console.log("errors", json.errors.map((e) => e.message).join("; "));
    } else {
      console.log("items", json.data?.Page?.media?.length ?? 0);
    }
  } catch {
    console.log("parse failed", text.slice(0, 200));
  }
}

await probe("trending p1", { page: 1, perPage: 50, sort: ["TRENDING_DESC"] });
await probe("new releases p1", {
  page: 1,
  perPage: 50,
  sort: ["START_DATE_DESC"],
  status: "RELEASING",
  startDate_greater: 20250208,
});
