const query = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      id
      title { english romaji }
      status
      episodes
      nextAiringEpisode { episode airingAt }
      coverImage { extraLarge large medium }
      bannerImage
    }
  }
`;

async function probe(id) {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { id } }),
  });
  const data = await res.json();
  console.log(`\n=== ID ${id} ===`);
  console.log(JSON.stringify(data, null, 2));
}

async function search(term) {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `
        query ($search: String) {
          Page(page: 1, perPage: 5) {
            media(search: $search, type: ANIME) {
              id
              title { english romaji }
              status
              episodes
              nextAiringEpisode { episode airingAt }
              coverImage { extraLarge }
            }
          }
        }
      `,
      variables: { search: term },
    }),
  });
  const data = await res.json();
  console.log(`\n=== SEARCH: ${term} ===`);
  console.log(JSON.stringify(data, null, 2));
}

async function latestCompleted() {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `
        query {
          Page(page: 1, perPage: 30) {
            media(type: ANIME, status: FINISHED, sort: END_DATE_DESC, isAdult: false) {
              id
              title { english romaji }
              status
              episodes
              nextAiringEpisode { episode airingAt }
            }
          }
        }
      `,
    }),
  });
  const data = await res.json();
  console.log("\n=== LATEST COMPLETED (first 30) ===");
  for (const m of data.data?.Page?.media ?? []) {
    const title = m.title.english || m.title.romaji;
    if (/panties|disgusted/i.test(title)) {
      console.log("MATCH:", JSON.stringify(m, null, 2));
    }
  }
  const airing = data.data?.Page?.media?.filter((m) => m.nextAiringEpisode);
  if (airing?.length) console.log("With nextAiringEpisode:", airing);
  const partial = data.data?.Page?.media?.filter(
    (m) => m.episodes && m.nextAiringEpisode && m.nextAiringEpisode.episode <= m.episodes,
  );
  if (partial?.length) console.log("Partial episodes:", partial);
}

const args = process.argv.slice(2);
if (args[0] === "search") {
  await search(args.slice(1).join(" "));
} else if (args[0] === "latest") {
  await latestCompleted();
} else {
  const ids = args.map(Number);
  for (const id of ids) {
    await probe(id);
  }
}
