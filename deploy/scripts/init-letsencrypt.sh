#!/bin/sh
# Bootstrap TLS certificates before the first `docker compose up`.
#
# nginx refuses to start without certificate files, and certbot's webroot
# renewal needs a running nginx — this script breaks that cycle by issuing
# the first certificate standalone (or generating a self-signed one).
#
# Usage:  ./deploy/scripts/init-letsencrypt.sh [--staging] [--self-signed]
#   --staging      use the Let's Encrypt staging CA (rehearsal, no rate limits)
#   --self-signed  generate a self-signed cert instead (local testing,
#                  no domain or public IP required)
#
# Reads DOMAIN and LETSENCRYPT_EMAIL from ./.env or the environment.
set -eu

STAGING_FLAG=""
SELF_SIGNED=0
for arg in "$@"; do
    case "$arg" in
        --staging) STAGING_FLAG="--staging" ;;
        --self-signed) SELF_SIGNED=1 ;;
        *) echo "Unknown option: $arg" >&2; exit 1 ;;
    esac
done

if [ -f ./.env ]; then
    set -a
    . ./.env
    set +a
fi

: "${DOMAIN:?DOMAIN must be set (in ./.env or the environment)}"

COMPOSE="docker compose -f docker-compose.prod.yml"

if [ "$SELF_SIGNED" = "1" ]; then
    echo "Generating self-signed certificate for $DOMAIN ..."
    $COMPOSE run --rm --entrypoint /bin/sh certbot -c "
        command -v openssl >/dev/null || apk add --no-cache openssl >/dev/null
        mkdir -p /etc/letsencrypt/live/$DOMAIN
        openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
            -keyout /etc/letsencrypt/live/$DOMAIN/privkey.pem \
            -out /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
            -subj /CN=$DOMAIN"
    echo "Self-signed certificate written to the letsencrypt volume."
else
    : "${LETSENCRYPT_EMAIL:?LETSENCRYPT_EMAIL must be set (in ./.env or the environment)}"
    echo "Requesting Let's Encrypt certificate for $DOMAIN ..."
    $COMPOSE run --rm --publish 80:80 --entrypoint certbot certbot certonly \
        --standalone $STAGING_FLAG \
        -d "$DOMAIN" \
        --email "$LETSENCRYPT_EMAIL" \
        --agree-tos --no-eff-email
    echo "Certificate issued. Renewals run automatically via the certbot service."
fi

echo "You can now start the stack: $COMPOSE up -d"
