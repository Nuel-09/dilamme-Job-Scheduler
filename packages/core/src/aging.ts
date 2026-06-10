import { AGING_INTERVAL_MS, type JobPriority } from './types.js';

export interface AgingInput {
  priority: JobPriority;
  createdAt: Date;
  now?: Date;
}

/**
 * Starvation prevention: every 30 seconds waiting in pending,
 * effective priority decreases by 1 (floored at 1 = High).
 */
export function computeEffectivePriority(input: AgingInput): number {
  const now = input.now ?? new Date();
  const waitMs = Math.max(0, now.getTime() - input.createdAt.getTime());
  const agingSteps = Math.floor(waitMs / AGING_INTERVAL_MS);
  return Math.max(1, input.priority - agingSteps);
}

export function computeAgingSteps(createdAt: Date, now: Date = new Date()): number {
  const waitMs = Math.max(0, now.getTime() - createdAt.getTime());
  return Math.floor(waitMs / AGING_INTERVAL_MS);
}
