import { useCallback, useEffect, useState } from 'react';
import { fetchStats, type DashboardStats } from '../api';
import { useJobEvents } from '../hooks/useJobEvents';
import StatusBadge from '../components/StatusBadge';

const EMPTY: DashboardStats = {
  pending: 0,
  processing: 0,
  completed: 0,
  failed: 0,
  cancelled: 0,
  dlq: 0,
};

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setStats(await fetchStats());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useJobEvents(() => { load(); });

  const cards = [
    { key: 'pending', label: 'Pending', color: 'var(--pending)' },
    { key: 'processing', label: 'Processing', color: 'var(--processing)' },
    { key: 'completed', label: 'Completed', color: 'var(--completed)' },
    { key: 'failed', label: 'Failed', color: 'var(--failed)' },
    { key: 'cancelled', label: 'Cancelled', color: 'var(--cancelled)' },
    { key: 'dlq', label: 'DLQ', color: 'var(--dlq)' },
  ] as const;

  return (
    <div>
      <header className="page-header">
        <h2>Dashboard</h2>
        <p>Live job counts by status — updates via SSE without refresh</p>
      </header>

      {loading ? (
        <p className="muted">Loading stats...</p>
      ) : (
        <div className="stats-grid">
          {cards.map(({ key, label, color }) => (
            <div key={key} className="stat-card" style={{ borderTopColor: color }}>
              <span className="stat-label">{label}</span>
              <span className="stat-value">{stats[key]}</span>
              <StatusBadge status={key === 'dlq' ? 'failed' : key} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
