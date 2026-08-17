#!/usr/bin/env bash
# Start (or restart) the trycloudflare tunnels for local dev.
#
# The URLs from trycloudflare die whenever the machine sleeps or cloudflared
# restarts. Rerun this script to get fresh URLs — it also syncs the new URLs
# into frontend/.env.local (VITE_API_URL / VITE_WS_URL) and backend/.env
# (FRONTEND_TUNNEL_URL), so the app keeps working with zero manual edits.
#
# Usage: scripts/start-tunnels.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

CLOUDFLARED="${CLOUDFLARED:-}"
if [ -z "$CLOUDFLARED" ]; then
  if [ -x /tmp/cloudflared ]; then
    CLOUDFLARED=/tmp/cloudflared
  elif command -v cloudflared >/dev/null 2>&1; then
    CLOUDFLARED="$(command -v cloudflared)"
  elif [ -x /Users/keshav/bin/cloudflared ]; then
    CLOUDFLARED=/Users/keshav/bin/cloudflared
  else
    echo "cloudflared not found. Set CLOUDFLARED=/path/to/cloudflared." >&2
    exit 1
  fi
fi

echo "Using cloudflared at: $CLOUDFLARED"

# Kill stale tunnels for our dev ports (never touches other tunnels).
pkill -f 'cloudflared tunnel --url http://localhost:5173' 2>/dev/null || true
pkill -f 'cloudflared tunnel --url http://localhost:8000' 2>/dev/null || true
sleep 1

nohup "$CLOUDFLARED" tunnel --url http://localhost:5173 > /tmp/cloudflared-ui.log 2>&1 &
nohup "$CLOUDFLARED" tunnel --url http://localhost:8000 > /tmp/cloudflared.log 2>&1 &

UI_URL=""
API_URL=""
for i in $(seq 1 30); do
  [ -z "$UI_URL" ] && UI_URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cloudflared-ui.log 2>/dev/null | head -1 || true)"
  [ -z "$API_URL" ] && API_URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cloudflared.log 2>/dev/null | head -1 || true)"
  [ -n "$UI_URL" ] && [ -n "$API_URL" ] && break
  sleep 1
done

if [ -z "$UI_URL" ] || [ -z "$API_URL" ]; then
  echo "Tunnels did not come up within 30s. Check:" >&2
  echo "  tail /tmp/cloudflared-ui.log" >&2
  echo "  tail /tmp/cloudflared.log" >&2
  exit 1
fi

echo "UI tunnel:  $UI_URL"
echo "API tunnel: $API_URL"

# Sync URLs into env files.
sync_env() {
  python3 - "$1" "$2" "$3" <<'PY'
import re, sys
path, key, value = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(path).read()
if re.search(rf'^{re.escape(key)}=.*$', text, re.M):
    text = re.sub(rf'^{re.escape(key)}=.*$', f'{key}={value}', text, flags=re.M)
else:
    text += f'\n{key}={value}\n'
open(path, "w").write(text)
print(f"  {path}: {key}={value}")
PY
}

sync_env "$ROOT/frontend/.env.local" "VITE_API_URL" "$API_URL"
sync_env "$ROOT/frontend/.env.local" "VITE_WS_URL" "wss://${API_URL#https://}"
sync_env "$ROOT/backend/.env" "FRONTEND_TUNNEL_URL" "$UI_URL"

echo
echo "Done. Notes:"
echo "  - Vite picks up .env.local changes automatically (server restarts itself)."
echo "  - If the backend is running, restart it to pick up FRONTEND_TUNNEL_URL"
echo "    (only affects generated email/redirect links)."