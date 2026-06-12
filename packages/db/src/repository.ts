import { eq, and, sql, desc, inArray, lte, or, isNull, asc } from 'drizzle-orm';
import { computeEffectivePriority, getNextRetryAt, INTERVAL_MS } from '@scheduler/core';
import type { JobInterval, JobPriority, JobStatus } from '@scheduler/core';
import { getDb } from './client.js';
import { jobDependencies, jobLogs, jobs, type Job, type NewJob } from './schema.js';

export interface CreateJobInput {
  type: string;
  payload: Record<string, unknown>;
  priority?: JobPriority;
  scheduledAt?: Date | null;
  interval?: JobInterval | null;
  dependsOn?: string[];
  maxRetries?: number;
}

type JobUpdateData = Partial<
  Pick<
    Job,
    | 'status'
    | 'retryCount'
    | 'error'
    | 'inDlq'
    | 'scheduledAt'
    | 'inReadyQueue'
    | 'cancelRequested'
    | 'completedAt'
    | 'effectivePriority'
    | 'awaitingRetry'
    | 'lastPromotedAt'
    | 'startedAt'
  >
>;

export async function updateJobWithLog(
  id: string,
  data: JobUpdateData,
  logEvent: string,
  logMessage?: string,
  logMetadata: Record<string, unknown> = {}
): Promise<Job | null> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(jobs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(jobs.id, id))
      .returning();

    if (!updated) return null;

    await tx.insert(jobLogs).values({
      jobId: id,
      event: logEvent,
      message: logMessage,
      metadata: logMetadata,
    });

    return updated;
  });
}

export async function createJobLog(
  jobId: string,
  event: string,
  message?: string,
  metadata: Record<string, unknown> = {}
) {
  const db = getDb();
  await db.insert(jobLogs).values({ jobId, event, message, metadata });
}

export async function createJob(input: CreateJobInput): Promise<Job> {
  const db = getDb();
  const priority = input.priority ?? 2;
  const now = new Date();
  const effectivePriority = computeEffectivePriority({ priority, createdAt: now, now });

  return db.transaction(async (tx) => {
    const [job] = await tx
      .insert(jobs)
      .values({
        type: input.type,
        payload: input.payload,
        priority,
        effectivePriority,
        scheduledAt: input.scheduledAt ?? now,
        interval: input.interval ?? null,
        maxRetries: input.maxRetries ?? 3,
        status: 'pending',
      })
      .returning();

    if (input.dependsOn?.length) {
      await validateDependencies(job.id, input.dependsOn);
      await tx.insert(jobDependencies).values(
        input.dependsOn.map((dependsOnJobId) => ({
          jobId: job.id,
          dependsOnJobId,
        }))
      );
    }

    await tx.insert(jobLogs).values({
      jobId: job.id,
      event: 'job.created',
      message: `Job ${job.type} created`,
      metadata: { priority: job.priority, scheduledAt: job.scheduledAt },
    });

    return job;
  });
}

async function validateDependencies(jobId: string, dependsOn: string[]): Promise<void> {
  const db = getDb();
  if (dependsOn.includes(jobId)) {
    throw new Error('Job cannot depend on itself');
  }

  for (const depId of dependsOn) {
    const [dep] = await db.select().from(jobs).where(eq(jobs.id, depId)).limit(1);
    if (!dep) throw new Error(`Dependency job ${depId} not found`);

    const wouldCycle = await detectCycle(jobId, depId);
    if (wouldCycle) throw new Error('Circular dependency detected');
  }
}

async function detectCycle(newJobId: string, startDepId: string): Promise<boolean> {
  const db = getDb();
  const visited = new Set<string>();
  const stack = [startDepId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === newJobId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const deps = await db
      .select({ dependsOnJobId: jobDependencies.dependsOnJobId })
      .from(jobDependencies)
      .where(eq(jobDependencies.jobId, current));

    for (const dep of deps) {
      stack.push(dep.dependsOnJobId);
    }
  }

  return false;
}

export async function getJobById(id: string): Promise<Job | undefined> {
  const db = getDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  return job;
}

export async function listJobs(filters?: { status?: JobStatus; limit?: number }): Promise<Job[]> {
  const db = getDb();
  const limit = filters?.limit ?? 100;
  if (filters?.status) {
    return db
      .select()
      .from(jobs)
      .where(eq(jobs.status, filters.status))
      .orderBy(desc(jobs.createdAt))
      .limit(limit);
  }
  return db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(limit);
}

export async function getJobDependencies(jobId: string): Promise<string[]> {
  const db = getDb();
  const deps = await db
    .select({ dependsOnJobId: jobDependencies.dependsOnJobId })
    .from(jobDependencies)
    .where(eq(jobDependencies.jobId, jobId));
  return deps.map((d) => d.dependsOnJobId);
}

export async function areDependenciesCompleted(jobId: string): Promise<boolean> {
  const depIds = await getJobDependencies(jobId);
  if (depIds.length === 0) return true;

  const db = getDb();
  const depJobs = await db.select().from(jobs).where(inArray(jobs.id, depIds));
  return depJobs.every((j) => j.status === 'completed');
}

export async function cancelJob(id: string): Promise<Job | null> {
  const job = await getJobById(id);
  if (!job) return null;
  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
    throw new Error(`Cannot cancel job in status ${job.status}`);
  }

  if (job.status === 'processing') {
    return updateJobWithLog(
      id,
      { cancelRequested: true },
      'job.cancelled',
      'Cancel requested while processing'
    );
  }

  return updateJobWithLog(
    id,
    { status: 'cancelled', inReadyQueue: false },
    'job.cancelled',
    'Job cancelled before processing'
  );
}

export async function getDashboardStats() {
  const db = getDb();
  const rows = await db
    .select({ status: jobs.status, count: sql<number>`count(*)::int` })
    .from(jobs)
    .groupBy(jobs.status);

  const stats: Record<string, number> = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    dlq: 0,
  };

  for (const row of rows) {
    stats[row.status] = row.count;
  }

  const [dlqRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(jobs)
    .where(eq(jobs.inDlq, true));
  stats.dlq = dlqRow?.count ?? 0;

  return stats;
}

export async function listDlqJobs(): Promise<Job[]> {
  const db = getDb();
  return db.select().from(jobs).where(eq(jobs.inDlq, true)).orderBy(desc(jobs.updatedAt));
}

export async function retryDlqJob(id: string): Promise<Job | null> {
  const job = await getJobById(id);
  if (!job?.inDlq) return null;

  return updateJobWithLog(
    id,
    {
      status: 'pending',
      retryCount: 0,
      error: null,
      inDlq: false,
      inReadyQueue: false,
      cancelRequested: false,
      awaitingRetry: false,
    },
    'job.retry',
    'Manual DLQ retry triggered',
    { source: 'dlq_manual' }
  );
}

export async function getDlqCount(): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(jobs)
    .where(eq(jobs.inDlq, true));
  return row?.count ?? 0;
}

export async function findDuePendingJobs(limit = 50): Promise<Job[]> {
  const db = getDb();
  const now = new Date();
  return db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.status, 'pending'),
        eq(jobs.inReadyQueue, false),
        eq(jobs.inDlq, false),
        eq(jobs.cancelRequested, false),
        eq(jobs.awaitingRetry, false),
        or(isNull(jobs.scheduledAt), lte(jobs.scheduledAt, now))
      )
    )
    .orderBy(asc(jobs.effectivePriority), asc(jobs.scheduledAt), asc(jobs.createdAt))
    .limit(limit);
}

/** Rebuild in-memory heap from PostgreSQL on scheduler startup (CHANGE-004). */
export async function findReadyJobsForRebuild(limit = 500): Promise<Job[]> {
  const db = getDb();
  const now = new Date();
  return db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.status, 'pending'),
        eq(jobs.inReadyQueue, true),
        eq(jobs.inDlq, false),
        eq(jobs.cancelRequested, false),
        eq(jobs.awaitingRetry, false),
        or(isNull(jobs.scheduledAt), lte(jobs.scheduledAt, now))
      )
    )
    .orderBy(asc(jobs.effectivePriority), asc(jobs.scheduledAt), asc(jobs.createdAt))
    .limit(limit);
}

export async function markJobReady(id: string, effectivePriority: number): Promise<void> {
  const now = new Date();
  await updateJobWithLog(
    id,
    { inReadyQueue: true, effectivePriority, lastPromotedAt: now },
    'job.promoted',
    'Job promoted to ready queue',
    { effectivePriority }
  );
}

export async function releaseJobFromRetryDelay(id: string): Promise<Job | null> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(jobs)
      .set({
        awaitingRetry: false,
        scheduledAt: new Date(),
        status: 'pending',
        inReadyQueue: false,
        updatedAt: new Date(),
      })
      .where(and(eq(jobs.id, id), eq(jobs.awaitingRetry, true)))
      .returning();

    if (!updated) return null;

    await tx.insert(jobLogs).values({
      jobId: id,
      event: 'job.retry',
      message: 'Retry delay elapsed — job released to scheduler',
      metadata: { source: 'timing_wheel' },
    });

    return updated;
  });
}

export async function scheduleJobForRetryDelay(
  id: string,
  retryCount: number,
  error: string
): Promise<Job | null> {
  const retryAt = getNextRetryAt(retryCount - 1);
  return updateJobWithLog(
    id,
    {
      status: 'pending',
      retryCount,
      error,
      scheduledAt: retryAt,
      inReadyQueue: false,
      awaitingRetry: true,
    },
    'job.retry',
    error,
    { retryCount, retryAt: retryAt.toISOString(), source: 'timing_wheel_scheduled' }
  );
}

export interface AgingUpdate {
  id: string;
  effectivePriority: number;
  inReadyQueue: boolean;
}

export async function updateAgingForPendingJobs(): Promise<AgingUpdate[]> {
  const db = getDb();
  const pending = await db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.status, 'pending'),
        eq(jobs.awaitingRetry, false),
        eq(jobs.cancelRequested, false)
      )
    );

  const updates: AgingUpdate[] = [];
  const now = new Date();
  for (const job of pending) {
    const effectivePriority = computeEffectivePriority({
      priority: job.priority as JobPriority,
      createdAt: job.createdAt,
      now,
    });
    if (effectivePriority !== job.effectivePriority) {
      await db
        .update(jobs)
        .set({ effectivePriority, updatedAt: now })
        .where(eq(jobs.id, job.id));
      updates.push({
        id: job.id,
        effectivePriority,
        inReadyQueue: job.inReadyQueue,
      });
    }
  }
  return updates;
}

export async function releaseOverdueDelayedJobs(limit = 100): Promise<Job[]> {
  const db = getDb();
  const result = await db.execute<Job>(sql`
    UPDATE jobs
    SET awaiting_retry = false,
        updated_at = NOW()
    WHERE id IN (
      SELECT id FROM jobs
      WHERE awaiting_retry = true
        AND scheduled_at <= NOW()
        AND status = 'pending'
      ORDER BY scheduled_at ASC
      LIMIT ${limit}
    )
    AND awaiting_retry = true
    RETURNING *
  `);

  const rows = Array.isArray(result) ? result : (result as { rows?: Job[] }).rows ?? [];
  return rows;
}

export async function findAwaitingRetryJobs(): Promise<Job[]> {
  const db = getDb();
  return db
    .select()
    .from(jobs)
    .where(and(eq(jobs.awaitingRetry, true), eq(jobs.status, 'pending')));
}

export async function claimNextReadyJob(): Promise<Job | null> {
  const db = getDb();
  const result = await db.execute<Job>(sql`
    UPDATE jobs
    SET status = 'processing',
        started_at = NOW(),
        updated_at = NOW(),
        in_ready_queue = false
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = 'pending'
        AND in_ready_queue = true
        AND in_dlq = false
        AND cancel_requested = false
        AND awaiting_retry = false
      ORDER BY effective_priority ASC,
               scheduled_at ASC NULLS FIRST,
               created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *
  `);

  const rows = Array.isArray(result) ? result : (result as { rows?: Job[] }).rows ?? [];
  const job = rows[0] ?? null;

  if (job) {
    await createJobLog(job.id, 'job.started', `Worker claimed job ${job.type}`, {
      type: job.type,
    });
  }

  return job;
}

export async function updateJob(id: string, data: JobUpdateData): Promise<Job | null> {
  const db = getDb();
  const [updated] = await db
    .update(jobs)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(jobs.id, id))
    .returning();
  return updated ?? null;
}

export async function scheduleRecurringRun(job: Job): Promise<Job | null> {
  if (!job.interval) return null;

  const nextRunAt = new Date(Date.now() + INTERVAL_MS[job.interval]);

  return updateJobWithLog(
    job.id,
    {
      status: 'pending',
      retryCount: 0,
      error: null,
      scheduledAt: nextRunAt,
      inReadyQueue: false,
      startedAt: null,
      completedAt: null,
      awaitingRetry: true,
    },
    'job.recurring_scheduled',
    `Recurring interval ${job.interval} — waiting on timing wheel`,
    { interval: job.interval, nextRunAt: nextRunAt.toISOString() }
  );
}

export async function releaseRecurringJob(id: string, interval: JobInterval): Promise<Job | null> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(jobs)
      .set({
        status: 'pending',
        scheduledAt: new Date(),
        awaitingRetry: false,
        inReadyQueue: false,
        retryCount: 0,
        error: null,
        startedAt: null,
        completedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(jobs.id, id), eq(jobs.awaitingRetry, true)))
      .returning();

    if (!updated) return null;

    await tx.insert(jobLogs).values({
      jobId: id,
      event: 'job.recurring_scheduled',
      message: `Recurring interval ${interval} elapsed — job ready for next run`,
      metadata: { interval },
    });

    return updated;
  });
}

export async function listJobsForDependencyPicker(): Promise<
  Array<{ id: string; type: string; status: string }>
> {
  const db = getDb();
  return db
    .select({ id: jobs.id, type: jobs.type, status: jobs.status })
    .from(jobs)
    .orderBy(desc(jobs.createdAt))
    .limit(200);
}

export async function getJobLogs(jobId: string) {
  const db = getDb();
  return db
    .select()
    .from(jobLogs)
    .where(eq(jobLogs.jobId, jobId))
    .orderBy(desc(jobLogs.createdAt));
}

export async function hasJobLogEvent(jobId: string, event: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: jobLogs.id })
    .from(jobLogs)
    .where(and(eq(jobLogs.jobId, jobId), eq(jobLogs.event, event)))
    .limit(1);
  return Boolean(row);
}

export type { Job, NewJob };
