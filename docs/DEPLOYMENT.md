# Deployment Guide

Manual deployment to a VPS (no Heroku, Render, Railway, or managed platforms). Process management uses **systemd only** (no PM2).

## Prerequisites

- VPS with public IP (DigitalOcean, Hetzner, AWS EC2, etc.)
- Dynamic DNS hostname (DuckDNS, No-IP)
- SSH access
- Node.js 20.x, pnpm, PostgreSQL, Redis, Nginx, Certbot

For local development setup (Windows/Linux/macOS), see [LOCAL-SETUP.md](LOCAL-SETUP.md).

## 1. Server Setup

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx certbot python3-certbot-nginx postgresql redis-server git

# Node.js 20 via NodeSource, then:
npm install -g pnpm
```

### PostgreSQL database and user

Create the application role and database (match `.env.example` or your production `.env`):

```bash
sudo -u postgres psql <<'SQL'
CREATE USER scheduler WITH PASSWORD 'your-secure-password';
CREATE DATABASE job_scheduler OWNER scheduler;
GRANT ALL PRIVILEGES ON DATABASE job_scheduler TO scheduler;
SQL
```

Set in `/opt/stage9/.env`:

```
DATABASE_URL=postgresql://scheduler:your-secure-password@localhost:5432/job_scheduler
REDIS_URL=redis://localhost:6379
```

Verify Postgres and Redis:

```bash
psql -U scheduler -d job_scheduler -h localhost -c "SELECT 1"
redis-cli ping
```

### Redis tuning (small VPS)

Optional — limit memory on 1–2 GB VPS:

```bash
sudo sed -i 's/^# maxmemory .*/maxmemory 64mb/' /etc/redis/redis.conf
sudo sed -i 's/^# maxmemory-policy .*/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf
sudo systemctl restart redis-server
```

## 2. Dynamic DNS

1. Create a hostname at [DuckDNS](https://www.duckdns.org/) or No-IP
2. Point it to your server's public IP
3. Verify: `ping yourdomain.duckdns.net`

> **Note:** Dynamic DNS may take 5–15 minutes to propagate after IP changes. If the URL is unreachable, wait and retry.

## 3. Clone and Build

```bash
sudo useradd -r -m -s /bin/bash stage9
sudo mkdir -p /opt/stage9
sudo chown stage9:stage9 /opt/stage9

sudo -u stage9 git clone <your-repo-url> /opt/stage9
cd /opt/stage9
sudo -u stage9 cp .env.example .env
# Edit .env with production values

sudo -u stage9 pnpm install
sudo -u stage9 pnpm build
sudo -u stage9 pnpm db:migrate
```

## 4. systemd Services

Copy service files from `docs/deployment/` to `/etc/systemd/system/`:

```bash
sudo cp docs/deployment/stage9-api.service /etc/systemd/system/
sudo cp docs/deployment/stage9-worker.service /etc/systemd/system/
sudo cp docs/deployment/stage9-scheduler.service /etc/systemd/system/

sudo systemctl daemon-reload
sudo systemctl enable stage9-api stage9-worker stage9-scheduler
sudo systemctl start stage9-api stage9-worker stage9-scheduler
```

Check status:

```bash
sudo systemctl status stage9-api stage9-worker stage9-scheduler
sudo journalctl -u stage9-worker -f
```

## 5. Frontend Build

```bash
cd /opt/stage9
sudo -u stage9 pnpm --filter @scheduler/web build
# Output: apps/web/dist/
```

## 6. Nginx Reverse Proxy

Create `/etc/nginx/sites-available/stage9`:

```nginx
server {
    listen 80;
    server_name yourdomain.duckdns.net;

    root /opt/stage9/apps/web/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/events {
        proxy_pass http://127.0.0.1:3000/api/events;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400;
    }

    location /docs {
        proxy_pass http://127.0.0.1:3000;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/stage9 /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

**Critical:** `proxy_buffering off` on `/api/events` is required for SSE live updates. The API also sends `X-Accel-Buffering: no` as a belt-and-suspenders header.

## 7. HTTPS (Let's Encrypt)

```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.duckdns.net --non-interactive --agree-tos -m your-email@example.com
sudo systemctl reload nginx
```

## 8. Health Check

```bash
curl https://yourdomain.duckdns.net/health
# Expected: {"status":"ok","db":"connected","redis":"connected"}
```

## Submission Checklist

- [ ] GitHub repository URL
- [ ] Live UI URL (`https://yourdomain.duckdns.net`)
- [ ] API docs URL (`https://yourdomain.duckdns.net/docs`)
- [ ] Architecture doc (`docs/ARCHITECTURE.md`)
- [ ] Deployed server with HTTPS
- [ ] Nginx reverse proxy with SSE buffering disabled
- [ ] Dynamic DNS hostname working
