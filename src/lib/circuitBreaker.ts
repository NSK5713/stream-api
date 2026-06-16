type FailureRecord = { count: number; lastFailure: number };

const failures = new Map<string, FailureRecord>();
const blockedUntil = new Map<string, number>();

const FAILURE_THRESHOLD = Number(process.env.CB_FAILURE_THRESHOLD ?? 3);
const COOLDOWN_MS = Number(process.env.CB_COOLDOWN_MS ?? 60_000);

export function canRequest(key: string): boolean {
  const until = blockedUntil.get(key);
  if (until && Date.now() < until) return false;
  return true;
}

export function recordFailure(key: string) {
  const rec = failures.get(key) ?? { count: 0, lastFailure: 0 };
  rec.count += 1;
  rec.lastFailure = Date.now();
  failures.set(key, rec);

  if (rec.count >= FAILURE_THRESHOLD) {
    blockedUntil.set(key, Date.now() + COOLDOWN_MS);
    failures.delete(key);
  }
}

export function recordSuccess(key: string) {
  if (failures.has(key)) failures.delete(key);
  if (blockedUntil.has(key)) blockedUntil.delete(key);
}

export function getStatus(key: string) {
  return {
    blockedUntil: blockedUntil.get(key) ?? null,
    failures: failures.get(key) ?? { count: 0, lastFailure: 0 },
  };
}
