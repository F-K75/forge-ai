#!/usr/bin/env bash
# Start the backend API *and* the Celery build worker together for local
# development (without Docker).
#
# Builds and initiative plans are executed by the Celery worker, not by the
# API process. Running only `uvicorn` lets you log in and create projects,
# but every build then sits in "pending" forever because nothing consumes
# the queue. This script runs both, prefixes their output with [api] /
# [worker], and stops both when either exits or you press Ctrl-C.
#
# Requires MongoDB and Redis to be reachable (see MONGODB_URL / REDIS_URL in
# backend/.env). `docker compose up` remains the all-in-one alternative.
#
# Usage (from anywhere in the repo):
#   bash scripts/dev-backend.sh            # API on :8000 with --reload
#   PORT=8001 bash scripts/dev-backend.sh  # different API port
#   PYTHON=/path/to/python bash scripts/dev-backend.sh
#   NO_RELOAD=1 bash scripts/dev-backend.sh
set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT/backend" || exit 1

# --- Pick a Python interpreter ----------------------------------------------
if [ -z "${PYTHON:-}" ]; then
  # runenv first: where both exist, backend/venv may be a stale older env.
  for candidate in runenv/bin/python .venv/bin/python venv/bin/python; do
    if [ -x "$candidate" ]; then PYTHON="$candidate"; break; fi
  done
  PYTHON="${PYTHON:-python3}"
fi
if ! "$PYTHON" -c "import uvicorn, celery" >/dev/null 2>&1; then
  echo "error: $PYTHON can't import uvicorn/celery." >&2
  echo "       Install backend deps (pip install -r backend/requirements.txt)" >&2
  echo "       or point PYTHON at the right interpreter." >&2
  exit 1
fi

# --- Load backend/.env (if present) -------------------------------------------
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

# --- Fail fast if the broker is down -----------------------------------------
# Without Redis the worker can't receive builds and the API can't enqueue
# them; say so up front instead of letting builds hang.
BROKER="${CELERY_BROKER_URL:-${REDIS_URL:-redis://localhost:6379}}"
if ! BROKER="$BROKER" "$PYTHON" - <<'PY' >/dev/null 2>&1
import os, redis
redis.Redis.from_url(os.environ["BROKER"], socket_connect_timeout=2).ping()
PY
then
  echo "error: can't reach Redis at $BROKER (needed as the Celery broker)." >&2
  echo "       Start Redis, or set REDIS_URL / CELERY_BROKER_URL in backend/.env." >&2
  exit 1
fi

PORT="${PORT:-8000}"
RELOAD_FLAG="--reload"
[ -n "${NO_RELOAD:-}" ] && RELOAD_FLAG=""

# Prefix each line of a process's output so the two streams stay readable.
prefix() { sed -u "s/^/[$1] /"; }

# Job control: each background job gets its own process group (pgid = its
# pid), so shutdown can signal the whole group -- uvicorn --reload runs the
# server in a child process that would otherwise be orphaned.
set -m

"$PYTHON" -m uvicorn main:app --host 127.0.0.1 --port "$PORT" $RELOAD_FLAG \
  > >(prefix api) 2>&1 &
API_PID=$!

"$PYTHON" -m celery -A celery_app worker --loglevel=info \
  --queues=build,deployment > >(prefix worker) 2>&1 &
WORKER_PID=$!

cleanup() {
  trap - INT TERM EXIT
  echo "stopping api ($API_PID) and worker ($WORKER_PID)..." >&2
  kill -TERM -- "-$API_PID" "-$WORKER_PID" 2>/dev/null
  # Give both a moment for a graceful shutdown, then make sure every process
  # in either group is gone.
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    kill -0 -- "-$API_PID" 2>/dev/null || kill -0 -- "-$WORKER_PID" 2>/dev/null || break
    sleep 1
  done
  kill -KILL -- "-$API_PID" "-$WORKER_PID" 2>/dev/null
  wait 2>/dev/null
}
# Ctrl-C / kill: stop both and exit right away (don't fall through to the
# "X exited" report below, which is only for a process dying on its own).
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM
trap cleanup EXIT

echo "api:    http://127.0.0.1:$PORT  (pid $API_PID)"
echo "worker: queues build,deployment (pid $WORKER_PID)"
echo "Ctrl-C stops both."

# If either process dies, stop the other rather than leaving a half-running
# backend (an API with no worker is exactly the silent-hang case).
wait -n "$API_PID" "$WORKER_PID"
status=$?
if kill -0 "$API_PID" 2>/dev/null; then
  echo "worker exited (status $status); stopping api." >&2
else
  echo "api exited (status $status); stopping worker." >&2
fi
exit "$status"
