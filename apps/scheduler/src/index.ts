import 'dotenv/config';
import pino from 'pino';
import {
  JobHeap,
  TimingWheel,
  computeEffectivePriority,
  DLQ_ALERT_THRESHOLD,
  type ReadyJob,
} from '@scheduler/core';
import {
  closeDb,
  closeRedis,
  findDuePendingJobs,
  areDependenciesCompleted,
  markJobReady,
  updateAgingForPendingJobs,
  getDlqCount,
  createJob,
  publishJobEvent,
  addToReadyQueue,
  getDb,
} from '@scheduler/db';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const TICK_MS = Number(process.env.SCHEDULER_TICK_MS ?? 500);

const heap = new JobHeap();
const timingWheel = new TimingWheel<ReadyJob>();

let lastDlqAlertCount = 0;

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

async function promoteDueJobs(): Promise<void> {
  const dueJobs = await findDuePendingJobs(100);

  for (const job of dueJobs) {
    const depsOk = await areDependenciesCompleted(job.id);
    if (!depsOk) continue;

    const ready = jobToReadyJob(job);
    heap.insertJob(ready);
    timingWheel.insert(ready, ready.scheduledAt.getTime());

    const score =
      ready.effectivePriority * 1e15 +
      ready.scheduledAt.getTime() * 1e3 +
      ready.createdAt.getTime();

    await markJobReady(job.id, ready.effectivePriority);
    await addToReadyQueue(job.id, score);

    logger.info({
      event: 'job.promoted',
      jobId: job.id,
      effectivePriority: ready.effectivePriority,
      algorithm: 'heap+timing_wheel',
    });
  }

  timingWheel.tick(Date.now());
}

async function checkDlqThreshold(): Promise<void> {
  const count = await getDlqCount();
  if (count >= DLQ_ALERT_THRESHOLD && lastDlqAlertCount < DLQ_ALERT_THRESHOLD) {
    logger.warn({
      event: 'dlq.threshold_exceeded',
      dlqCount: count,
      threshold: DLQ_ALERT_THRESHOLD,
    });

    const alertJob = await createJob({
      type: 'send_dlq_alert',
      priority: 1,
      payload: {
        dlqCount: count,
        threshold: DLQ_ALERT_THRESHOLD,
        adminEmail: process.env.DLQ_ALERT_EMAIL ?? 'admin@dilamme.com',
      },
    });

    await publishJobEvent({
      jobId: alertJob.id,
      status: alertJob.status,
      type: alertJob.type,
      timestamp: new Date().toISOString(),
    });
  }
  lastDlqAlertCount = count;
}

async function tick(): Promise<void> {
  try {
    await updateAgingForPendingJobs();
    await promoteDueJobs();
    await checkDlqThreshold();
  } catch (err) {
    logger.error({ event: 'scheduler.error', err: String(err) });
  }
}

async function main() {
  getDb();
  logger.info({ event: 'scheduler.started', tickMs: TICK_MS });
  await tick();
  setInterval(tick, TICK_MS);
}

const shutdown = async () => {
  await closeDb();
  await closeRedis();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
  logger.error({ event: 'scheduler.fatal', err: String(err) });
  process.exit(1);
});
