# Deployment Guide

Manual deployment to a VPS (no Heroku, Render, Railway, or managed platforms).

## Prerequisites

- VPS with public IP (DigitalOcean, Hetzner, AWS EC2, etc.)
- Domain or dynamic DNS hostname (DuckDNS, No-IP)
- SSH access

## 1. Server Setup

```bash
# Ubuntu/Debian example
sudo apt update && sudo apt upgrade -y
sudo apt install -y nodejs npm nginx certbot python3-certbot-nginx postgresql redis-server git
```

Install Node.js 20+ via [NodeSource](https://github.com/nodesource/distributions) if the default version is too old.

## 2. Dynamic DNS

1. Create a hostname at [DuckDNS](https://www.duckdns.org/) or No-IP
2. Point it to your server's public IP
3. Verify: `ping your-hostname.duckdns.org`

## 3. Clone and Build

```bash
git clone <your-repo-url> /opt/job-scheduler
cd /opt/job-scheduler
cp .env.example .env
# Edit .env with production DATABASE_URL, REDIS_URL, etc.

npm install
npm run build
npm run db:migrate
```

## 4. PostgreSQL and Redis

Configure PostgreSQL for production credentials and update `DATABASE_URL` in `.env`.

Ensure Redis is running: `sudo systemctl enable redis-server`

## 5. systemd Services

Create `/etc/systemd/system/job-scheduler-api.service`:

```ini
[Unit]
Description=Job Scheduler API
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/job-scheduler
EnvironmentFile=/opt/job-scheduler/.env
ExecStart=/usr/bin/node apps/api/dist/index.js
Restart=always

[Install]
WantedBy=multi-user.target
```

Create similar units for:

- `job-scheduler-worker.service` → `apps/worker/dist/index.js`
- `job-scheduler-scheduler.service` → `apps/scheduler/dist/index.js`

```bash
sudo systemctl daemon-reload
sudo systemctl enable job-scheduler-api job-scheduler-worker job-scheduler-scheduler
sudo systemctl start job-scheduler-api job-scheduler-worker job-scheduler-scheduler
```

## 6. Build and Serve Frontend

```bash
cd /opt/job-scheduler/apps/web
npm run build
# Output: apps/web/dist/
```

## 7. Nginx Reverse Proxy

Create `/etc/nginx/sites-available/job-scheduler`:

```nginx
server {
    listen 80;
    server_name your-hostname.duckdns.org;

    root /opt/job-scheduler/apps/web/dist;
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
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }

    location /docs {
        proxy_pass http://127.0.0.1:3000;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/job-scheduler /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 8. HTTPS (Let's Encrypt)

```bash
sudo certbot --nginx -d your-hostname.duckdns.org
```

Certbot auto-configures HTTPS and HTTP→HTTPS redirect.

## 9. Submission Checklist

- [ ] GitHub repository URL
- [ ] Live UI URL (`https://your-hostname.duckdns.org`)
- [ ] API docs URL (`https://your-hostname.duckdns.org/docs`)
- [ ] Architecture doc (`docs/ARCHITECTURE.md`)
- [ ] Deployed server URL with HTTPS
- [ ] Nginx reverse proxy configured
- [ ] Dynamic DNS hostname working

## PM2 Alternative

Instead of systemd:

```bash
npm install -g pm2
pm2 start apps/api/dist/index.js --name api
pm2 start apps/worker/dist/index.js --name worker
pm2 start apps/scheduler/dist/index.js --name scheduler
pm2 save && pm2 startup
```
