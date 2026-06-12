import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { createJob, fetchDependencyOptions, type DependencyOption } from '../api';
import { datetimeLocalToIso } from '../utils/datetime';
import { btnPrimary, inputClass, labelClass } from '../lib/form';

const JOB_TYPES = ['send_email', 'generate_report', 'upload_file'] as const;
const INTERVALS = ['every_1_minute', 'every_5_minutes', 'every_1_hour'] as const;

const JOB_TYPE_HELP: Record<(typeof JOB_TYPES)[number], string> = {
  send_email: 'Sends a mock email (validates to + subject).',
  generate_report: 'DAG step 1 — simulates PDF report generation.',
  upload_file: 'DAG step 2 — simulates uploading the report to storage.',
};

export default function CreateJobPage() {
  const navigate = useNavigate();
  const [type, setType] = useState<(typeof JOB_TYPES)[number]>('send_email');
  const [priority, setPriority] = useState(2);
  const [to, setTo] = useState('test@gmail.com');
  const [subject, setSubject] = useState('Welcome');
  const [body, setBody] = useState('');
  const [reportType, setReportType] = useState('monthly');
  const [format, setFormat] = useState('pdf');
  const [destination, setDestination] = useState('s3://reports/output.pdf');
  const [scheduledAt, setScheduledAt] = useState('');
  const [interval, setInterval] = useState('');
  const [dependsOn, setDependsOn] = useState<string[]>([]);
  const [options, setOptions] = useState<DependencyOption[]>([]);
  const [dagOpen, setDagOpen] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchDependencyOptions().then(setOptions).catch(() => setOptions([]));
  }, []);

  const buildPayload = (): Record<string, unknown> => {
    if (type === 'send_email') {
      return { to, subject, body: body || undefined };
    }
    if (type === 'upload_file') {
      return { destination };
    }
    return { reportType, format };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await createJob({
        type,
        payload: buildPayload(),
        priority,
        scheduled_at: scheduledAt ? datetimeLocalToIso(scheduledAt) : undefined,
        interval: interval || undefined,
        depends_on: dependsOn.length ? dependsOn : undefined,
      });
      navigate('/jobs');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleDep = (id: string) => {
    setDependsOn((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  return (
    <div>
      <PageHeader
        title="Create Job"
        description="Submit work to the scheduler queue"
      />

      <form className="mx-auto flex max-w-xl flex-col gap-5" onSubmit={handleSubmit}>
        <label className={labelClass}>
          Job Type
          <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className={inputClass}>
            {JOB_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <span className="mt-1 text-xs font-normal text-muted">{JOB_TYPE_HELP[type]}</span>
        </label>

        <label className={labelClass}>
          Priority
          <select
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className={inputClass}
          >
            <option value={1}>1 — High</option>
            <option value={2}>2 — Medium</option>
            <option value={3}>3 — Low</option>
          </select>
        </label>

        {type === 'send_email' && (
          <div className="space-y-4 rounded-xl border border-border bg-surface-2/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Email payload</p>
            <label className={labelClass}>
              To
              <input value={to} onChange={(e) => setTo(e.target.value)} required type="email" className={inputClass} />
            </label>
            <label className={labelClass}>
              Subject
              <input value={subject} onChange={(e) => setSubject(e.target.value)} required className={inputClass} />
            </label>
            <label className={labelClass}>
              Body
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className={inputClass} />
            </label>
          </div>
        )}

        {type === 'generate_report' && (
          <div className="space-y-4 rounded-xl border border-border bg-surface-2/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Report payload</p>
            <label className={labelClass}>
              Report type
              <input value={reportType} onChange={(e) => setReportType(e.target.value)} required className={inputClass} />
            </label>
            <label className={labelClass}>
              Format
              <select value={format} onChange={(e) => setFormat(e.target.value)} className={inputClass}>
                <option value="pdf">pdf</option>
                <option value="csv">csv</option>
              </select>
            </label>
          </div>
        )}

        {type === 'upload_file' && (
          <div className="space-y-4 rounded-xl border border-border bg-surface-2/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Upload payload</p>
            <label className={labelClass}>
              Destination
              <input value={destination} onChange={(e) => setDestination(e.target.value)} required className={inputClass} />
            </label>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Scheduled At
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className={inputClass}
            />
            <span className="mt-1 text-xs font-normal text-muted">Optional — run after this time</span>
          </label>

          <label className={labelClass}>
            Recurring Interval
            <select value={interval} onChange={(e) => setInterval(e.target.value)} className={inputClass}>
              <option value="">None (one-off)</option>
              {INTERVALS.map((i) => (
                <option key={i} value={i}>
                  {i.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            <span className="mt-1 text-xs font-normal text-muted">Re-runs after each completion</span>
          </label>
        </div>

        <div className="rounded-xl border border-border bg-surface-2/30">
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
            onClick={() => setDagOpen((v) => !v)}
            aria-expanded={dagOpen}
          >
            <span>Workflow dependencies (optional)</span>
            <span className="text-muted">{dagOpen ? '▾' : '▸'}</span>
          </button>

          {dagOpen && (
            <div className="border-t border-border px-4 pb-4 pt-3">
              <p className="mb-3 text-sm text-muted">
                A <strong className="text-text">DAG</strong> (Directed Acyclic Graph) lets this job wait until other
                jobs finish first. Required by the Stage 9 brief to demo chained workflows — e.g.{' '}
                <code className="rounded bg-bg px-1 py-0.5 text-xs">generate_report → upload_file → send_email</code>.
                Leave empty for standalone jobs.
              </p>
              <div className="flex max-h-48 flex-col gap-2 overflow-y-auto">
                {options.length === 0 && (
                  <p className="text-sm text-muted">No jobs available yet — create prerequisite jobs first.</p>
                )}
                {options.map((o) => (
                  <label
                    key={o.id}
                    className="flex cursor-pointer flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-bg/50 px-3 py-2 text-sm transition-colors hover:border-accent/30"
                  >
                    <input
                      type="checkbox"
                      checked={dependsOn.includes(o.id)}
                      onChange={() => toggleDep(o.id)}
                      className="rounded border-border accent-accent"
                    />
                    <span className="font-medium">{o.type}</span>
                    <code className="font-mono text-xs text-muted">{o.id.slice(0, 8)}…</code>
                    <StatusPill status={o.status} />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="rounded-lg border border-failed/30 bg-failed/10 px-4 py-3 text-sm text-failed">{error}</p>
        )}

        <button type="submit" disabled={submitting} className={btnPrimary}>
          {submitting ? 'Creating…' : 'Create Job'}
        </button>
      </form>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted sm:ml-0">{status}</span>
  );
}
