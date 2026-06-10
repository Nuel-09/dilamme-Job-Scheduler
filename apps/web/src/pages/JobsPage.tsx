import { useCallback, useEffect, useState } from 'react';
import { cancelJob, fetchJobs, type Job } from '../api';
import { useJobEvents } from '../hooks/useJobEvents';
import JobsTable from '../components/JobsTable';

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setJobs(await fetchJobs(filter || undefined));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  useJobEvents(() => { load(); });

  const handleCancel = async (id: string) => {
    await cancelJob(id);
    await load();
  };

  return (
    <div>
      <header className="page-header">
        <h2>Jobs</h2>
        <div className="filters">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </header>
      {loading ? <p className="muted">Loading jobs...</p> : (
        <JobsTable jobs={jobs} onCancel={handleCancel} />
      )}
    </div>
  );
}
