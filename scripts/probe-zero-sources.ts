import { allanimeProvider } from "../src/lib/allanime-provider";

async function main() {
  const ids: [string, string][] = [
    ["ZERO", "ANgg8jGMbJ5RC52eE"],
    ["MANNER", "DJk3JWgFnbkccEh9d"],
  ];
  for (const [name, showId] of ids) {
    const servers = await allanimeProvider.servers(`${showId}@1`);
    console.log(`\n${name} servers:`, servers.servers.map((s) => s.name).join(", "));
    for (const server of servers.servers.slice(0, 4)) {
      try {
        const sources = await allanimeProvider.sources(`${showId}@1`, server.id, "sub");
        console.log(`  [${server.name}] ${sources.sources[0]?.type} ${(sources.sources[0]?.url ?? "").slice(0, 100)}`);
      } catch (error) {
        console.log(`  [${server.name}] FAIL`, error instanceof Error ? error.message : error);
      }
    }
  }
}

main().catch(console.error);
