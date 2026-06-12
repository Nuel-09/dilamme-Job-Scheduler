import type { Job } from '../api';
import { btnSecondary, formatInterval, PRIORITY_LABELS } from '../lib/form';
import { describeJobStatus } from '../lib/job-status';
import StatusBadge from './StatusBadge';

interface Props {
  jobs: Job[];
  onCancel?: (id: string) => void;
  cancellingId?: string | null;
}

export default function JobsTable({ jobs, onCancel, cancellingId }: Props) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface/50 px-6 py-12 text-center text-muted">
        No jobs found
      </div>
    );
  }

  return (
    <>
      {/* Mobile cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {jobs.map((job) => {
          const statusInfo = describeJobStatus(job);
          return (
          <article
            key={job.id}
            className="rounded-xl border border-border bg-surface p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{job.type}</span>
              <StatusBadge status={job.status} />
            </div>
            {statusInfo.detail && (
              <p className="mt-1 text-xs text-muted">{statusInfo.detail}</p>
            )}
            <code className="mt-2 block font-mono text-xs text-muted">{job.id.slice(0, 12)}…</code>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted">Priority</dt>
                <dd>
                  {job.priority} ({PRIORITY_LABELS[job.priority] ?? '?'})
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Retries</dt>
                <dd>
                  {job.retryCount}/{job.maxRetries}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-muted">Scheduled</dt>
                <dd>{job.scheduledAt ? new Date(job.scheduledAt).toLocaleString() : '—'}</dd>
              </div>
              {job.interval && (
                <div className="col-span-2">
                  <dt className="text-xs text-muted">Interval</dt>
                  <dd>{formatInterval(job.interval)}</dd>
                </div>
              )}
            </dl>
            {onCancel && (job.status === 'pending' || job.status === 'processing') && (
              <button
                type="button"
                className={`mt-4 ${btnSecondary}`}
                disabled={cancellingId === job.id}
                onClick={() => onCancel(job.id)}
              >
                {cancellingId === job.id ? 'Cancelling…' : 'Cancel'}
              </button>
            )}
          </article>
        );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2/80 text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-semibold">ID</th>
              <th className="px-4 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold">Priority</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Retries</th>
              <th className="px-4 py-3 font-semibold">Scheduled</th>
              <th className="px-4 py-3 font-semibold">Interval</th>
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {jobs.map((job) => {
              const statusInfo = describeJobStatus(job);
              return (
              <tr key={job.id} className="transition-colors hover:bg-surface-2/40">
                <td className="px-4 py-3">
                  <code className="font-mono text-xs text-muted">{job.id.slice(0, 8)}…</code>
                </td>
                <td className="px-4 py-3 font-medium">{job.type}</td>
                <td className="px-4 py-3">
                  {job.priority} ({PRIORITY_LABELS[job.priority] ?? '?'})
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={job.status} />
                  {statusInfo.detail && (
                    <p className="mt-1 max-w-[14rem] text-xs text-muted">{statusInfo.detail}</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  {job.retryCount}/{job.maxRetries}
                </td>
                <td className="px-4 py-3 text-muted">
                  {job.scheduledAt ? new Date(job.scheduledAt).toLocaleString() : '—'}
                </td>
                <td className="px-4 py-3 text-muted">{formatInterval(job.interval)}</td>
                <td className="px-4 py-3 text-muted">
                  {new Date(job.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  {onCancel && (job.status === 'pending' || job.status === 'processing') && (
                    <button
                      type="button"
                      className={`${btnSecondary} !px-3 !py-1.5 text-xs`}
                      disabled={cancellingId === job.id}
                      onClick={() => onCancel(job.id)}
                    >
                      {cancellingId === job.id ? '…' : 'Cancel'}
                    </button>
                  )}
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
