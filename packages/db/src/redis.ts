import { Redis } from 'ioredis';
import type { JobEvent } from '@scheduler/core';
import { REDIS_CHANNELS } from '@scheduler/core';

let redis: Redis | null = null;

export const REDIS_KEYS = {
  DLQ_ALERT_SENT: 'dlq_alert_sent',
} as const;

export function getRedisUrl(): string {
  return process.env.REDIS_URL ?? 'redis://localhost:6379';
}

export function createRedisClient(): Redis {
  if (!redis) {
    redis = new Redis(getRedisUrl(), { maxRetriesPerRequest: null });
  }
  return redis;
}

export async function checkRedisConnection(): Promise<boolean> {
  try {
    const client = createRedisClient();
    const pong = await client.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

export async function publishJobEvent(event: JobEvent): Promise<void> {
  const client = createRedisClient();
  await client.publish(REDIS_CHANNELS.JOB_EVENTS, JSON.stringify(event));
}

export async function acquireJobLock(
  jobId: string,
  ttlSeconds = Number(process.env.WORKER_LOCK_TTL_SECONDS ?? 300)
): Promise<boolean> {
  const client = createRedisClient();
  const result = await client.set(`job:${jobId}:lock`, '1', 'EX', ttlSeconds, 'NX');
  return result === 'OK';
}

export async function releaseJobLock(jobId: string): Promise<void> {
  const client = createRedisClient();
  await client.del(`job:${jobId}:lock`);
}

/** Returns true if alert should fire (threshold crossed and not sent in last hour). */
export async function shouldSendDlqAlert(threshold: number, currentCount: number): Promise<boolean> {
  if (currentCount < threshold) return false;
  const client = createRedisClient();
  const alreadySent = await client.get(REDIS_KEYS.DLQ_ALERT_SENT);
  if (alreadySent) return false;
  await client.set(REDIS_KEYS.DLQ_ALERT_SENT, '1', 'EX', 3600);
  return true;
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
