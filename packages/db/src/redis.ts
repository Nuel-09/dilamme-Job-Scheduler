import { Redis } from 'ioredis';
import type { JobEvent } from '@scheduler/core';
import { REDIS_CHANNELS } from '@scheduler/core';

let redis: Redis | null = null;

export function getRedisUrl(): string {
  return process.env.REDIS_URL ?? 'redis://localhost:6379';
}

export function createRedisClient(): Redis {
  if (!redis) {
    redis = new Redis(getRedisUrl(), { maxRetriesPerRequest: null });
  }
  return redis;
}

export async function publishJobEvent(event: JobEvent): Promise<void> {
  const client = createRedisClient();
  await client.publish(REDIS_CHANNELS.JOB_EVENTS, JSON.stringify(event));
}

export async function acquireJobLock(jobId: string, ttlSeconds = 300): Promise<boolean> {
  const client = createRedisClient();
  const result = await client.set(`job:${jobId}:lock`, '1', 'EX', ttlSeconds, 'NX');
  return result === 'OK';
}

export async function releaseJobLock(jobId: string): Promise<void> {
  const client = createRedisClient();
  await client.del(`job:${jobId}:lock`);
}

export async function addToReadyQueue(jobId: string, score: number): Promise<void> {
  const client = createRedisClient();
  await client.zadd(REDIS_CHANNELS.READY_QUEUE, score, jobId);
}

export async function removeFromReadyQueue(jobId: string): Promise<void> {
  const client = createRedisClient();
  await client.zrem(REDIS_CHANNELS.READY_QUEUE, jobId);
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
