const JIKAN_BASE = "https://api.jikan.moe/v4";
const REQUEST_TIMEOUT_MS = 12_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function jikanGet<T>(path: string, retries = 2): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${JIKAN_BASE}${path}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.status === 429) {
        await sleep(attempt === 0 ? 1_000 : 2_000);
        continue;
      }

      if (!response.ok) return null;
      return (await response.json()) as T;
    } catch {
      if (attempt === retries) return null;
      await sleep(500);
    }
  }

  return null;
}

export { jikanGet };
