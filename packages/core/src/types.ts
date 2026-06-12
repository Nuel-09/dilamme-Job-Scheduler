// this file contains the types for the job scheduler
export type JobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type JobPriority = 1 | 2 | 3;

export type JobInterval = 'every_1_minute' | 'every_5_minutes' | 'every_1_hour';

export const PRIORITY_LABELS: Record<JobPriority, string> = {
  1: 'High',
  2: 'Medium',
  3: 'Low',
};

export const INTERVAL_MS: Record<JobInterval, number> = {
  every_1_minute: 60_000,
  every_5_minutes: 300_000,
  every_1_hour: 3_600_000,
};

export interface ReadyJob {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  priority: JobPriority;
  effectivePriority: number;
  scheduledAt: Date;
  createdAt: Date;
  retryCount: number;
  maxRetries: number;
}

export interface JobEvent {
  jobId: string;
  status: JobStatus;
  type?: string;
  retryCount?: number;
  error?: string | null;
  timestamp: string;
}

export const REDIS_CHANNELS = {
  JOB_EVENTS: 'job:events',
} as const;

export const DLQ_ALERT_THRESHOLD = Number(process.env.DLQ_THRESHOLD ?? 10);

export const AGING_INTERVAL_MS = 30_000;

export interface BenchmarkResult {
  algorithm: 'heap' | 'timing_wheel';
  operation: string;
  jobCount: number;
  durationMs: number;
  opsPerSecond: number;
}

export interface BenchmarkReport {
  generatedAt: string;
  results: BenchmarkResult[];
}
