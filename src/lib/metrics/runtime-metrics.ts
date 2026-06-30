export type MetricName =
  | "animeInfoRequests"
  | "streamRequests"
  | "cacheHits"
  | "cacheMisses"
  | "enrichmentRuns"
  | "streamFailures"
  | "apiErrors";

export type MetricsSnapshot = Record<MetricName, number>;

const counters: MetricsSnapshot = {
  animeInfoRequests: 0,
  streamRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  enrichmentRuns: 0,
  streamFailures: 0,
  apiErrors: 0,
};

export function incrementMetric(name: MetricName, amount = 1): void {
  counters[name] += amount;
}

export function getMetricsSnapshot(): MetricsSnapshot {
  return { ...counters };
}
