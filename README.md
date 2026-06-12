<div align="center">

# ⏱️ Job Scheduler

**Background job scheduling with heap priority, DAG workflows, DLQ, and live SSE dashboard**

[Live Demo](#live-url-production) · [API Docs](#urls) · [Features](#key-features) · [Quick Start](#quick-start)

![Node](https://img.shields.io/badge/node-20+-339933?style=for-the-badge&logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/react-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/postgresql-15-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/redis-7-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![Fastify](https://img.shields.io/badge/fastify-4-000000?style=for-the-badge&logo=fastify&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-monorepo-F69220?style=for-the-badge&logo=pnpm&logoColor=white)

</div>

---

A full-stack background job scheduler built for **Dilamme (HNG Stage 9)**. Jobs are created via REST API, stored in PostgreSQL, promoted by an independent **scheduler process**, and executed by **worker processes** — with a React dashboard for real-time visibility over Server-Sent Events (SSE).

**HNG Stage 9 — Backend Engineering Track**

PostgreSQL is the source of truth for job storage. Redis is used for distributed locks and SSE pub/sub only.

## Quick Start

### Prerequisites

- Node.js 20.x
- pnpm (`npm install -g pnpm`)
- PostgreSQL 15+ and Redis 7+ — **Docker (recommended)** or native install

**Docker (fastest):**

```bash
pnpm docker:up
pnpm docker:wait
cp .env.example .env
pnpm db:migrate
```

See **[docs/DOCKER.md](docs/DOCKER.md)** for the full flow.

**Native Postgres/Redis:** install locally and set `DATABASE_URL` in `.env` (use port `5432`; Docker uses `5433` on Windows if native PG is running).

### 1. Configure environment

```bash
cp .env.example .env
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Build packages

```bash
pnpm build
```

### 4. Run migrations and seed

```bash
pnpm db:migrate
pnpm db:seed
```

### Local Development Startup Order

Start processes in this order — the scheduler must run before the worker so jobs enter the ready queue:

1. Ensure Postgres (`:5432`) and Redis (`:6379`) are running locally
2. `pnpm db:migrate` (first time or after schema changes)
3. `pnpm db:seed` (optional sample data)
4. Terminal 1: `pnpm dev:scheduler`
5. Terminal 2: `pnpm dev:worker`
6. Terminal 3: `pnpm dev:api`
7. Terminal 4: `pnpm dev:web`

The API can start any time after the database is ready. The dashboard sidebar should show a green **Live (SSE)** dot when API and Redis are connected.

## URLs

| Service    | URL                            |
| ---------- | ------------------------------ |
| Dashboard  | http://localhost:5173          |
| API        | http://localhost:3200          |
| Swagger    | http://localhost:3200/docs     |
| Health     | http://localhost:3200/health   |
| SSE Events | http://localhost:3200/api/events |

### Live URL (Production)

After deploying to your VPS ([docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)), replace the placeholder below with your DuckDNS/No-IP hostname:

```
https://yourdomain.duckdns.net
```

Verify:

```bash
curl https://yourdomain.duckdns.net/health
curl https://yourdomain.duckdns.net/docs
```

> **Note:** Dynamic DNS may take 5–15 minutes to propagate after server IP changes. If the URL is unreachable, wait briefly and retry.

## Example Job

```bash
curl -X POST http://localhost:3200/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "type": "send_email",
    "priority": 1,
    "payload": {
      "to": "test@gmail.com",
      "subject": "Welcome"
    }
  }'
```

For scheduled jobs, DAG workflows, and recurring jobs, see **[docs/JOB_CREATION_GUIDE.md](docs/JOB_CREATION_GUIDE.md)**.

## Job Handlers

| Type               | Description                          |
| ------------------ | ------------------------------------ |
| `send_email`       | Mock email send (idempotent by job ID) |
| `generate_report`  | Simulated report generation          |
| `upload_file`      | Simulated file upload                |
| `send_dlq_alert`   | Internal DLQ threshold alert email   |

Example DAG: `generate_report → upload_file → send_email`

## Project Structure

```
apps/
  api/         Fastify REST + SSE + Swagger
  worker/      Independent job processor + timing wheel
  scheduler/   Due job promotion, aging, DLQ alerts
  web/         React dashboard (jobs, DLQ, create form)
packages/
  core/        Heap, timing wheel, aging, backoff
  db/          Drizzle schema + repositories
  handlers/    Job handler registry
docs/
  DOCKER.md             Docker Postgres + Redis for local dev
  JOB_CREATION_GUIDE.md Standalone, scheduled, DAG, recurring jobs
  ARCHITECTURE.md       Process model, lifecycle, durability
  DEPLOYMENT.md         VPS, Nginx, HTTPS, systemd
  BENCHMARKS.md         Heap vs timing wheel tradeoffs
  deployment/           systemd unit files
scripts/
  integration-test.ts   End-to-end API tests
```

## Key Features

- **Heap priority queue** — effective priority → `scheduled_at` → `created_at` (live mirror rebuilt from PostgreSQL)
- **Timing wheel** — retry delays and recurring intervals only (worker-owned fast path)
- **Hybrid durability** — timing wheel + PostgreSQL + scheduler sweep for retries and recurring jobs
- **Aging** — `effective_priority` decreases every 30s while pending (starvation prevention)
- **DAG dependencies** — jobs wait for prerequisites; circular deps rejected at creation
- **Retries** — 3 attempts with 1s / 5s / 25s backoff + ±20% jitter
- **DLQ** — failed jobs with manual retry; alert at ≥10 jobs
- **job_logs** — mandatory transactional audit trail for every status transition
- **SSE live updates** — UI refreshes without polling
- **Duplicate protection** — PostgreSQL `FOR UPDATE SKIP LOCKED` + Redis locks
- **Graceful shutdown** — SIGTERM handling on worker and scheduler

## Benchmarks

```bash
pnpm benchmark
```

See [docs/BENCHMARKS.md](docs/BENCHMARKS.md) for tradeoffs and results.

## Handler Tests

```bash
pnpm test:handlers
```

## Integration Tests (Batch 4–6)

Requires API, scheduler, and worker running locally:

```bash
pnpm test:integration
```

## Linting

```bash
pnpm lint
```

ESLint enforces structured logging — `console.log` is banned in production source (use Pino).

## Documentation

- [Docker Setup](docs/DOCKER.md)
- [Job Creation Guide](docs/JOB_CREATION_GUIDE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Benchmarks](docs/BENCHMARKS.md)

## Submission Requirements

- GitHub repo
- Live UI URL
- API docs (Swagger at `/docs`)
- Architecture doc
- Manual VPS deployment with Nginx + HTTPS + dynamic DNS (see [DEPLOYMENT.md](docs/DEPLOYMENT.md))
