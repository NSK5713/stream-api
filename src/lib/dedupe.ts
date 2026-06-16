const inflight = new Map<string, Promise<any>>();

export function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (inflight.has(key)) {
    return inflight.get(key)! as Promise<T>;
  }

  const promise = fn().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise as Promise<T>;
}
