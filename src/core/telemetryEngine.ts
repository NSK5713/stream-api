type Region = "EU" | "US" | "ASIA";

type Metrics = {
  latency: number[];
  success: number;
  fail: number;
  lastSeen: number;
};

const telemetry = new Map<string, Record<string, Metrics>>();

export function initProvider(region: Region, provider: string) {
  if (!telemetry.has(region)) telemetry.set(region, {});
  const r = telemetry.get(region)!;

  if (!r[provider]) {
    r[provider] = {
      latency: [],
      success: 0,
      fail: 0,
      lastSeen: Date.now(),
    };
  }
}

export function recordSuccess(region: Region, provider: string, latency: number) {
  initProvider(region, provider);

  const p = telemetry.get(region)![provider];

  p.success++;
  p.lastSeen = Date.now();
  p.latency.push(latency);

  if (p.latency.length > 50) p.latency.shift();
}

export function recordFail(region: Region, provider: string) {
  initProvider(region, provider);

  const p = telemetry.get(region)![provider];

  p.fail++;
  p.lastSeen = Date.now();
}

export function getProviderScore(region: Region, provider: string) {
  const p = telemetry.get(region)?.[provider];

  if (!p) return 0;

  const avgLatency =
    p.latency.reduce((a, b) => a + b, 0) / (p.latency.length || 1);

  return p.success - p.fail - avgLatency / 1000;
}

export function rankProviders(region: Region) {
  const providers = telemetry.get(region) || {};

  return Object.keys(providers).sort(
    (a, b) => getProviderScore(region, b) - getProviderScore(region, a)
  );
}