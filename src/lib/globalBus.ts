type Region = "EU" | "US" | "ASIA";

type ProviderScore = {
  latency: number;
  fail: number;
  success: number;
};

const regionStats: Record<string, Record<string, ProviderScore>> = {};

export function recordRegionSuccess(
  region: Region,
  provider: string,
  latency: number
) {
  if (!regionStats[region]) regionStats[region] = {};
  if (!regionStats[region][provider]) {
    regionStats[region][provider] = { latency: 0, fail: 0, success: 0 };
  }

  const p = regionStats[region][provider];

  p.success++;
  p.latency = (p.latency + latency) / 2;
}

export function recordRegionFail(region: Region, provider: string) {
  if (!regionStats[region]) regionStats[region] = {};
  if (!regionStats[region][provider]) {
    regionStats[region][provider] = { latency: 0, fail: 0, success: 0 };
  }

  regionStats[region][provider].fail++;
}

export function getBestProvider(region: Region): string {
  const providers = regionStats[region] || {};

  return Object.entries(providers)
    .sort((a, b) => {
      const scoreA = a[1].success - a[1].fail - a[1].latency / 1000;
      const scoreB = b[1].success - b[1].fail - b[1].latency / 1000;
      return scoreB - scoreA;
    })[0]?.[0] || "default";
}