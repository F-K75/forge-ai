#!/usr/bin/env bash
set -euo pipefail

echo "Deploying Forge AI frontend to Cloudflare Pages..."

# Build frontend
cd frontend
npm ci --silent
npm run build

# Deploy with wrangler
cd ..
wrangler pages project upload forge-frontend ./frontend/dist

echo "Deployment complete."
