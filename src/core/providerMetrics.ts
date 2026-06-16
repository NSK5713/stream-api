type ProviderStats = {
  success: number;
  fail: number;
  avgLatency: number;
};

const stats = new Map<string, ProviderStats>();

export function recordProviderSuccess(name: string, latency: number) {
  const s = stats.get(name) || { success: 0, fail: 0, avgLatency: 0 };

  s.success++;
  s.avgLatency = (s.avgLatency + latency) / 2;

  stats.set(name, s);
}

export function recordProviderFail(name: string) {
  const s = stats.get(name) || { success: 0, fail: 0, avgLatency: 0 };
  s.fail++;
  stats.set(name, s);
}

export function rankProviders(): string[] {
  return [...stats.entries()]
    .sort((a, b) => {
      const scoreA = a[1].success - a[1].fail - a[1].avgLatency / 1000;
      const scoreB = b[1].success - b[1].fail - b[1].avgLatency / 1000;
      return scoreB - scoreA;
    })
    .map(([name]) => name);
}