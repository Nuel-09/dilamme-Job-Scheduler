# Job Creation Guide — Standalone vs DAG

Use this guide to create jobs deliberately and trace why one stays `pending`.

## Prerequisites (all job types)

| Process    | Command              | Why                          |
| ---------- | -------------------- | ---------------------------- |
| PostgreSQL | `docker compose up`  | Job storage                  |
| Redis      | same                 | SSE + worker locks           |
| API        | `pnpm dev:api`       | Create jobs, live events     |
| Scheduler  | `pnpm dev:scheduler` | Promotes due jobs            |
| Worker     | `pnpm dev:worker`    | Runs handlers                |
| Web        | `pnpm dev:web`       | Dashboard (optional)         |

Sidebar should show **Live (SSE)** green dot. If amber, check API + Redis.

---

## 1. Single job (no dependencies)

**Goal:** One `send_email` runs on its own — nothing waits on anything else.

### UI steps

1. **Create Job**
2. Type: `send_email`
3. Fill **To** + **Subject** (required — empty payload will fail the handler)
4. Leave **Workflow dependencies** collapsed (nothing checked)
5. Leave **Scheduled At** empty (runs immediately)
6. **Recurring Interval:** None
7. Submit → open **Jobs**

### Expected timeline

| Time   | DB status     | What happened                          |
| ------ | ------------- | -------------------------------------- |
| T+0s   | `pending`     | Job created                            |
| T+0.5s | `pending`     | Scheduler promoted to ready queue      |
| T+1s   | `processing`  | Worker claimed job                     |
| T+1–2s | `completed`   | Handler finished                       |

### API (curl)

```bash
curl -X POST http://localhost:3200/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "type": "send_email",
    "priority": 2,
    "payload": { "to": "test@gmail.com", "subject": "Standalone test" }
  }'
```

### Trace

```bash
# Job detail + logs
curl http://localhost:3200/api/jobs/<JOB_ID>
```

Look for log events: `job.created` → `job.promoted` → `job.started` → `job.completed`.

---

## 2. Scheduled job (run later)

**Goal:** Job stays `pending` until `scheduled_at` passes.

### UI steps

1. Create `send_email` as above
2. Set **Scheduled At** to 2–3 minutes in the future
3. No dependencies, no interval

### Expected

- **Before** scheduled time: status `pending`, worker idle for this job
- **After** scheduled time: scheduler promotes → worker runs → `completed`

### API

```bash
curl -X POST http://localhost:3200/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "type": "send_email",
    "priority": 2,
    "scheduled_at": "2026-06-12T10:00:00.000Z",
    "payload": { "to": "test@gmail.com", "subject": "Scheduled test" }
  }'
```

`scheduled_at` must be full ISO 8601 (`...Z` or offset). The UI converts `datetime-local` for you.

---

## 3. Recurring job (repeats after each completion)

**Goal:** Run once, then wait for interval, then run again.

### UI steps

1. Create `send_email` with valid payload
2. **Scheduled At:** empty (first run ASAP)
3. **Recurring Interval:** `every 1 minute` (or 5 min / 1 hour)
4. No dependencies

### Expected cycle

```
create → pending → processing → completed
       → pending (awaiting_retry, scheduled_at = now + 1 min)
       → … after interval … → processing → completed → repeat
```

Between runs the UI shows `pending` with an **Interval** column set. That is normal.

### API

```bash
curl -X POST http://localhost:3200/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "type": "send_email",
    "priority": 2,
    "interval": "every_1_minute",
    "payload": { "to": "test@gmail.com", "subject": "Recurring test" }
  }'
```

---

## 4. DAG chain (dependent jobs)

**Goal:** Demo `generate_report → upload_file → send_email`. Each step waits for the previous to **complete**.

### Step A — Report (no dependencies)

| Field        | Value              |
| ------------ | ------------------ |
| Type         | `generate_report`  |
| Report type  | `monthly`          |
| Format       | `pdf`              |
| Dependencies | none               |
| Interval     | none (for first test) |

Copy the job **ID** from Jobs table (or API response).

### Step B — Upload (depends on report)

| Field        | Value                         |
| ------------ | ----------------------------- |
| Type         | `upload_file`                 |
| Destination  | `s3://reports/monthly.pdf`    |
| Dependencies | check **Step A** job only     |

Until report is `completed`, upload stays `pending` (scheduler skips promotion).

### Step C — Email (depends on upload)

| Field        | Value                                      |
| ------------ | ------------------------------------------ |
| Type         | `send_email`                               |
| To / Subject | filled in                                  |
| Dependencies | check **Step B** job only (not report ID) |

### Expected order

```
generate_report: pending → processing → completed
upload_file:     pending (blocked) → … → processing → completed
send_email:      pending (blocked) → … → processing → completed
```

### API chain

```bash
# 1. Report
REPORT_ID=$(curl -s -X POST http://localhost:3200/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"type":"generate_report","priority":2,"payload":{"reportType":"monthly","format":"pdf"}}' \
  | jq -r .id)

# 2. Upload (waits for report)
UPLOAD_ID=$(curl -s -X POST http://localhost:3200/api/jobs \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"upload_file\",\"priority\":2,\"payload\":{\"destination\":\"s3://reports/out.pdf\"},\"depends_on\":[\"$REPORT_ID\"]}" \
  | jq -r .id)

# 3. Email (waits for upload)
curl -X POST http://localhost:3200/api/jobs \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"send_email\",\"priority\":1,\"payload\":{\"to\":\"test@gmail.com\",\"subject\":\"Report ready\"},\"depends_on\":[\"$UPLOAD_ID\"]}"
```

### Verify dependencies

```bash
curl http://localhost:3200/api/jobs/<JOB_ID>
# Response includes "dependsOn": ["<parent-uuid>"]
```

---

## 5. Why recurring jobs look "stuck" with no completion trace

After a recurring job **completes**, the worker calls `scheduleRecurringRun()` which:

- Sets `status` back to `pending`
- Sets `awaiting_retry = true` (waiting for interval)
- Sets `scheduled_at` to the **next** run time
- Clears `started_at` and `completed_at` on the `jobs` row

So the UI only shows **pending** — it looks like the job never ran. The completion **is** recorded in `job_logs` (`job.completed` event). Check:

```bash
curl http://localhost:3200/api/jobs/<JOB_ID>
# logs[] will contain job.completed with a timestamp
```

Between runs the Jobs table should now show a detail line like **"Awaiting next run (1 minute) — fires ~…"**.

---

## 6. Troubleshooting a stuck `pending` job

Use your `generate_report` example as a checklist:

| Check | Your job | Fix |
| ----- | -------- | --- |
| **Scheduler running?** | `heapSize` in logs | `pnpm dev:scheduler` |
| **Worker running?** | `worker.heartbeat` in logs | `pnpm dev:worker` — **restart if it crashed** |
| **Worker crashed (OOM)?** | Terminal shows `heap out of memory` | Restart worker; jobs sit in ready queue until worker claims them |
| **`inReadyQueue` true?** | API field `inReadyQueue` | Scheduler promoted it; worker must be alive to claim |
| **`awaitingRetry` true?** | API field `awaitingRetry` | Normal between recurring/retry runs — wait for `scheduled_at` |
| **`scheduled_at` in future?** | `07:37:25` vs now | Wait, or clear schedule |
| **Dependencies blocking?** | `dependsOn` empty = OK | Complete parent jobs first |
| **`awaiting_retry` between runs?** | Normal for recurring | Wait for interval |
| **Empty payload `send_email`?** | N/A for `generate_report` | `generate_report` tolerates `{}` |
| **Empty payload `send_email`?** | Fails handler → retries | Always set `to` + `subject` |

### Quick DB mental model

```
pending + scheduled_at > now     → waiting for schedule
pending + depends_on incomplete  → waiting for parents
pending + in_ready_queue         → waiting for worker claim
processing                       → worker running handler
pending + interval + after complete → waiting for next interval
```

### Logs to watch

**Scheduler:** `scheduler.started`, `scheduler.heap_rebuilt`, promote activity  
**Worker:** `job.started`, `handler.generate_report.success`, `job.completed`  
**Worker terminal:** no job logs = job never reached ready queue

---

## 7. Recommended test order

1. **Standalone `send_email`** — proves stack works end-to-end  
2. **Scheduled `send_email`** — proves time-based promotion  
3. **Standalone `generate_report`** — no interval, no deps, no schedule  
4. **DAG chain** — three jobs with dependencies  
5. **Recurring `send_email`** — only after 1–4 pass  

---

## 8. Seed data reference

`pnpm db:seed` creates:

- DAG chain: report → upload → email (all linked)
- Standalone emails (no dependencies)
- One scheduled email (+2 minutes)

Standalone seed emails do **not** wait for `generate_report`.
