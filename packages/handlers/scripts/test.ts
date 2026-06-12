import { createHandlerLogger } from '../src/logger.js';
import { getHandler } from '../src/registry.js';
import { resetSendEmailIdempotencyCache } from '../src/send-email.js';

const RUNS = 20;
const TYPE = 'send_email';

interface LogEntry {
  level: string;
  timestamp: string;
  event?: string;
  jobId?: string;
  type?: string;
  error?: string;
}

async function dispatch(
  type: string,
  jobId: string,
  payload: Record<string, unknown>,
  logger: ReturnType<typeof createHandlerLogger>,
): Promise<'completed' | 'failed'> {
  const handler = getHandler(type);
  if (!handler) {
    throw new Error(`No handler registered for type: ${type}`);
  }

  logger.info({ event: 'job.started', jobId, type, timestamp: new Date().toISOString() });

  try {
    await handler({ jobId, payload, logger });
    logger.info({ event: 'job.completed', jobId, type, timestamp: new Date().toISOString() });
    return 'completed';
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ event: 'job.failed', jobId, type, error, timestamp: new Date().toISOString() });
    return 'failed';
  }
}

async function main(): Promise<void> {
  resetSendEmailIdempotencyCache();
  const logger = createHandlerLogger();
  const captured: LogEntry[] = [];

  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array, ...args: unknown[]) => {
    const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        captured.push(JSON.parse(line) as LogEntry);
      } catch {
        // ignore non-JSON lines
      }
    }
    return originalStdoutWrite(chunk as string, ...(args as []));
  }) as typeof process.stdout.write;

  let completed = 0;
  let failed = 0;

  for (let i = 0; i < RUNS; i++) {
    const jobId = `test-job-${i + 1}`;
    const outcome = await dispatch(TYPE, jobId, {
      to: `user${i}@example.com`,
      subject: `Test message ${i + 1}`,
    }, logger);
    if (outcome === 'completed') completed++;
    else failed++;
  }

  process.stdout.write = originalStdoutWrite;

  const started = captured.filter((e) => e.event === 'job.started').length;
  const completedEvents = captured.filter((e) => e.event === 'job.completed').length;
  const failedEvents = captured.filter((e) => e.event === 'job.failed').length;

  const summary = {
    event: 'handler.test.summary',
    runs: RUNS,
    completed,
    failed,
    logCounts: { started, completed: completedEvents, failed: failedEvents },
    timestamp: new Date().toISOString(),
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);

  const missingFields = captured.filter(
    (e) => e.event?.startsWith('job.') && (!e.event || !e.jobId || !e.timestamp),
  );
  if (missingFields.length > 0) {
    process.stderr.write('FAIL: Some job logs missing event, jobId, or timestamp\n');
    process.exit(1);
  }

  if (started !== RUNS) {
    process.stderr.write(`FAIL: Expected ${RUNS} job.started events, got ${started}\n`);
    process.exit(1);
  }

  if (completed + failed !== RUNS) {
    process.stderr.write(`FAIL: completed + failed must equal ${RUNS}\n`);
    process.exit(1);
  }

  // ~10% failure rate — allow wide statistical range for 20 runs
  if (completed < 14 || completed > 20) {
    process.stderr.write(
      `FAIL: Expected roughly 18 successes (~10% failure rate), got ${completed}/${RUNS}\n`,
    );
    process.exit(1);
  }

  process.stdout.write(`PASS: ${completed} succeeded, ${failed} failed (${RUNS} total)\n`);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
