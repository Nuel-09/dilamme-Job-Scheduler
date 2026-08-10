# Deploy on Render (Neon + Upstash)

This project ships a [`render.yaml`](../render.yaml) Blueprint for **two** Render services:

| Service | Type | What runs |
|---------|------|-----------|
| `stage9-api` | Web Service | API + worker + scheduler (`scripts/render-start.sh`) |
| `stage9-web` | Static Site | React UI (proxies `/api`, `/docs`, `/health` to API) |

Direct API URL: `https://stage9-api.onrender.com`  
Web UI URL: `https://stage9-web.onrender.com`

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

Fallback — run migrations locally against Neon if startup fails:

```bash
DATABASE_URL="your-neon-url" pnpm db:migrate
```

## Custom domain (`dilamme-jobscheduler.duckdns.org`)

1. Render → **stage9-web** → **Settings** → **Custom Domains** → add your hostname.
2. Render shows a **CNAME** target (e.g. `stage9-web.onrender.com`).
3. Point DNS at that CNAME (Cloudflare works; plain DuckDNS A-records do **not** work with Render).
4. Update `PUBLIC_API_URL` in the **stage9-shared** env group to your HTTPS domain.
5. Optionally add the same domain to **stage9-api** if you want direct API access.

## Verify

```bash
curl https://stage9-api.onrender.com/health
curl https://stage9-web.onrender.com/health
```

Open the web URL → sidebar **Live (SSE)** should be green → create a test job.

## Free tier limits

The combined backend service still **sleeps when idle** (~15s wake on first request). Once awake, worker and scheduler run in the same container. Use **Starter** ($7/mo) on `stage9-api` for 24/7 uptime.
