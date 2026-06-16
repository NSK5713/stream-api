type HealthStatus = "healthy" | "degraded" | "dead";

const healthMap = new Map<string, { failCount: number; lastFail: number }>();

export function reportFailure(key: string) {
  const entry = healthMap.get(key) ?? { failCount: 0, lastFail: 0 };

  entry.failCount += 1;
  entry.lastFail = Date.now();

  healthMap.set(key, entry);
}

export function reportSuccess(key: string) {
  healthMap.delete(key);
}

export function getHealth(key: string): HealthStatus {
  const entry = healthMap.get(key);
  if (!entry) return "healthy";

  if (entry.failCount >= 5) return "dead";
  if (entry.failCount >= 2) return "degraded";

  return "healthy";
}