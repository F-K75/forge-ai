#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
STAGING_DIR="/opt/forge-staging"

echo "==> Setting up Forge AI staging environment at $STAGING_DIR"

# Create directory
mkdir -p "$STAGING_DIR"

# Copy compose file
cp "$REPO_ROOT/docker-compose.staging.yml" "$STAGING_DIR/docker-compose.yml"

# Copy scripts
cp -r "$REPO_ROOT/scripts" "$STAGING_DIR/scripts"

# Create .env from example if it doesn't exist
if [ ! -f "$STAGING_DIR/.env" ]; then
  cp "$REPO_ROOT/.env.staging.example" "$STAGING_DIR/.env"
  echo "WARNING: .env created from example. Edit $STAGING_DIR/.env with real values before deploying."
fi

# Ensure required env vars are set
source "$STAGING_DIR/.env"
if [ -z "${STAGING_DOMAIN:-}" ] || [ -z "${GHCR_OWNER:-}" ] || [ -z "${IMAGE_TAG:-}" ]; then
  echo "ERROR: STAGING_DOMAIN, GHCR_OWNER, and IMAGE_TAG must be set in $STAGING_DIR/.env"
  exit 1
fi

# Obtain SSL certificate for staging domain if not already present
echo "==> Ensuring SSL certificate for $STAGING_DOMAIN"
if ! docker run --rm \
  -v letsencrypt:/etc/letsencrypt \
  -v certbot_www:/var/www/certbot \
  certbot/certbot certificates 2>/dev/null | grep -q "$STAGING_DOMAIN"; then
  echo "==> Obtaining new certificate for $STAGING_DOMAIN"
  docker run --rm \
    -v letsencrypt:/etc/letsencrypt \
    -v certbot_www:/var/www/certbot \
    certbot/certbot certonly --webroot -w /var/www/certbot -d "$STAGING_DOMAIN" --non-interactive --agree-tos -m "$(grep '^LETSENCRYPT_EMAIL=' "$STAGING_DIR/.env" | cut -d= -f2)"
else
  echo "==> Certificate for $STAGING_DOMAIN already exists"
fi

echo "==> Starting staging stack"
cd "$STAGING_DIR"
docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --remove-orphans

echo "==> Waiting for health check"
sleep 15
curl -fsS "https://$STAGING_DOMAIN/api/health" || {
  echo "ERROR: Staging health check failed"
  docker compose -f docker-compose.yml ps
  exit 1
}

echo "==> Staging environment ready at https://$STAGING_DOMAIN"
