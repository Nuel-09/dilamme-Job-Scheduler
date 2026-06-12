import '@scheduler/db/load-env';
import pino from 'pino';
import {
  IndexedJobHeap,
  computeEffectivePriority,
  DLQ_ALERT_THRESHOLD,
  type ReadyJob,
} from '@scheduler/core';
import {
  closeDb,
  closeRedis,
  findDuePendingJobs,
  findReadyJobsForRebuild,
  areDependenciesCompleted,
  markJobReady,
  updateAgingForPendingJobs,
  releaseOverdueDelayedJobs,
  getDlqCount,
  createJob,
  publishJobEvent,
  shouldSendDlqAlert,
  getDb,
} from '@scheduler/db';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const TICK_MS = Number(process.env.SCHEDULER_TICK_MS ?? process.env.SCHEDULER_TICK_INTERVAL_MS ?? 500);
const HEAP_REBUILD_EVERY_TICKS = 120;

const heap = new IndexedJobHeap();
let tickCount = 0;
let isShuttingDown = false;
let tickInProgress = false;

function jobToReadyJob(job: Awaited<ReturnType<typeof findDuePendingJobs>>[0]): ReadyJob {
  const effectivePriority = computeEffectivePriority({
    priority: job.priority as 1 | 2 | 3,
    createdAt: job.createdAt,
  });
  return {
    id: job.id,
    type: job.type,
    payload: job.payload as Record<string, unknown>,
    priority: job.priority as 1 | 2 | 3,
    effectivePriority,
    scheduledAt: job.scheduledAt ?? job.createdAt,
    createdAt: job.createdAt,
    retryCount: job.retryCount,
    maxRetries: job.maxRetries,
  };
}

async function rebuildHeapFromDatabase(): Promise<void> {
  heap.clear();
  const readyJobs = await findReadyJobsForRebuild(500);
  for (const job of readyJobs) {
    heap.insertJob(jobToReadyJob(job));
  }
  logger.info({ event: 'scheduler.heap_rebuilt', count: readyJobs.length });
}

async function promoteDueJobs(): Promise<void> {
  const dueJobs = await findDuePendingJobs(100);

  for (const job of dueJobs) {
    const depsOk = await areDependenciesCompleted(job.id);
    if (!depsOk) continue;

    const ready = jobToReadyJob(job);
    heap.insertJob(ready);
    await markJobReady(job.id, ready.effectivePriority);
    await publishJobEvent({
      jobId: job.id,
      status: 'pending',
      type: job.type,
      timestamp: new Date().toISOString(),
    });
  }
}

async function checkDlqThreshold(): Promise<void> {
  const count = await getDlqCount();
  const threshold = DLQ_ALERT_THRESHOLD;
  const shouldAlert = await shouldSendDlqAlert(threshold, count);

  if (!shouldAlert) return;

  logger.warn({
    event: 'dlq.threshold_exceeded',
    dlqCount: count,
    threshold,
  });

  const alertJob = await createJob({
    type: 'send_dlq_alert',
    priority: 1,
    payload: {
      dlqCount: count,
      threshold,
      adminEmail: process.env.ADMIN_EMAIL ?? process.env.DLQ_ALERT_EMAIL ?? 'admin@dilamme.com',
    },
  });

  await publishJobEvent({
    jobId: alertJob.id,
    status: alertJob.status,
    type: alertJob.type,
    timestamp: new Date().toISOString(),
  });
}

async function tick(): Promise<void> {
  if (isShuttingDown || tickInProgress) return;
  tickInProgress = true;
  try {
    tickCount++;
    const released = await releaseOverdueDelayedJobs(100);
    if (released.length > 0) {
      logger.info({ event: 'scheduler.overdue_sweep', count: released.length });
      for (const job of released) {
        await publishJobEvent({
          jobId: job.id,
          status: 'pending',
          type: job.type,
          timestamp: new Date().toISOString(),
        });
      }
    }

    const aged = await updateAgingForPendingJobs();
    if (aged.length > 0) {
      for (const job of aged) {
        if (job.inReadyQueue) {
          heap.updatePriority(job.id, job.effectivePriority);
        }
      }
      logger.info({ event: 'scheduler.aging', updated: aged.length });
    }

    if (tickCount % HEAP_REBUILD_EVERY_TICKS === 0) {
      await rebuildHeapFromDatabase();
    }

    await promoteDueJobs();
    await checkDlqThreshold();
  } catch (err) {
    logger.error({ event: 'scheduler.error', err: String(err) });
  } finally {
    tickInProgress = false;
  }
}

let tickInterval: ReturnType<typeof setInterval> | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

async function main() {
  getDb();
  await rebuildHeapFromDatabase();
  logger.info({ event: 'scheduler.started', tickMs: TICK_MS });
  await tick();
  tickInterval = setInterval(tick, TICK_MS);
  heartbeatInterval = setInterval(() => {
    logger.info({ event: 'scheduler.heartbeat', heapSize: heap.size });
  }, 30_000);
}

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info({ event: 'scheduler.shutdown', reason: signal });

  if (tickInterval) clearInterval(tickInterval);
  if (heartbeatInterval) clearInterval(heartbeatInterval);

  const deadline = Date.now() + 1000;
  while (tickInProgress && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  await closeDb();
  await closeRedis();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main().catch((err) => {
  logger.error({ event: 'scheduler.fatal', err: String(err) });
  process.exit(1);
});

export { heap };
