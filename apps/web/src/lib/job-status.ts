import type { Job } from '../api';
import { formatInterval } from './form';

export interface JobStatusInfo {
  label: string;
  detail: string;
}

/** Human-readable pending sub-states the jobs table hides by default. */
export function describeJobStatus(job: Job): JobStatusInfo {
  if (job.status === 'pending' && job.awaitingRetry === true) {
    const when = job.scheduledAt ? new Date(job.scheduledAt).toLocaleString() : 'soon';
    const interval = job.interval ? formatInterval(job.interval) : null;
    return {
      label: 'pending',
      detail: interval
        ? `Awaiting next run (${interval}) — fires ~${when}`
        : `Awaiting retry — fires ~${when}`,
    };
  }

  if (job.status === 'pending' && job.inReadyQueue === true) {
    return {
      label: 'pending',
      detail: 'In ready queue — waiting for worker to claim',
    };
  }

  if (job.status === 'pending') {
    const when = job.scheduledAt ? new Date(job.scheduledAt).toLocaleString() : 'now';
    return {
      label: 'pending',
      detail: `Waiting to be promoted (scheduled ~${when})`,
    };
  }

  if (job.status === 'completed' && job.completedAt) {
    return {
      label: job.status,
      detail: `Completed ${new Date(job.completedAt).toLocaleString()}`,
    };
  }

  return { label: job.status, detail: '' };
}
