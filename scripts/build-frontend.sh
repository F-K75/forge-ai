#!/usr/bin/env bash
set -euo pipefail

echo "Building Forge AI frontend for Cloudflare Pages..."

cd frontend

echo "Installing dependencies..."
npm ci --silent

echo "Running build..."
npm run build

echo "Build complete. Output: frontend/dist/"
