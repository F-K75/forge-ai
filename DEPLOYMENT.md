# Forge AI — Production Deployment Runbook

Single-VPS deployment with Docker Compose, nginx, and Let's Encrypt. One nginx
container is the only exposed service (ports 80/443): it serves the built
frontend and reverse-proxies `https://<DOMAIN>/api/*` to the backend.

Everything referenced here exists in this repo:

| File | Purpose |
|---|---|
| `docker-compose.prod.yml` | Production stack: nginx, backend, celery worker, mongo, redis, certbot |
| `deploy/nginx/templates/default.conf.template` | nginx config (envsubst on `${DOMAIN}` at container start) |
| `deploy/scripts/init-letsencrypt.sh` | First TLS certificate bootstrap |
| `.env.production.example` | Template for `/opt/forge/.env` on the VPS |
| `.github/workflows/deploy.yml` | CI/CD: builds images to GHCR, deploys over SSH |

---

## 1. What to sign up for

Required before launch:

| Service | Why | Cost |
|---|---|---|
| Domain registrar (Namecheap, Cloudflare, …) | Your public domain | ~$10/yr |
| VPS provider (Hetzner, DigitalOcean, …) | Hosts the stack. **Minimum 4 GB RAM** (mongo + redis + backend + builds), 2 vCPU, Ubuntu 24.04 | ~$8–25/mo |
| [Anthropic Console](https://console.anthropic.com/) | API key — builds cannot run without it | usage-based |

Already covered: GitHub (the repo host) includes GHCR for images.

Optional — the app runs without them, the feature stays dark until configured:

| Service | Feature |
|---|---|
| [Stripe](https://dashboard.stripe.com/) | Billing/subscriptions |
| [Resend](https://resend.com/) | Transactional email (also needs DNS records for your sending domain) |
| OpenAI | Secondary LLM provider |
| GitHub OAuth app | Reserved for the GitHub integration (repo sync currently uses per-user tokens) |

## 2. Provision the VPS

```bash
# as root on a fresh Ubuntu 24.04 server
adduser deploy && usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy

# firewall
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable

# docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
```

Harden SSH (`/etc/ssh/sshd_config`): `PasswordAuthentication no`,
`PermitRootLogin no`, then `systemctl restart ssh`.

## 3. DNS

Create an **A record** for your domain (e.g. `forge.example.com`) pointing at
the VPS IP. Wait until `dig +short forge.example.com` returns the IP.

## 4. First deploy (once, manually)

```bash
# as deploy@vps
sudo mkdir -p /opt/forge && sudo chown deploy:deploy /opt/forge
cd /opt/forge

# fetch the two deploy assets from the repo (or scp them from your machine)
git clone --depth 1 https://github.com/<owner>/forge-ai.git /tmp/forge-src
cp /tmp/forge-src/docker-compose.prod.yml .
cp -r /tmp/forge-src/deploy .
cp /tmp/forge-src/.env.production.example .env

# fill in every REQUIRED value (secret generation commands are in the file)
nano .env

# if the GHCR images are private: create a GitHub PAT with read:packages
docker login ghcr.io -u <github-username>

# issue the first certificate (rehearse with --staging first if you like)
./deploy/scripts/init-letsencrypt.sh

# start everything
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps   # all services healthy?
```

Note: the images must exist in GHCR before this works — push to `main` once
(step 5) or trigger the deploy workflow manually, then re-run the
`pull`/`up` commands.

## 5. Wire up CI/CD

In the GitHub repo settings:

**Secrets** (Settings → Secrets and variables → Actions → Secrets):

| Secret | Value |
|---|---|
| `VPS_HOST` | VPS IP or hostname |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | Private key of a dedicated deploy keypair (`ssh-keygen -t ed25519`), public half in `/home/deploy/.ssh/authorized_keys` |

**Variables** (same page → Variables):

| Variable | Value |
|---|---|
| `PUBLIC_DOMAIN` | e.g. `forge.example.com` (baked into the frontend at image build) |
| `ADMIN_EMAILS` | admin emails shown the admin dashboard |

From then on, every push to `main` builds both images (tagged `latest` +
commit SHA), pushes to GHCR, and deploys to the VPS.

## 6. Smoke tests

```bash
DOMAIN=forge.example.com

# health + detailed health (db and redis must report ok)
curl -fsS https://$DOMAIN/api/health
curl -fsS https://$DOMAIN/api/health/detailed

# security headers on API responses
curl -sI https://$DOMAIN/api/health | grep -iE 'strict-transport|content-security|x-frame'

# http → https redirect
curl -sI http://$DOMAIN | head -1        # expect 301

# SPA served
curl -fsS https://$DOMAIN/ | grep -o '<title>[^<]*'

# rate limiting: 11 rapid login attempts, the 11th should return 429
for i in $(seq 11); do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST https://$DOMAIN/api/auth/login \
    -H 'Content-Type: application/json' -d '{"email":"x@x.com","password":"wrong"}'
done

# CORS: foreign origins must NOT be echoed back
curl -s -X OPTIONS https://$DOMAIN/api/auth/login \
  -H "Origin: https://malicious-site.com" \
  -H "Access-Control-Request-Method: POST" -i | grep -i access-control
```

Finally, the end-to-end check that proves the frontend was built against the
real backend (and not mock mode): open `https://<DOMAIN>`, register, log in,
create a project, and run a small build — **live build events must stream in
the UI**. If the UI "works" but builds complete instantly with canned output,
the frontend image was built without `VITE_WS_URL`.

## 7. Rollback

Every deploy is pinned to a commit SHA. To roll back, run the **Deploy to
production** workflow manually (Actions → Deploy to production → Run
workflow) and enter the previous SHA as `image_tag` — it skips the build and
re-deploys the existing images. Alternatively on the VPS:

```bash
cd /opt/forge
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=<previous-sha>/' .env
docker compose -f docker-compose.prod.yml up -d
```

## 8. Local rehearsal (no domain/VPS needed)

```bash
cp .env.production.example .env    # fill required values, DOMAIN=localhost
export GHCR_OWNER=local IMAGE_TAG=dev
docker build backend/ -t ghcr.io/local/forge-backend:dev
docker build frontend/ -t ghcr.io/local/forge-frontend:dev \
  --build-arg VITE_API_URL=https://localhost/api \
  --build-arg VITE_WS_URL=wss://localhost/api
./deploy/scripts/init-letsencrypt.sh --self-signed
docker compose -f docker-compose.prod.yml up -d
curl -k https://localhost/api/health
```

## 9. Known limitations / phase 2

Deliberately deferred from the initial launch:

- **Monitoring**: no Sentry/error tracking wired in; add uptime monitoring on
  `https://<DOMAIN>/api/health`.
- **Backups**: `scripts/backup_mongodb.py` exists but is not scheduled — set
  up a cron job + offsite copy before storing data you can't lose.
- **Single uvicorn worker**: build events stream through an in-memory
  WebSocket manager; scaling beyond one worker needs Redis pub/sub.
- **Celery**: the worker service runs but no tasks are wired to it yet
  (task routes point at modules that don't exist).
- **User-app deployment** (`backend/api/deployments.py`): deploys generated
  apps on the host Docker socket at `localhost:<port>` — unreachable behind
  nginx. The docker socket is deliberately **not** mounted in production;
  this feature stays dark until it gets proper subdomain routing.
