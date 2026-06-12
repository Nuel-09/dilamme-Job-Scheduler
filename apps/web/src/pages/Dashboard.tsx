import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import { useJobEvents } from '../context/JobEventsContext';
import { fetchStats, type DashboardStats } from '../api';

const EMPTY: DashboardStats = {
  pending: 0,
  processing: 0,
  completed: 0,
  failed: 0,
  cancelled: 0,
  dlq: 0,
};

const CARDS = [
  { key: 'pending' as const, label: 'Pending', borderClass: 'border-t-pending', glow: 'shadow-pending/10' },
  { key: 'processing' as const, label: 'Processing', borderClass: 'border-t-processing', glow: 'shadow-processing/10' },
  { key: 'completed' as const, label: 'Completed', borderClass: 'border-t-completed', glow: 'shadow-completed/10' },
  { key: 'failed' as const, label: 'Failed', borderClass: 'border-t-failed', glow: 'shadow-failed/10' },
  { key: 'cancelled' as const, label: 'Cancelled', borderClass: 'border-t-cancelled', glow: 'shadow-cancelled/10' },
  { key: 'dlq' as const, label: 'DLQ', borderClass: 'border-t-dlq', glow: 'shadow-dlq/10' },
];

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setStats(await fetchStats());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats');
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

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Live job counts by status — updates via SSE"
      />

      {error && (
        <p className="mb-4 rounded-lg border border-failed/30 bg-failed/10 px-4 py-3 text-sm text-failed">
          {error}
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-surface-2" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {CARDS.map(({ key, label, borderClass, glow }) => (
            <div
              key={key}
              className={`flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 shadow-lg border-t-[3px] ${borderClass} ${glow}`}
            >
              <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
              <span className="text-2xl font-bold sm:text-3xl">{stats[key]}</span>
              <StatusBadge status={key === 'dlq' ? 'failed' : key} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
