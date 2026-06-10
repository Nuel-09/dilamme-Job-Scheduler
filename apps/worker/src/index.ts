import 'dotenv/config';
import pino from 'pino';
import { getNextRetryAt } from '@scheduler/core';
import {
  claimNextReadyJob,
  updateJob,
  createJobLog,
  publishJobEvent,
  acquireJobLock,
  releaseJobLock,
  scheduleRecurringRun,
  getJobById,
  closeDb,
  closeRedis,
  getDb,
} from '@scheduler/db';
import { getHandler, type Logger as HandlerLogger } from '@scheduler/handlers';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 500);

const handlerLogger: HandlerLogger = {
  info: (obj) => logger.info(obj),
  warn: (obj) => logger.warn(obj),
  error: (obj) => logger.error(obj),
};

async function processJob(job: NonNullable<Awaited<ReturnType<typeof claimNextReadyJob>>>) {
  const locked = await acquireJobLock(job.id);
  if (!locked) {
    logger.warn({ event: 'job.lock_failed', jobId: job.id });
    await updateJob(job.id, { status: 'pending', inReadyQueue: true });
    return;
  }

  try {
    const fresh = await getJobById(job.id);
    if (!fresh || fresh.cancelRequested) {
      await updateJob(job.id, {
        status: 'cancelled',
        cancelRequested: false,
        inReadyQueue: false,
      });
      await createJobLog(job.id, 'job.cancelled', 'Cancelled before handler execution');
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
      await updateJob(job.id, {
        status: 'cancelled',
        cancelRequested: false,
        inReadyQueue: false,
        completedAt: new Date(),
      });
      await createJobLog(job.id, 'job.cancelled', 'Cancelled after handler (result discarded)');
      await publishJobEvent({
        jobId: job.id,
        status: 'cancelled',
        timestamp: new Date().toISOString(),
      });
      logger.info({ event: 'job.cancelled', jobId: job.id, phase: 'post_handler' });
      return;
    }

    await updateJob(job.id, {
      status: 'completed',
      completedAt: new Date(),
      error: null,
    });
    await createJobLog(job.id, 'job.completed', `Job ${job.type} completed`);
    await publishJobEvent({
      jobId: job.id,
      status: 'completed',
      type: job.type,
      timestamp: new Date().toISOString(),
    });
    logger.info({ event: 'job.completed', jobId: job.id, type: job.type });

    if (job.interval) {
      await scheduleRecurringRun(job);
      logger.info({ event: 'job.recurring_scheduled', jobId: job.id, interval: job.interval });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const fresh = await getJobById(job.id);
    const retryCount = (fresh?.retryCount ?? job.retryCount) + 1;
    const maxRetries = fresh?.maxRetries ?? job.maxRetries;

    if (retryCount > maxRetries) {
      await updateJob(job.id, {
        status: 'failed',
        retryCount,
        error: message,
        inDlq: true,
        inReadyQueue: false,
      });
      await createJobLog(job.id, 'job.failed', message, { retryCount, inDlq: true });
      await publishJobEvent({
        jobId: job.id,
        status: 'failed',
        retryCount,
        error: message,
        timestamp: new Date().toISOString(),
      });
      logger.error({ event: 'job.failed', jobId: job.id, retryCount, inDlq: true, error: message });
    } else {
      const nextRun = getNextRetryAt(retryCount - 1);
      await updateJob(job.id, {
        status: 'pending',
        retryCount,
        error: message,
        scheduledAt: nextRun,
        inReadyQueue: false,
      });
      await createJobLog(job.id, 'job.retry', message, { retryCount, nextRun: nextRun.toISOString() });
      await publishJobEvent({
        jobId: job.id,
        status: 'pending',
        retryCount,
        error: message,
        timestamp: new Date().toISOString(),
      });
      logger.warn({ event: 'job.retry', jobId: job.id, retryCount, nextRun: nextRun.toISOString() });
    }
  } finally {
    await releaseJobLock(job.id);
  }
}

async function poll(): Promise<void> {
  try {
    const job = await claimNextReadyJob();
    if (job) {
      await processJob(job);
    }
  } catch (err) {
    logger.error({ event: 'worker.error', err: String(err) });
  }
}

async function main() {
  getDb();
  logger.info({ event: 'worker.started', pollMs: POLL_MS });
  setInterval(poll, POLL_MS);
}

const shutdown = async () => {
  await closeDb();
  await closeRedis();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
  logger.error({ event: 'worker.fatal', err: String(err) });
  process.exit(1);
});
