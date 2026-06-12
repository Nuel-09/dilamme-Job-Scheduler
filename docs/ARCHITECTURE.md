# Stage 9 Job Scheduler — Architecture

## Overview

A background job scheduler built for Dilamme (Stage 9). Jobs are created via REST API, queued in PostgreSQL, promoted to a ready queue by an independent **scheduler process**, and executed by independent **worker processes**. A React dashboard provides live visibility via Server-Sent Events (SSE).

**Source of truth:** PostgreSQL only. Redis is used exclusively for distributed locks and SSE pub/sub, not for queue storage.

## Process Architecture


| Process   | Port | Role                                       |
| --------- | ---- | ------------------------------------------ |
| API       | 3200 | REST, Swagger, SSE, health checks          |
| Scheduler | —    | Promote due jobs, aging, DLQ alerts        |
| Worker    | —    | Claim jobs, timing wheel retries, handlers |
| Web UI    | 5173 | Dashboard, jobs table, create form, DLQ    |


## Job Lifecycle

Every job follows: **pending → processing → completed / failed / cancelled**

- **Scheduled jobs**: stay `pending` in DB until `scheduled_at <= now` (and `awaiting_retry = false`)
- **DAG jobs**: stay `pending` until all dependencies are `completed`
- **Retries**: worker schedules delay; on fire → `awaiting_retry = false` → scheduler promotes via heap
- **DLQ**: after 3 failed attempts, `status = failed`, `in_dlq = true`
- **Recurring**: on `completed`, timing wheel waits for interval, then releases job to scheduler

### Cancellation Rules

1. **Pending:** Immediate `status = 'cancelled'`. Job is never promoted to the ready queue.
2. **Processing:** Set `cancel_requested = true`. Worker checks this flag **before** calling the handler (skips execution) and **after** handler completion (discards result, marks `cancelled`, does not retry). Partial side effects are possible; handlers are idempotent where feasible.
3. **Completed / Failed / Cancelled:** Cancellation is a no-op.

## `scheduled_at` Semantics

`scheduled_at` has two meanings depending on state:

| State | Meaning |
| ----- | ------- |
| `awaiting_retry = false` | Absolute schedule: promote to ready queue when `scheduled_at <= now` |
| `awaiting_retry = true` | Delay end time: retry or recurring run fires at this timestamp |

While `awaiting_retry = true`, the job is **not** eligible for promotion or worker claim regardless of `scheduled_at`.

## Hybrid Durability Model (Retries & Recurring)

Retries and recurring intervals use a **three-layer** design: timing wheel (fast path) + PostgreSQL (durable record) + scheduler sweep (recovery net).

```
Job fails on worker
    │
    ├─► DB: awaiting_retry=true, scheduled_at=retryAt (persisted)
    └─► Worker RAM: timing wheel insert at same retryAt (fast path)

Worker crash / wrong worker / empty wheel
    │
    └─► Scheduler tick: releaseOverdueDelayedJobs()
            WHERE awaiting_retry=true AND scheduled_at <= NOW()
        → awaiting_retry=false → promoteDueJobs() picks it up

Worker restart
    │
    └─► rebuildRetryWheelFromDatabase() from all awaiting_retry rows
```

**Tradeoffs:**

1. **Timing wheel is process-local.** O(1) insert for retry delays, but not shared across workers. PostgreSQL `scheduled_at` is the durable source of truth.
2. **Scheduler sweep is the safety net.** Runs every tick (~500ms) before promotion. Overdue delayed jobs are released even if no worker wheel entry exists.
3. **Release is idempotent.** `releaseJobFromRetryDelay`, `releaseRecurringJob`, and the sweep only update rows where `awaiting_retry = true`, so wheel + sweep cannot double-release.
4. **Multi-worker safe.** Any worker can rebuild the wheel from DB on startup. Execution order still comes from PostgreSQL at claim time.

## Heap-Based Priority Queue (Live Mirror)

Location: `packages/core/src/min-heap.ts` — `IndexedJobHeap`

Comparator order:

1. **Effective priority** (lower = higher priority)
2. **Scheduled time** (earlier first)
3. **Creation time** (FIFO tie-break)

### SQL Is the Execution Path; Heap Is the Mirror

Workers claim via `SELECT … FOR UPDATE SKIP LOCKED` ordered by `effective_priority`, `scheduled_at`, `created_at`. The in-memory heap is **not** popped at claim time. It provides:

- O(1) `peekJob()` for heartbeat metrics
- O(log n) `updatePriority()` after DB aging
- Benchmark comparisons in `docs/BENCHMARKS.md`

On scheduler startup, the heap is **rebuilt from PostgreSQL** (`in_ready_queue = true` rows). A periodic rebuild every ~60s corrects drift from SQL claims (workers do not notify the heap when they claim jobs).

## Timing Wheel (Retries & Recurring Fast Path)

Location: `packages/core/src/timing-wheel.ts`, owned by **worker process**

Scope: **retry delays (1s, 5s, 25s) and recurring intervals only**. Absolute `scheduled_at` jobs are handled by PostgreSQL + scheduler heap.

Flow:

1. Job fails → worker persists `scheduled_at = retryAt` in DB and inserts into timing wheel at the same timestamp
2. Wheel fires → `releaseJobFromRetryDelay` (idempotent) → scheduler promotes via heap
3. Recurring job completes → same pattern with `nextRunAt` persisted in DB

See `docs/BENCHMARKS.md` for heap vs timing wheel tradeoffs.

## Starvation Prevention (Aging)

**Threshold: 30 seconds** (`AGING_INTERVAL_SECONDS`)

Every 30 seconds waiting in `pending`, `effective_priority` decreases by 1, floored at 1. Aging applies to **all pending jobs** except those `awaiting_retry` or `cancel_requested`, including jobs already in the ready queue (`in_ready_queue = true`).

### DB-Authoritative Aging with Indexed Heap Sync

1. Scheduler tick updates `effective_priority` in PostgreSQL first
2. For jobs in the ready queue, `IndexedJobHeap.updatePriority()` syncs the in-memory mirror in O(log n)
3. Workers read live `effective_priority` from DB at claim time — no stale ordering

**Limitation:** The heap mirror can drift from claimed jobs until the next periodic rebuild. Execution order is always correct because workers use DB columns, not the heap.

## Retry Backoff with Jitter


| Attempt | Base | Jitter (±20%) |
| ------- | ---- | ------------- |
| 1       | 1s   | 800ms–1200ms  |
| 2       | 5s   | 4s–6s         |
| 3       | 25s  | 20s–30s       |


After attempt 3 → DLQ.

## Duplicate Protection

1. PostgreSQL `FOR UPDATE SKIP LOCKED` — atomic claim
2. Redis `SET job:{id}:lock NX EX 300` — prevents double execution on restart

## Dead-Letter Queue

- Jobs with `in_dlq = true` appear in DLQ UI with full history from `job_logs`
- Manual retry: `POST /api/dlq/:id/retry`
- **Alert threshold: 10 jobs** — when count ≥ 10, scheduler triggers `send_dlq_alert` mock email
- Alert fires **once per threshold crossing**, tracked by Redis key `dlq_alert_sent` (1-hour TTL)

## job_logs (Mandatory)

Every status transition writes to `job_logs` **in the same database transaction** as the `jobs` update. This provides full retry history in the UI (not just `jobs.error`). Retry scheduling logs include `metadata.retryAt`; recurring logs include `metadata.nextRunAt`.

## DAG Workflow

```
generate_report → upload_file → send_email
```

Circular dependencies rejected at creation time.

## send_email Idempotency

The handler uses `jobId` as a deterministic message ID (`msg-id-{jobId}`). Duplicate invocations log and skip re-execution — safe for worker retries after crash.

## Live Updates (SSE)

Redis pub/sub channel `job:events` → API `/api/events` → React `useJobEvents()`.

Workers and scheduler publish on every meaningful status change (`processing`, `completed`, `failed`, promotion, retry release). The UI refetches on each job event — no polling loop. If the SSE connection drops, `EventSource` auto-reconnects and the client refetches once on reconnect to catch missed events.

**VPS / Nginx:** `proxy_buffering off`, long `proxy_read_timeout`, and `X-Accel-Buffering: no` on the SSE route (see `docs/DEPLOYMENT.md`).

## Structured Logging

Pino JSON with `event`, `jobId`, `timestamp`. ESLint bans `console.log` in source (use Pino only).

## Health Checks

- API: `GET /health` → `{ status, db, redis }`
- Worker/Scheduler: `worker.heartbeat` / `scheduler.heartbeat` every 30s in logs

## Graceful Shutdown

Both worker and scheduler handle `SIGTERM`/`SIGINT`:

- **Worker:** stops polling, waits up to 30s for current handler, closes DB/Redis
- **Scheduler:** finishes current tick, closes DB/Redis

## API Documentation

Swagger UI: `/docs`
