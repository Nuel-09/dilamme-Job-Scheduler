import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import JobsTable from '../components/JobsTable';
import { useJobEvents } from '../context/JobEventsContext';
import { cancelJob, fetchJobs, type Job } from '../api';
import { inputClass } from '../lib/form';

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setJobs(await fetchJobs(filter || undefined));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useJobEvents(() => {
    load();
  });

  const handleCancel = async (id: string) => {
    setCancellingId(id);
    setError('');
    try {
      await cancelJob(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel job');
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Jobs"
        description="All scheduled work — filter by status or cancel active jobs"
        actions={
          <label className="block w-full text-sm text-muted sm:w-48">
            Status
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className={inputClass}
            >
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
        }
      />

      {error && (
        <p className="mb-4 rounded-lg border border-failed/30 bg-failed/10 px-4 py-3 text-sm text-failed">
          {error}
        </p>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-2" />
          ))}
        </div>
      ) : (
        <JobsTable jobs={jobs} onCancel={handleCancel} cancellingId={cancellingId} />
      )}
    </div>
  );
}
