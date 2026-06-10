import {
  pgTable,
  uuid,
  varchar,
  integer,
  jsonb,
  timestamp,
  boolean,
  text,
  pgEnum,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';

export const jobStatusEnum = pgEnum('job_status', [
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
]);

export const jobIntervalEnum = pgEnum('job_interval', [
  'every_1_minute',
  'every_5_minutes',
  'every_1_hour',
]);

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: varchar('type', { length: 100 }).notNull(),
    payload: jsonb('payload').notNull().default({}),
    priority: integer('priority').notNull().default(2),
    status: jobStatusEnum('status').notNull().default('pending'),
    retryCount: integer('retry_count').notNull().default(0),
    maxRetries: integer('max_retries').notNull().default(3),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    interval: jobIntervalEnum('interval'),
    error: text('error'),
    inDlq: boolean('in_dlq').notNull().default(false),
    effectivePriority: integer('effective_priority').notNull().default(2),
    cancelRequested: boolean('cancel_requested').notNull().default(false),
    inReadyQueue: boolean('in_ready_queue').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('jobs_status_idx').on(table.status),
    index('jobs_scheduled_at_idx').on(table.scheduledAt),
    index('jobs_in_dlq_idx').on(table.inDlq),
    index('jobs_in_ready_queue_idx').on(table.inReadyQueue),
  ]
);

export const jobDependencies = pgTable(
  'job_dependencies',
  {
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    dependsOnJobId: uuid('depends_on_job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.jobId, table.dependsOnJobId] })]
);

export const jobLogs = pgTable(
  'job_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    event: varchar('event', { length: 100 }).notNull(),
    message: text('message'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('job_logs_job_id_idx').on(table.jobId)]
);

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type JobLog = typeof jobLogs.$inferSelect;
