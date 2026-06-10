const COLORS: Record<string, string> = {
  pending: 'var(--pending)',
  processing: 'var(--processing)',
  completed: 'var(--completed)',
  failed: 'var(--failed)',
  cancelled: 'var(--cancelled)',
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className="badge" style={{ background: COLORS[status] ?? '#666' }}>
      {status}
    </span>
  );
}
