import '@scheduler/db/load-env';
import pino from 'pino';
import { TimingWheel, type JobInterval } from '@scheduler/core';
import {
  claimNextReadyJob,
  updateJobWithLog,
  publishJobEvent,
  acquireJobLock,
  releaseJobLock,
  scheduleRecurringRun,
  scheduleJobForRetryDelay,
  releaseJobFromRetryDelay,
  releaseRecurringJob,
  findAwaitingRetryJobs,
  getJobById,
  closeDb,
  closeRedis,
  getDb,
} from '@scheduler/db';
import { getHandler, type Logger as HandlerLogger } from '@scheduler/handlers';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const POLL_MS = Number(process.env.WORKER_POLL_MS ?? process.env.WORKER_POLL_INTERVAL_MS ?? 500);

interface WheelEntry {
  jobId: string;
  kind: 'retry' | 'recurring';
  interval?: JobInterval;
}

const retryWheel = new TimingWheel<WheelEntry>();
const handlerLogger: HandlerLogger = {
  info: (obj) => logger.info(obj),
  warn: (obj) => logger.warn(obj),
  error: (obj) => logger.error(obj),
};

let isShuttingDown = false;
let pollInProgress = false;
let currentJobPromise: Promise<void> | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

async function processWheelDueEntries(): Promise<void> {
  const due = retryWheel.tick(Date.now());
  for (const entry of due) {
    if (entry.kind === 'retry') {
      const job = await releaseJobFromRetryDelay(entry.jobId);
      if (job) {
        await publishJobEvent({
          jobId: job.id,
          status: job.status,
          retryCount: job.retryCount,
          timestamp: new Date().toISOString(),
        });
        logger.info({ event: 'job.retry', jobId: entry.jobId, source: 'timing_wheel' });
      }
    } else if (entry.kind === 'recurring' && entry.interval) {
      const job = await releaseRecurringJob(entry.jobId, entry.interval);
      if (job) {
        await publishJobEvent({
          jobId: job.id,
          status: job.status,
          type: job.type,
          timestamp: new Date().toISOString(),
        });
        logger.info({ event: 'job.recurring_scheduled', jobId: entry.jobId, interval: entry.interval });
      }
    }
  }
}

async function processJob(job: NonNullable<Awaited<ReturnType<typeof claimNextReadyJob>>>) {
  const locked = await acquireJobLock(job.id);
  if (!locked) {
    logger.warn({ event: 'job.lock_failed', jobId: job.id });
    await updateJobWithLog(
      job.id,
      { status: 'pending', inReadyQueue: true },
      'job.retry',
      'Lock acquisition failed — returned to ready queue'
    );
    return;
  }

  try {
    const fresh = await getJobById(job.id);
    if (!fresh || fresh.cancelRequested) {
      await updateJobWithLog(
        job.id,
        { status: 'cancelled', cancelRequested: false, inReadyQueue: false },
        'job.cancelled',
        'Cancelled before handler execution',
        { phase: 'pre_handler' }
      );
      await publishJobEvent({
        jobId: job.id,
        status: 'cancelled',
        timestamp: new Date().toISOString(),
      });
      logger.info({ event: 'job.cancelled', jobId: job.id, phase: 'pre_handler' });
      return;
    }

    logger.info({ event: 'job.started', jobId: job.id, type: job.type });

    const handler = getHandler(job.type);
    if (!handler) {
      throw new Error(`No handler registered for job type: ${job.type}`);
    }

    await handler({
      jobId: job.id,
      payload: job.payload as Record<string, unknown>,
      logger: handlerLogger,
    });

    const after = await getJobById(job.id);
    if (after?.cancelRequested) {
      await updateJobWithLog(
        job.id,
        {
          status: 'cancelled',
          cancelRequested: false,
          inReadyQueue: false,
          completedAt: new Date(),
        },
        'job.cancelled',
        'Cancelled after handler (result discarded)',
        { phase: 'post_handler' }
      );
      await publishJobEvent({
        jobId: job.id,
        status: 'cancelled',
        timestamp: new Date().toISOString(),
      });
      logger.info({ event: 'job.cancelled', jobId: job.id, phase: 'post_handler' });
      return;
    }

    await updateJobWithLog(
      job.id,
      { status: 'completed', completedAt: new Date(), error: null },
      'job.completed',
      `Job ${job.type} completed`
    );
    await publishJobEvent({
      jobId: job.id,
      status: 'completed',
      type: job.type,
      timestamp: new Date().toISOString(),
    });
    logger.info({ event: 'job.completed', jobId: job.id, type: job.type });

    if (job.interval) {
      const scheduled = await scheduleRecurringRun(job);
      if (scheduled?.scheduledAt) {
        retryWheel.insert(
          { jobId: job.id, kind: 'recurring', interval: job.interval },
          scheduled.scheduledAt.getTime()
        );
        await publishJobEvent({
          jobId: job.id,
          status: 'pending',
          type: job.type,
          timestamp: new Date().toISOString(),
        });
        logger.info({
          event: 'job.recurring_scheduled',
          jobId: job.id,
          interval: job.interval,
          nextRunAt: scheduled.scheduledAt.toISOString(),
          algorithm: 'timing_wheel',
        });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const fresh = await getJobById(job.id);
    const retryCount = (fresh?.retryCount ?? job.retryCount) + 1;
    const maxRetries = fresh?.maxRetries ?? job.maxRetries;

    if (retryCount > maxRetries) {
      await updateJobWithLog(
        job.id,
        {
          status: 'failed',
          retryCount,
          error: message,
          inDlq: true,
          inReadyQueue: false,
          awaitingRetry: false,
        },
        'job.failed',
        message,
        { retryCount, inDlq: true }
      );
      await publishJobEvent({
        jobId: job.id,
        status: 'failed',
        retryCount,
        error: message,
        timestamp: new Date().toISOString(),
      });
      logger.error({ event: 'job.failed', jobId: job.id, retryCount, inDlq: true, error: message });
    } else {
      const scheduled = await scheduleJobForRetryDelay(job.id, retryCount, message);
      if (scheduled?.scheduledAt) {
        retryWheel.insert({ jobId: job.id, kind: 'retry' }, scheduled.scheduledAt.getTime());
      }
      await publishJobEvent({
        jobId: job.id,
        status: 'pending',
        retryCount,
        error: message,
        timestamp: new Date().toISOString(),
      });
      logger.warn({
        event: 'job.retry',
        jobId: job.id,
        retryCount,
        retryAt: scheduled?.scheduledAt?.toISOString(),
        algorithm: 'timing_wheel',
      });
    }
  } finally {
    await releaseJobLock(job.id);
  }
}

async function poll(): Promise<void> {
  if (isShuttingDown) {
    logger.info({ event: 'worker.skip_poll', reason: 'shutdown_in_progress' });
    return;
  }
  if (pollInProgress) return;

  pollInProgress = true;
  try {
    await processWheelDueEntries();

    if (isShuttingDown) return;

    const job = await claimNextReadyJob();
    if (job) {
      await publishJobEvent({
        jobId: job.id,
        status: 'processing',
        type: job.type,
        timestamp: new Date().toISOString(),
      });
      currentJobPromise = processJob(job);
      await currentJobPromise;
      currentJobPromise = null;
    }
  } catch (err) {
    logger.error({ event: 'worker.error', err: String(err) });
  } finally {
    pollInProgress = false;
  }
}

async function gracefulShutdown(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (currentJobPromise && Date.now() < deadline) {
    await currentJobPromise.catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function rebuildRetryWheelFromDatabase(): Promise<void> {
  const delayedJobs = await findAwaitingRetryJobs();
  const now = Date.now();

  for (const job of delayedJobs) {
    const fireAt = job.scheduledAt
      ? Math.max(job.scheduledAt.getTime(), now)
      : now;
    const kind = job.interval ? ('recurring' as const) : ('retry' as const);
    retryWheel.insert(
      {
        jobId: job.id,
        kind,
        interval: job.interval ?? undefined,
      },
      fireAt
    );
  }

  logger.info({ event: 'worker.wheel_rebuilt', count: delayedJobs.length });
}

async function main() {
  getDb();
  await rebuildRetryWheelFromDatabase();
  logger.info({ event: 'worker.started', pollMs: POLL_MS });
  pollInterval = setInterval(poll, POLL_MS);
  heartbeatInterval = setInterval(() => {
    logger.info({ event: 'worker.heartbeat', shuttingDown: isShuttingDown });
  }, 30_000);
}

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info({ event: 'worker.shutdown', reason: signal });

  if (pollInterval) clearInterval(pollInterval);
  if (heartbeatInterval) clearInterval(heartbeatInterval);

  await gracefulShutdown(30_000);
  await closeDb();
  await closeRedis();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main().catch((err) => {
  logger.error({ event: 'worker.fatal', err: String(err) });
  process.exit(1);
});
