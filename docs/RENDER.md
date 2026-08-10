# Deploy on Render (Neon + Upstash)

This project ships a [`render.yaml`](../render.yaml) Blueprint for **two** Render services:

| Service | Type | What runs |
|---------|------|-----------|
| `stage9-api` | Web Service | API + worker + scheduler (`scripts/render-start.sh`) |
| `stage9-web` | Static Site | React UI (proxies `/api`, `/docs`, `/health` to API) |

Direct API URL: `https://stage9-api.onrender.com`  
Web UI URL: `https://stage9-web.onrender.com`  
Custom domain (when DNS is set): `https://dilamme-jobscheduler.duckdns.org`

## Why one backend service?

On Render's free tier, services sleep when idle. Running all three backend processes in **one Web Service** means a single wake-up (e.g. opening the UI or hitting `/health`) starts API, worker, and scheduler together — job processing is ready soon after the API responds.

## Does `render.yaml` auto-deploy?

**After the first setup, yes** — pushes to your linked branch trigger redeploys.

**First time:**

1. Push `render.yaml` to GitHub.
2. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** → select repo.
3. Render creates both services.
4. You are prompted for **`DATABASE_URL`** (Neon) and **`REDIS_URL`** (Upstash) — `sync: false` in the blueprint.
5. Wait for services to go green.

If you previously deployed the four-service blueprint, delete the old `stage9-worker` and `stage9-scheduler` services in the Render dashboard (or recreate the blueprint from scratch).

## Prerequisites

- [Neon](https://neon.tech) Postgres — use the **pooled** connection string with `?sslmode=require`
- [Upstash](https://upstash.com) Redis — use the **TCP** URL with TLS (`rediss://...`)
- GitHub repo connected to Render

Migrations run automatically on **`stage9-api` startup** (`scripts/render-start.sh`) because Render free tier does not support `preDeployCommand`. Drizzle only applies pending migrations, so this is safe on every boot.

Build uses `scripts/render-build.sh` / `scripts/render-build-web.sh`. Root `.npmrc` sets `production=false` so TypeScript and other devDependencies still install when Render sets `NODE_ENV=production` from `stage9-shared`.

Fallback — run migrations locally against Neon if startup fails:

```bash
DATABASE_URL="your-neon-url" pnpm db:migrate
```

## Custom domain — DuckDNS (`dilamme-jobscheduler.duckdns.org`)

DuckDNS does **not** accept a full URL like `https://stage9-web.onrender.com`. It only accepts an **IPv4 address**. Render documents using **`216.24.57.1`** for DNS providers that only support A records ([Render DNS docs](https://render.com/docs/configure-other-dns)).

### Checklist

| Step | Where | Action |
|------|--------|--------|
| 1 | Render → **stage9-web** → **Custom Domains** | Confirm `dilamme-jobscheduler.duckdns.org` is listed (from `render.yaml` `domains:`) |
| 2 | [duckdns.org](https://www.duckdns.org) → subdomain **dilamme-jobscheduler** | Set IP to **`216.24.57.1`** only (no `https://`, no hostname) → **update ip** |
| 3 | Render → **stage9-web** → **Custom Domains** | Click **Verify** next to the domain (retry after 5–15 min if DNS is propagating) |
| 4 | Render → **Env Groups** → **stage9-shared** | Confirm `PUBLIC_API_URL=https://dilamme-jobscheduler.duckdns.org` (already in `render.yaml`) |
| 5 | Render → **stage9-api** | **Manual Deploy** after env change so Swagger picks up the domain |

**Do not** add the DuckDNS domain on **`stage9-api`** unless you want direct API access on that hostname. The UI + proxied `/api` routes live on **`stage9-web`**.

**SSE:** Live events still connect to `https://stage9-api.onrender.com/api/events` (`VITE_API_ORIGIN` on **stage9-web** build). REST calls from the DuckDNS UI use same-origin `/api/*` rewrites.

### Verify DNS

```powershell
nslookup dilamme-jobscheduler.duckdns.org
```

You should see **`216.24.57.1`** (may take a few minutes after DuckDNS update).

### Verify HTTPS

```powershell
curl https://dilamme-jobscheduler.duckdns.org/health
```

Expected:

```json
{"status":"ok","db":"connected","redis":"connected"}
```

Open `https://dilamme-jobscheduler.duckdns.org` → sidebar **Live (SSE)** green → create a test job without refreshing.

### If Verify fails on Render

- DuckDNS IP is wrong (must be `216.24.57.1`, not your home/VPS IP)
- DNS not propagated yet — wait and retry **Verify**
- Domain added on wrong service (must be **stage9-web**, not **stage9-api**)
- A record works for many setups but is less ideal than CNAME; if it never verifies, use `https://stage9-web.onrender.com` for the demo

## Verify (default Render URLs)

```bash
curl https://stage9-api.onrender.com/health
curl https://stage9-web.onrender.com/health
```

**SSE on Render:** The static site rewrites `/api/*` for normal requests, but **cannot proxy long-lived SSE streams**. `stage9-web` is built with `VITE_API_ORIGIN=https://stage9-api.onrender.com` so the browser opens `/api/events` directly on the API service (CORS enabled). Redeploy **stage9-web** after changing that variable — it is baked in at build time.

## Free tier limits

The combined backend service still **sleeps when idle** (~15s wake on first request). Once awake, worker and scheduler run in the same container. Use **Starter** ($7/mo) on `stage9-api` for 24/7 uptime.
