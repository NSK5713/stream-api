const query = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      id
      title { english romaji }
      status
      episodes
      nextAiringEpisode { episode airingAt }
      streamingEpisodes { title }
    }
  }
`;

function maxStreamingEp(streamingEpisodes) {
  let max = 0;
  for (const entry of streamingEpisodes ?? []) {
    const raw = entry.title?.trim();
    if (!raw) continue;
    const match = raw.match(/(?:Episode|Ep(?:isode)?\.?)\s*(\d+)/i);
    if (!match) continue;
    const number = Number(match[1]);
    if (Number.isFinite(number) && number > max) max = number;
  }
  return max;
}

async function probe(id) {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { id } }),
  });
  const data = await res.json();
  const m = data.data?.Media;
  if (!m) {
    console.log(`ID ${id}: not found`);
    return;
  }
  const streaming = m.streamingEpisodes ?? [];
  console.log(
    JSON.stringify(
      {
        id: m.id,
        title: m.title.english || m.title.romaji,
        status: m.status,
        episodes: m.episodes,
        next: m.nextAiringEpisode?.episode ?? null,
        streamingCount: streaming.length,
        maxParsed: maxStreamingEp(streaming),
      },
      null,
      2,
    ),
  );
}

const ids = [140960, 142838, 151807, 162804, 150672, 21679, 21, 147105, 182205];
for (const id of ids) {
  await probe(id);
}
