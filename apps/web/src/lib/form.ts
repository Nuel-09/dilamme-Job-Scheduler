export const inputClass =
  'mt-1.5 w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-text placeholder:text-muted/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25';

export const labelClass = 'flex flex-col text-sm font-medium text-text/90';

export const btnPrimary =
  'rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-accent/20 transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60';

export const btnSecondary =
  'rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm font-medium text-text transition-colors hover:border-accent/40 hover:text-accent';

export const PRIORITY_LABELS: Record<number, string> = { 1: 'High', 2: 'Medium', 3: 'Low' };

export function formatInterval(interval: string | null): string {
  if (!interval) return '—';
  return interval.replace(/_/g, ' ').replace('every ', '');
}
