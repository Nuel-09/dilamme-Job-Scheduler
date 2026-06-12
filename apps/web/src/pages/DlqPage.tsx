import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import { useJobEvents } from '../context/JobEventsContext';
import { fetchDlqJobs, fetchJobById, retryDlqJob, type Job, type JobLog } from '../api';
import { btnPrimary } from '../lib/form';

function JobLogTrail({ jobId }: { jobId: string }) {
  const [logs, setLogs] = useState<JobLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const loadLogs = useCallback(async () => {
    try {
      const detail = await fetchJobById(jobId);
      setLogs(detail.logs ?? []);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (expanded) loadLogs();
  }, [expanded, loadLogs]);

  return (
    <div className="mt-1">
      <button
        type="button"
        className="text-sm text-accent hover:underline"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? 'Hide log history' : 'Show log history'}
      </button>
      {expanded &&
        (loading ? (
          <p className="mt-2 text-sm text-muted">Loading logs…</p>
        ) : logs.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No log entries</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {logs.map((log) => (
              <li
                key={log.id}
                className="grid grid-cols-1 gap-0.5 rounded-lg bg-bg px-3 py-2 sm:grid-cols-[1fr_auto]"
              >
                <span className="font-mono text-xs text-accent">{log.event}</span>
                <span className="text-xs text-muted sm:text-right">
                  {new Date(log.createdAt).toLocaleString()}
                </span>
                {log.message && <span className="col-span-full text-muted">{log.message}</span>}
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

export default function DlqPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setJobs(await fetchDlqJobs());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load DLQ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useJobEvents(() => {
    load();
  });

  const handleRetry = async (id: string) => {
    setRetrying(id);
    setError('');
    try {
      await retryDlqJob(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry job');
    } finally {
      setRetrying(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Dead Letter Queue"
        description="Jobs that exhausted retries (≥3). Manual retry sends them back to pending."
      />

      {error && (
        <p className="mb-4 rounded-lg border border-failed/30 bg-failed/10 px-4 py-3 text-sm text-failed">
          {error}
        </p>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-surface-2" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface/50 px-6 py-12 text-center text-muted">
          No jobs in DLQ — that's a good thing.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {jobs.map((job) => (
            <article
              key={job.id}
              className="flex flex-col gap-3 rounded-xl border border-border border-l-4 border-l-dlq bg-surface p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-center gap-3">
                <strong className="text-lg">{job.type}</strong>
                <StatusBadge status="failed" />
                <span className="text-sm text-muted">retries: {job.retryCount}</span>
              </div>
              <code className="break-all text-xs text-muted">{job.id}</code>
              <div className="rounded-lg border border-failed/30 bg-failed/10 px-3 py-2 text-sm">
                <strong>Error:</strong> {job.error ?? 'Unknown error'}
              </div>
              <pre className="overflow-x-auto rounded-lg bg-bg p-3 text-xs">
                {JSON.stringify(job.payload, null, 2)}
              </pre>
              <JobLogTrail jobId={job.id} />
              <button
                type="button"
                className={`w-full sm:w-fit ${btnPrimary}`}
                onClick={() => handleRetry(job.id)}
                disabled={retrying === job.id}
              >
                {retrying === job.id ? 'Retrying…' : 'Manual Retry'}
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
