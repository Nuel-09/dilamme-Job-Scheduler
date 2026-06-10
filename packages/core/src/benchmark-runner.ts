import { JobHeap } from './min-heap.js';
import { TimingWheel } from './timing-wheel.js';
import type { BenchmarkReport, BenchmarkResult, ReadyJob } from './types.js';

function createMockJobs(count: number, baseTime: number): ReadyJob[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `job-${i}`,
    type: 'send_email',
    payload: { to: `user${i}@test.com` },
    priority: ((i % 3) + 1) as 1 | 2 | 3,
    effectivePriority: ((i % 3) + 1),
    scheduledAt: new Date(baseTime + (i % 100) * 1000),
    createdAt: new Date(baseTime + i),
    retryCount: 0,
    maxRetries: 3,
  }));
}

function measure(name: string, algorithm: 'heap' | 'timing_wheel', jobCount: number, fn: () => void): BenchmarkResult {
  const start = Date.now();
  fn();
  const durationMs = Date.now() - start;
  return {
    algorithm,
    operation: name,
    jobCount,
    durationMs: Math.round(durationMs * 100) / 100,
    opsPerSecond: Math.round((jobCount / durationMs) * 1000),
  };
}

export function runBenchmarks(jobCount = 10_000): BenchmarkReport {
  const baseTime = Date.now();
  const jobs = createMockJobs(jobCount, baseTime);
  const results: BenchmarkResult[] = [];

  results.push(
    measure('insert', 'heap', jobCount, () => {
      const heap = new JobHeap();
      for (const job of jobs) heap.insertJob(job);
    })
  );

  results.push(
    measure('extract_all', 'heap', jobCount, () => {
      const heap = new JobHeap();
      for (const job of jobs) heap.insertJob(job);
      while (heap.popJob()) {
        /* drain */
      }
    })
  );

  results.push(
    measure('insert', 'timing_wheel', jobCount, () => {
      const wheel = new TimingWheel<ReadyJob>();
      for (const job of jobs) {
        wheel.insert(job, job.scheduledAt.getTime());
      }
    })
  );

  results.push(
    measure('extract_due', 'timing_wheel', jobCount, () => {
      const wheel = new TimingWheel<ReadyJob>(1000, 60, baseTime - 1000);
      for (const job of jobs) {
        wheel.insert(job, job.scheduledAt.getTime());
      }
      wheel.tick(baseTime + 120_000);
    })
  );

  results.push(
    measure('mixed_schedule_priority', 'heap', jobCount, () => {
      const heap = new JobHeap();
      for (let i = 0; i < jobCount; i++) {
        const job = jobs[i % jobs.length];
        heap.insertJob({ ...job, id: `mixed-${i}`, effectivePriority: (i % 3) + 1 });
        if (i % 100 === 0) heap.popJob();
      }
    })
  );

  results.push(
    measure('mixed_schedule_priority', 'timing_wheel', jobCount, () => {
      const wheel = new TimingWheel<ReadyJob>(1000, 60, baseTime);
      for (let i = 0; i < jobCount; i++) {
        const job = jobs[i % jobs.length];
        wheel.insert({ ...job, id: `mixed-${i}` }, baseTime + (i % 60) * 1000);
        if (i % 1000 === 0) wheel.tick(baseTime + i);
      }
    })
  );

  return {
    generatedAt: new Date().toISOString(),
    results,
  };
}

let cachedReport: BenchmarkReport | null = null;

export function getBenchmarkReport(): BenchmarkReport {
  if (!cachedReport) {
    cachedReport = runBenchmarks();
  }
  return cachedReport;
}

export function refreshBenchmarkReport(): BenchmarkReport {
  cachedReport = runBenchmarks();
  return cachedReport;
}
