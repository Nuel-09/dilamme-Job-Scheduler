import { useCallback, useEffect, useState } from 'react';
import { fetchDlqJobs, retryDlqJob, type Job } from '../api';
import { useJobEvents } from '../hooks/useJobEvents';
import StatusBadge from '../components/StatusBadge';

export default function DlqPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setJobs(await fetchDlqJobs());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useJobEvents(() => { load(); });

  const handleRetry = async (id: string) => {
    setRetrying(id);
    try {
      await retryDlqJob(id);
      await load();
    } finally {
      setRetrying(null);
    }
  };

  return (
    <div>
      <header className="page-header">
        <h2>Dead Letter Queue</h2>
        <p>Jobs that exhausted retries (≥3). Manual retry sends them back to pending.</p>
      </header>

      {loading ? (
        <p className="muted">Loading DLQ...</p>
      ) : jobs.length === 0 ? (
        <p className="muted">No jobs in DLQ</p>
      ) : (
        <div className="dlq-list">
          {jobs.map((job) => (
            <div key={job.id} className="dlq-card">
              <div className="dlq-header">
                <strong>{job.type}</strong>
                <StatusBadge status="failed" />
                <span className="muted">retries: {job.retryCount}</span>
              </div>
              <code className="job-id">{job.id}</code>
              <div className="error-box">
                <strong>Error:</strong> {job.error ?? 'Unknown error'}
              </div>
              <pre className="payload-preview">{JSON.stringify(job.payload, null, 2)}</pre>
              <button
                onClick={() => handleRetry(job.id)}
                disabled={retrying === job.id}
              >
                {retrying === job.id ? 'Retrying…' : 'Manual Retry'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
