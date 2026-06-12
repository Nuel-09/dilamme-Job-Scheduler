import { IndexedJobHeap, JobHeap } from './min-heap.js';
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

function measure(
  operation: BenchmarkResult['operation'],
  algorithm: 'heap' | 'timing_wheel',
  jobCount: number,
  fn: () => void
): BenchmarkResult {
  const start = Date.now();
  fn();
  const durationMs = Date.now() - start;
  return {
    algorithm,
    operation,
    jobCount,
    durationMs: Math.round(durationMs * 100) / 100,
    opsPerSecond: durationMs > 0 ? Math.round((jobCount / durationMs) * 1000) : 0,
  };
}

/**
 * Three isolated scenarios (CHANGE-008):
 * 1. bulk_insertion — insert 10k jobs with random future times
 * 2. bulk_extraction — extract all due jobs
 * 3. mixed_workload — 50% insert + 50% extract interleaved
 */
export function runBenchmarks(jobCount = 10_000): BenchmarkReport {
  const baseTime = Date.now();
  const jobs = createMockJobs(jobCount, baseTime);
  const results: BenchmarkResult[] = [];

  results.push(
    measure('bulk_insertion', 'heap', jobCount, () => {
      const heap = new JobHeap();
      for (const job of jobs) heap.insertJob(job);
    })
  );

  results.push(
    measure('bulk_insertion', 'timing_wheel', jobCount, () => {
      const wheel = new TimingWheel<ReadyJob>();
      for (const job of jobs) {
        wheel.insert(job, job.scheduledAt.getTime());
      }
    })
  );

  results.push(
    measure('bulk_extraction', 'heap', jobCount, () => {
      const heap = new JobHeap();
      for (const job of jobs) heap.insertJob(job);
      while (heap.popJob()) {
        /* drain */
      }
    })
  );

  results.push(
    measure('bulk_extraction', 'timing_wheel', jobCount, () => {
      const wheel = new TimingWheel<ReadyJob>(1000, 60, baseTime - 1000);
      for (const job of jobs) {
        wheel.insert(job, job.scheduledAt.getTime());
      }
      wheel.tick(baseTime + 120_000);
    })
  );

  const mixedOps = jobCount;
  results.push(
    measure('mixed_workload', 'heap', mixedOps, () => {
      const heap = new JobHeap();
      for (let i = 0; i < mixedOps; i++) {
        if (i % 2 === 0) {
          const job = jobs[i % jobs.length];
          heap.insertJob({ ...job, id: `mixed-${i}` });
        } else {
          heap.popJob();
        }
      }
    })
  );

  results.push(
    measure('mixed_workload', 'timing_wheel', mixedOps, () => {
      const wheel = new TimingWheel<ReadyJob>(1000, 60, baseTime);
      for (let i = 0; i < mixedOps; i++) {
        if (i % 2 === 0) {
          const job = jobs[i % jobs.length];
          wheel.insert({ ...job, id: `mixed-${i}` }, baseTime + (i % 60) * 1000);
        } else {
          wheel.tick(baseTime + i);
        }
      }
    })
  );

  const updateOps = Math.min(jobCount, 1000);
  results.push(
    measure('update_priority_indexed', 'heap', updateOps, () => {
      const heap = new IndexedJobHeap();
      for (const job of jobs.slice(0, updateOps)) heap.insertJob(job);
      for (let i = 0; i < updateOps; i++) {
        const job = jobs[i % updateOps];
        heap.updatePriority(job.id, ((i % 3) + 1) as 1 | 2 | 3);
      }
    })
  );

  results.push(
    measure('update_priority_linear', 'heap', updateOps, () => {
      const heap = new JobHeap();
      for (const job of jobs.slice(0, updateOps)) heap.insertJob(job);
      for (let i = 0; i < updateOps; i++) {
        const job = jobs[i % updateOps];
        const removed = heap.remove((item) => item.id === job.id);
        if (removed) {
          heap.insertJob({ ...removed, effectivePriority: ((i % 3) + 1) as 1 | 2 | 3 });
        }
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
