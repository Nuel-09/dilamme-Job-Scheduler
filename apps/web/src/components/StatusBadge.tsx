const STATUS_CLASSES: Record<string, string> = {
  pending: 'bg-pending/20 text-pending ring-1 ring-pending/30',
  processing: 'bg-processing/20 text-processing ring-1 ring-processing/30',
  completed: 'bg-completed/20 text-completed ring-1 ring-completed/30',
  failed: 'bg-failed/20 text-failed ring-1 ring-failed/30',
  cancelled: 'bg-cancelled/20 text-cancelled ring-1 ring-cancelled/30',
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${STATUS_CLASSES[status] ?? 'bg-surface-2 text-muted'}`}
    >
      {status}
    </span>
  );
}
