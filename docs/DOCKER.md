# Docker — PostgreSQL + Redis (fastest local setup)

Runs only **Postgres** and **Redis** in Docker. API, scheduler, worker, and web still run with `pnpm dev:*` on the host.

## Phase 1 — Start containers

```bash
pnpm docker:up
```

Wait until healthy:

```bash
pnpm docker:wait
# Expected: accepting connections
```

## Phase 2 — Point `.env` at Docker

```bash
cp .env.example .env
```

Ensure these match `docker-compose.yml` defaults:

```env
DATABASE_URL=postgresql://scheduler:scheduler@localhost:5433/job_scheduler
REDIS_URL=redis://localhost:6379
API_PORT=3200
```

**Why port 5433?** Docker maps Postgres to `5433` on the host so it does not clash with a native Windows PostgreSQL install on `5432`.

If you change `DB_USER` / `DB_PASSWORD` / `DB_NAME` in `.env`, update `DATABASE_URL` to match.

## Phase 3 — Migrate & seed

```bash
pnpm db:migrate
pnpm db:seed    # optional demo DAG jobs
```

## Phase 4 — Run the app

Four terminals (or background):

```bash
pnpm dev:api
pnpm dev:scheduler
pnpm dev:worker
pnpm dev:web
```

- API: http://localhost:3200  
- Web: http://localhost:5173  
- Health: http://localhost:3200/health  

## Useful commands

| Command | Action |
| ------- | ------ |
| `pnpm docker:up` | Start Postgres + Redis |
| `pnpm docker:down` | Stop containers (keep data) |
| `pnpm docker:logs` | Follow container logs |
| `pnpm docker:reset` | **Wipe volumes** and restart fresh |
| `pnpm docker:wait` | Check Postgres is ready |

## VPS / production note

On a VPS you typically run **only** Postgres + Redis in Docker (or use managed DB), and run API/scheduler/worker via **systemd** — see [DEPLOYMENT.md](DEPLOYMENT.md). This compose file is aimed at **local dev**.

## Troubleshooting

| Problem | Fix |
| ------- | --- |
| Port 5432 in use | Compose already uses **5433** on the host — set `DATABASE_URL` to port `5433`, not `5432` |
| Password auth failed for `scheduler` | You are hitting **native** Postgres on 5432, not Docker — fix `DATABASE_URL` port to `5433` |
| Port 6379 in use | Stop native Redis, or change compose port to `6380:6379` and update `REDIS_URL` |
| Auth failed | `DATABASE_URL` user/password must match `DB_USER` / `DB_PASSWORD` in `.env` |
| Empty database | Run `pnpm db:migrate` after first `docker:up` |
