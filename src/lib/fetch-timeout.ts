export class FetchTimeoutError extends Error {
  readonly url: string;

  constructor(url: string, timeoutMs: number) {
    super(`Fetch timed out after ${timeoutMs}ms`);
    this.name = "FetchTimeoutError";
    this.url = url;
  }
}

/** Race fetch against a timer — does not abort the underlying request. */
export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = 10_000,
): Promise<Response> {
  return Promise.race([
    fetch(url, init),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new FetchTimeoutError(url, timeoutMs)), timeoutMs);
    }),
  ]);
}
