export type StreamFailureCategory =
  | "no_servers"
  | "no_sources"
  | "validation_failed"
  | "provider_error"
  | "timeout"
  | "circuit_open"
  | "all_servers_failed";

type ServerStats = {
  attempts: number;
  successes: number;
  failures: number;
  latencies: number[];
};

const MAX_LATENCIES = 100;

const serverStats = new Map<string, ServerStats>();
const failuresByCategory = new Map<StreamFailureCategory, number>();

let totalResolutions = 0;
let cacheHits = 0;
let resolutionSuccesses = 0;
let resolutionFailures = 0;

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function getOrCreateServer(serverId: string): ServerStats {
  let stats = serverStats.get(serverId);
  if (!stats) {
    stats = { attempts: 0, successes: 0, failures: 0, latencies: [] };
    serverStats.set(serverId, stats);
  }
  return stats;
}

function bumpCategory(category: StreamFailureCategory) {
  failuresByCategory.set(category, (failuresByCategory.get(category) ?? 0) + 1);
}

export function recordCacheHit() {
  cacheHits++;
}

export function recordResolutionStart() {
  totalResolutions++;
}

export function recordResolutionOutcome(success: boolean) {
  if (success) resolutionSuccesses++;
  else resolutionFailures++;
}

export function recordCircuitOpenSkip(serverId: string) {
  bumpCategory("circuit_open");
  const stats = getOrCreateServer(serverId);
  stats.failures++;
}

export function recordServerAttempt(
  serverId: string,
  latencyMs: number,
  outcome: "success" | "failure",
) {
  const stats = getOrCreateServer(serverId);
  stats.attempts++;
  stats.latencies.push(latencyMs);
  if (stats.latencies.length > MAX_LATENCIES) stats.latencies.shift();

  if (outcome === "success") stats.successes++;
  else stats.failures++;
}

export type StreamFailureContext = {
  episodeId: string;
  category: StreamFailureCategory;
  message: string;
  serverId?: string;
  latencyMs?: number;
  serversTried?: string[];
  error?: string;
};

export function logStreamFailure(ctx: StreamFailureContext) {
  bumpCategory(ctx.category);

  const payload = {
    event: "stream_resolution_failed",
    ts: new Date().toISOString(),
    ...ctx,
  };

  console.error(JSON.stringify(payload));
}

export function isTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    err.name === "AbortError" ||
    err.name === "TimeoutError"
  );
}

export function getMetrics() {
  const servers: Record<
    string,
    {
      attempts: number;
      successes: number;
      failures: number;
      avgLatencyMs: number;
      p95LatencyMs: number;
    }
  > = {};

  for (const [serverId, stats] of serverStats) {
    servers[serverId] = {
      attempts: stats.attempts,
      successes: stats.successes,
      failures: stats.failures,
      avgLatencyMs: Math.round(average(stats.latencies)),
      p95LatencyMs: Math.round(percentile(stats.latencies, 95)),
    };
  }

  return {
    resolutions: {
      total: totalResolutions,
      successes: resolutionSuccesses,
      failures: resolutionFailures,
      cacheHits,
    },
    failuresByCategory: Object.fromEntries(failuresByCategory),
    servers,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };
}
