export interface Job {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  priority: number;
  status: string;
  retryCount: number;
  maxRetries: number;
  scheduledAt: string | null;
  interval: string | null;
  error: string | null;
  inDlq: boolean;
  effectivePriority: number;
  cancelRequested: boolean;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface DashboardStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  dlq: number;
}

export interface DependencyOption {
  id: string;
  type: string;
  status: string;
}

export interface JobEvent {
  jobId?: string;
  status?: string;
  type?: string;
  retryCount?: number;
  error?: string | null;
  timestamp?: string;
}

const API = '/api';

export async function fetchStats(): Promise<DashboardStats> {
  const res = await fetch(`${API}/dashboard/stats`);
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export async function fetchJobs(status?: string): Promise<Job[]> {
  const params = status ? `?status=${status}` : '';
  const res = await fetch(`${API}/jobs${params}`);
  if (!res.ok) throw new Error('Failed to fetch jobs');
  return res.json();
}

export async function fetchDlqJobs(): Promise<Job[]> {
  const res = await fetch(`${API}/dlq`);
  if (!res.ok) throw new Error('Failed to fetch DLQ');
  return res.json();
}

export async function fetchDependencyOptions(): Promise<DependencyOption[]> {
  const res = await fetch(`${API}/jobs/dependency-options`);
  if (!res.ok) throw new Error('Failed to fetch dependencies');
  return res.json();
}

export async function createJob(data: {
  type: string;
  payload: Record<string, unknown>;
  priority: number;
  scheduled_at?: string;
  interval?: string;
  depends_on?: string[];
}): Promise<Job> {
  const res = await fetch(`${API}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? 'Failed to create job');
  }
  return res.json();
}

export async function cancelJob(id: string): Promise<void> {
  const res = await fetch(`${API}/jobs/${id}/cancel`, { method: 'PATCH' });
  if (!res.ok) throw new Error('Failed to cancel job');
}

export async function retryDlqJob(id: string): Promise<void> {
  const res = await fetch(`${API}/dlq/${id}/retry`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to retry DLQ job');
}
