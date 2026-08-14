# Cloudflare Pages Deployment

Deploy the Forge AI frontend to Cloudflare Pages.

## Prerequisites

- Cloudflare account with Pages enabled
- Backend API deployed at `https://api.forge.ai`
- `wrangler` CLI: `npm install -g wrangler`

## Build Configuration

### Via Cloudflare Dashboard

1. Go to **Cloudflare Dashboard → Pages → Create project**
2. Connect your Git repository
3. Configure build settings:

```
Build command: cd frontend && npm ci && npm run build
Build output directory: frontend/dist
Environment variables:
  - VITE_API_URL=https://forge-ai-ioom.onrender.com
  - VITE_WS_URL=wss://forge-ai-ioom.onrender.com
  - VITE_BASE=/
```

### Via Wrangler CLI

```bash
# Login
wrangler login

# Create Pages project
wrangler pages project create forge-frontend --production-branch main

# Deploy
cd frontend
npm run build
wrangler pages project upload forge-frontend ./dist
```

## Backend Requirements

- Deploy backend separately (Cloudflare Workers, Fly.io, Render, etc.)
- Set `VITE_API_URL` and `VITE_WS_URL` to your backend URL
- Enable CORS on backend for your Pages domain

## Custom Domain

Add a custom domain in **Cloudflare Dashboard → Pages → Custom domains**.

## CI/CD via GitHub Actions

Automate deployments on every push to `main` using the included workflow
`.github/workflows/deploy-cloudflare.yml`.

### Required repository secrets

| Secret | Purpose |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Cloudflare Pages:Edit permission |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `ADMIN_EMAILS` | Comma-separated admin emails exposed to the frontend at build time |

### Setup steps

1. Create a Cloudflare Pages project named `forge-frontend` in the dashboard
   (or run `wrangler pages project create forge-frontend --production-branch main`).
2. Add the secrets above to **GitHub → Settings → Secrets and variables → Actions**.
3. Ensure the backend allows the Pages domain in its CORS allowlist
   (`ALLOWED_ORIGINS` on Render).
4. Push to `main` to trigger the deployment, or run the workflow manually from the
   **Actions** tab.
