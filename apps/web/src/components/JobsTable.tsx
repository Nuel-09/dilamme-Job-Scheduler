import type { Job } from '../api';
import StatusBadge from './StatusBadge';

interface Props {
  jobs: Job[];
  onCancel?: (id: string) => void;
}

const PRIORITY_LABELS: Record<number, string> = { 1: 'High', 2: 'Medium', 3: 'Low' };

export default function JobsTable({ jobs, onCancel }: Props) {
  if (jobs.length === 0) return <p className="muted">No jobs found</p>;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Type</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Retries</th>
            <th>Scheduled</th>
            <th>Interval</th>
            <th>Created</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id}>
              <td><code>{job.id.slice(0, 8)}…</code></td>
              <td>{job.type}</td>
              <td>{job.priority} ({PRIORITY_LABELS[job.priority] ?? '?'})</td>
              <td><StatusBadge status={job.status} /></td>
              <td>{job.retryCount}/{job.maxRetries}</td>
              <td>{job.scheduledAt ? new Date(job.scheduledAt).toLocaleString() : '—'}</td>
              <td>{job.interval ?? '—'}</td>
              <td>{new Date(job.createdAt).toLocaleString()}</td>
              <td>
                {onCancel && (job.status === 'pending' || job.status === 'processing') && (
                  <button className="btn-sm" onClick={() => onCancel(job.id)}>Cancel</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
