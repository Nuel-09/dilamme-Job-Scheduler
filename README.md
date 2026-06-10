# Stage 9 Job Scheduler

Background job scheduler with heap-based priority queue, DAG workflows, dead-letter queue, and live React dashboard.

**Stack:** Fastify · TypeScript · PostgreSQL · Redis · React · SSE

## Quick Start

### 1. Start infrastructure

```bash
docker compose up -d
```

### 2. Configure environment

```bash
cp .env.example .env
```

### 3. Install dependencies

```bash
npm install
```

### 4. Build packages

```bash
npm run build
```

### 5. Run migrations and seed

```bash
npm run db:migrate
npm run db:seed
```

### 6. Start all processes (4 terminals)

```bash
npm run dev:api        # http://localhost:3000
npm run dev:scheduler  # promotes due jobs to ready queue
npm run dev:worker     # processes jobs
npm run dev:web        # http://localhost:5173
```

## URLs

| Service     | URL                          |
| ----------- | ---------------------------- |
| Dashboard   | http://localhost:5173        |
| API         | http://localhost:3000        |
| Swagger     | http://localhost:3000/docs   |
| SSE Events  | http://localhost:3000/api/events |

## Example Job

```bash
curl -X POST http://localhost:3000/api/jobs \
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

## Project Structure

```
apps/
  api/         Fastify REST + SSE + Swagger
  worker/      Independent job processor
  scheduler/   Due job promotion + DLQ alerts
  web/         React dashboard
packages/
  core/        Heap, timing wheel, aging, backoff
  db/          Drizzle schema + repositories
  handlers/    Job handler registry
docs/
  ARCHITECTURE.md
  DEPLOYMENT.md
  BENCHMARKS.md
```

## Key Features

- **Heap priority queue** — priority → scheduled_at → created_at
- **Timing wheel** — alternative scheduler with benchmarks
- **Aging** — low-priority jobs promoted every 30s wait
- **DAG dependencies** — jobs wait for prerequisites
- **Retries** — 3 attempts with 1s / 5s / 25s backoff + jitter
- **DLQ** — failed jobs with manual retry; alert at ≥10 jobs
- **SSE live updates** — UI refreshes without page reload
- **Duplicate protection** — PostgreSQL SKIP LOCKED + Redis locks

## Benchmarks

```bash
npm run benchmark
```

See [docs/BENCHMARKS.md](docs/BENCHMARKS.md) for tradeoffs and results template.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Benchmarks](docs/BENCHMARKS.md)

## Submission Requirements

- GitHub repo
- Live UI URL
- API docs (Swagger at `/docs`)
- Architecture doc
- Manual VPS deployment with Nginx + HTTPS + dynamic DNS (see DEPLOYMENT.md)
