const BASE_DELAYS_MS = [1_000, 5_000, 25_000] as const;
const JITTER_FACTOR = 0.2;

export function getRetryDelay(retryCount: number): number {
  const index = Math.min(retryCount, BASE_DELAYS_MS.length - 1);
  return BASE_DELAYS_MS[index];
}

export function applyJitter(baseMs: number, jitterFactor = JITTER_FACTOR): number {
  const jitterRange = baseMs * jitterFactor;
  const jitter = (Math.random() * 2 - 1) * jitterRange;
  return Math.max(0, Math.round(baseMs + jitter));
}

export function getRetryDelayWithJitter(retryCount: number): number {
  return applyJitter(getRetryDelay(retryCount));
}

export function getNextRetryAt(retryCount: number, from: Date = new Date()): Date {
  const delayMs = getRetryDelayWithJitter(retryCount);
  return new Date(from.getTime() + delayMs);
}
