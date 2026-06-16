import { dedupe } from "../src/lib/dedupe";
import { canRequest, recordFailure, recordSuccess, getStatus } from "../src/lib/circuitBreaker";

async function testDedupe() {
  let calls = 0;
  async function work() {
    calls++;
    await new Promise((r) => setTimeout(r, 50));
    return 42;
  }

  const [a, b] = await Promise.all([dedupe("k", work), dedupe("k", work)]);
  if (a !== 42 || b !== 42 || calls !== 1) throw new Error("dedupe failed");
  console.log("dedupe OK");
}

async function testCircuit() {
  const key = "p1";
  // ensure fresh
  for (let i = 0; i < 4; i++) recordFailure(key);

  if (canRequest(key)) throw new Error("circuit should be open");
  console.log("circuit open OK", getStatus(key));
}

(async () => {
  await testDedupe();
  await testCircuit();
  console.log("All small tests passed");
})();
