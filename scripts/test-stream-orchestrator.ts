import { toAnimeId, toEpisodeId, isValidAnimeId, isValidEpisodeId } from "../src/routes/ids";
import type { EpisodeId } from "../src/types/episode";

function assert(cond: boolean, msg?: string) {
  if (!cond) {
    console.error("Assertion failed:", msg);
    process.exitCode = 2;
    throw new Error(msg ?? "assertion failed");
  }
}

function acceptsEpisodeId(_id: EpisodeId) {
  return true;
}

(async () => {
  console.log("Running architecture lock unit tests...");

  // Route-layer toEpisodeId — single normalization point
  assert(toEpisodeId("show123@1") === "allanime:show123@1", "toEpisodeId should prefix bare id");
  assert(toEpisodeId("allanime:show123@1") === "allanime:show123@1", "toEpisodeId should pass through canonical id");

  // Route-layer toAnimeId
  assert(toAnimeId("show123") === "allanime:show123", "toAnimeId should prefix bare id");
  assert(toAnimeId("allanime:show123") === "allanime:show123", "toAnimeId should pass through canonical id");

  // Validation enforces canonical shape
  assert(isValidEpisodeId("allanime:show123@1"), "valid episode id");
  assert(!isValidEpisodeId("show123@1"), "bare episode id is invalid at route boundary");
  assert(!isValidEpisodeId("hianime:show123@1"), "non-allanime prefix is invalid");

  assert(isValidAnimeId("allanime:show123"), "valid anime id");
  assert(!isValidAnimeId("allanime:show123@1"), "episode-shaped id is invalid anime id");
  assert(!isValidAnimeId("show123"), "bare anime id is invalid at route boundary");

  // Type contract: EpisodeId flows through typed APIs
  const episodeId = toEpisodeId("show123@42");
  assert(acceptsEpisodeId(episodeId), "EpisodeId type assignment");

  console.log("All tests passed.");
  process.exit(0);
})();
