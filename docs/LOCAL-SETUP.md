# Local Development Setup

This project uses **native PostgreSQL and Redis** on localhost — no Docker.

## Prerequisites

- Node.js 20.x
- pnpm (`npm install -g pnpm`)
- PostgreSQL 15+ listening on `localhost:5432`
- Redis 7+ listening on `localhost:6379`

---

## Windows

### PostgreSQL

1. Install from [postgresql.org/download/windows](https://www.postgresql.org/download/windows/) or:
   ```powershell
   winget install PostgreSQL.PostgreSQL
   ```
2. Open **SQL Shell (psql)** or pgAdmin and run as the `postgres` superuser:
   ```sql
   CREATE USER scheduler WITH PASSWORD 'scheduler';
   CREATE DATABASE job_scheduler OWNER scheduler;
   GRANT ALL PRIVILEGES ON DATABASE job_scheduler TO scheduler;
   ```
3. Verify:
   ```powershell
   psql -U scheduler -d job_scheduler -h localhost -c "SELECT 1"
   ```

### Redis

Choose one option:

| Option | Install |
|--------|---------|
| **Memurai** (recommended on Windows) | [memurai.com/get-memurai](https://www.memurai.com/get-memurai) |
| **WSL2** | `sudo apt install redis-server && redis-server` |
| **Redis MSI** | [github.com/tporadowski/redis/releases](https://github.com/tporadowski/redis/releases) |

Verify:
```powershell
redis-cli ping
# Expected: PONG
```

---

## Linux / macOS

### PostgreSQL

```bash
# Ubuntu/Debian
sudo apt install postgresql postgresql-contrib

sudo -u postgres psql <<'SQL'
CREATE USER scheduler WITH PASSWORD 'scheduler';
CREATE DATABASE job_scheduler OWNER scheduler;
GRANT ALL PRIVILEGES ON DATABASE job_scheduler TO scheduler;
SQL

psql -U scheduler -d job_scheduler -h localhost -c "SELECT 1"
```

```bash
# macOS (Homebrew)
brew install postgresql@16
brew services start postgresql@16
createuser -s scheduler 2>/dev/null || true
psql postgres -c "ALTER USER scheduler WITH PASSWORD 'scheduler';"
createdb -O scheduler job_scheduler
```

### Redis

```bash
# Ubuntu/Debian
sudo apt install redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server

# macOS
brew install redis
brew services start redis
```

Verify:
```bash
redis-cli ping
# Expected: PONG
```

---

## Application Setup

From the repo root:

```bash
cp .env.example .env
pnpm install
pnpm build
pnpm db:migrate
pnpm db:seed
```

Default connection strings in `.env.example`:

```
DATABASE_URL=postgresql://scheduler:scheduler@localhost:5432/job_scheduler
REDIS_URL=redis://localhost:6379
```

## Verify Health

Start the API:

```bash
pnpm dev:api
```

In another terminal:

```bash
curl http://localhost:3000/health
# Expected: {"status":"ok","db":"connected","redis":"connected"}
```

## Full Dev Startup Order

1. Ensure Postgres and Redis are running locally
2. `pnpm db:migrate` (first time or after schema changes)
3. `pnpm db:seed` (optional sample DAG data)
4. Terminal 1: `pnpm dev:scheduler`
5. Terminal 2: `pnpm dev:worker`
6. Terminal 3: `pnpm dev:api`
7. Terminal 4: `pnpm dev:web`

The scheduler must run before the worker so jobs enter the ready queue.
