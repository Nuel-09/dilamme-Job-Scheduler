import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createJob, fetchDependencyOptions, type DependencyOption } from '../api';

const JOB_TYPES = ['send_email', 'generate_report', 'upload_file'];
const INTERVALS = ['', 'every_1_minute', 'every_5_minutes', 'every_1_hour'];

export default function CreateJobPage() {
  const navigate = useNavigate();
  const [type, setType] = useState('send_email');
  const [priority, setPriority] = useState(2);
  const [to, setTo] = useState('test@gmail.com');
  const [subject, setSubject] = useState('Welcome');
  const [body, setBody] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [interval, setInterval] = useState('');
  const [dependsOn, setDependsOn] = useState<string[]>([]);
  const [options, setOptions] = useState<DependencyOption[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchDependencyOptions().then(setOptions).catch(() => setOptions([]));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> =
        type === 'send_email'
          ? { to, subject, body: body || undefined }
          : type === 'upload_file'
            ? { destination: 's3://reports/output.pdf' }
            : { reportType: 'monthly', format: 'pdf' };

      await createJob({
        type,
        payload,
        priority,
        scheduled_at: scheduledAt || undefined,
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
      <header className="page-header">
        <h2>Create Job</h2>
        <p>All fields supported: type, payload, priority, schedule, interval, dependencies</p>
      </header>

      <form className="create-form" onSubmit={handleSubmit}>
        <label>
          Job Type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {JOB_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>

        <label>
          Priority
          <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
            <option value={1}>1 — High</option>
            <option value={2}>2 — Medium</option>
            <option value={3}>3 — Low</option>
          </select>
        </label>

        {type === 'send_email' && (
          <>
            <label>To <input value={to} onChange={(e) => setTo(e.target.value)} required /></label>
            <label>Subject <input value={subject} onChange={(e) => setSubject(e.target.value)} required /></label>
            <label>Body <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} /></label>
          </>
        )}

        <label>
          Scheduled At (optional)
          <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        </label>

        <label>
          Recurring Interval (optional)
          <select value={interval} onChange={(e) => setInterval(e.target.value)}>
            <option value="">None</option>
            {INTERVALS.filter(Boolean).map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend>Dependencies (DAG)</legend>
          <div className="dep-list">
            {options.length === 0 && <p className="muted">No jobs available yet</p>}
            {options.map((o) => (
              <label key={o.id} className="dep-item">
                <input
                  type="checkbox"
                  checked={dependsOn.includes(o.id)}
                  onChange={() => toggleDep(o.id)}
                />
                <span>{o.type}</span>
                <code>{o.id.slice(0, 8)}…</code>
                <span className="muted">({o.status})</span>
              </label>
            ))}
          </div>
        </fieldset>

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create Job'}
        </button>
      </form>
    </div>
  );
}
