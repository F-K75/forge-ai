---
name: run-forge-locally
description: Launch Forge AI's full local stack (MongoDB, Redis, FastAPI backend, Vite frontend) for manual testing or Playwright verification, on a machine with no Docker, no Homebrew, and no pre-installed Mongo/Redis. Use whenever you need to run/verify a change to backend/ or frontend/ in a real browser rather than just type-checking or unit-testing it.
metadata:
  author: claudekit
  version: "1.0.0"
---

# Run Forge AI locally (no Docker, no Homebrew)

This machine has neither Docker nor Homebrew installed, so `docker-compose up`
is not an option and `brew install mongodb-community redis` doesn't work.
Everything below has been verified to work from a clean shell: it downloads
a portable MongoDB binary and compiles Redis from source, both into a scratch
directory, then runs the real backend and frontend against them.

Do this in your scratchpad directory, not inside the repo, so nothing here
gets accidentally committed.

## 1. One-time setup: get mongod and redis-server binaries

```bash
SCRATCH=/path/to/your/scratchpad   # e.g. the session's scratchpad dir
mkdir -p "$SCRATCH/mongo-install" "$SCRATCH/redis-src" "$SCRATCH/mongo-data"

# MongoDB: fetch the current release feed and pick the macOS arm64 "base" build
# (NOT "targeted" -- that edition doesn't exist for macOS; "base" does).
curl -s https://downloads.mongodb.org/current.json -o "$SCRATCH/mongo-current.json"
URL=$(python3 -c "
import json
d = json.load(open('$SCRATCH/mongo-current.json'))
for v in d['versions']:
    if v.get('production_release') and not v.get('rc'):
        for dl in v['downloads']:
            if dl.get('edition')=='base' and dl.get('target')=='macos' and dl.get('arch')=='arm64':
                print(dl['archive']['url']); raise SystemExit
")
curl -sL "$URL" -o "$SCRATCH/mongo.tgz"
tar xzf "$SCRATCH/mongo.tgz" -C "$SCRATCH/mongo-install" --strip-components=1
"$SCRATCH/mongo-install/bin/mongod" --version   # sanity check

# Redis: compile from source (Xcode command line tools' cc/make are enough,
# no other deps needed). Takes about a minute.
curl -sL https://download.redis.io/redis-stable.tar.gz -o "$SCRATCH/redis.tar.gz"
tar xzf "$SCRATCH/redis.tar.gz" -C "$SCRATCH/redis-src" --strip-components=1
(cd "$SCRATCH/redis-src" && make -j4)
```

For a Playwright/browser verification pass, also install Chromium into an
**isolated npm project** (running `npx playwright install` directly in
`frontend/` without first `npm install`ing playwright there just prints a
warning and may not actually install anything):

```bash
mkdir -p "$SCRATCH/pw" && cd "$SCRATCH/pw"
npm init -y >/dev/null 2>&1
npm install playwright@1.48.2
npx playwright install chromium
```

## 2. Start Mongo and Redis

`mongod --fork` is **not supported on macOS builds** -- don't try it, it
fails immediately with `BadValue: ... incompatible with macOS`. Run it via
the Bash tool's `run_in_background: true` instead (or `redis-server
--daemonize yes`, which does work for Redis).

```bash
"$SCRATCH/mongo-install/bin/mongod" \
  --dbpath "$SCRATCH/mongo-data" --port 27017 --bind_ip 127.0.0.1 \
  --logpath "$SCRATCH/mongod-verify.log"
# ^ run this one with run_in_background: true, it never exits on its own

"$SCRATCH/redis-src/src/redis-server" --port 6379 --bind 127.0.0.1 \
  --daemonize yes --logfile "$SCRATCH/redis-verify.log"
```

Confirm both are listening before moving on:
`lsof -iTCP -sTCP:LISTEN -P | grep -E ':27017|:6379'`

Use a **fresh** `mongo-data` directory for this, never the repo's own
`backend/mongodb_data/` -- that may hold the user's real local dev data, and
these two are entirely independent Mongo instances that happen to both bind
port 27017 (nothing else runs at the same time, so there's no conflict, but
don't let a verification run write into someone's real database).

## 3. Start the backend

Use `backend/runenv/` -- it's the Python 3.12 venv with all current
dependencies installed. `backend/venv/` is a **stale Python 3.9 environment**
and will fail or behave differently; don't use it.

```bash
cd /path/to/forge-ai/backend
set -a; source .env; set +a   # loads MONGODB_URL, JWT_SECRET, FIELD_ENCRYPTION_KEY, etc.
export REDIS_URL=redis://localhost:6379
export APP_ENV=development
export CORS_ORIGINS=http://localhost:5173
./runenv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
# ^ run_in_background: true
```

Check `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/health`
returns `200` before moving on. `backend/.env` already points
`MONGODB_URL` at `mongodb://localhost:27017/forge_dev`, matching the mongod
started above.

## 4. Start the frontend

```bash
cd /path/to/forge-ai/frontend
npm run dev -- --port 5173   # run_in_background: true
```

`frontend/.env.local` already sets `VITE_API_URL`/`VITE_WS_URL` to point at
`localhost:8000`, so `LIVE_MODE` (in `frontend/src/lib/env.ts`) will be true
and pages will actually query the backend instead of showing their
demo-mode banner.

## 5. Seed test data (fastest via curl, not the UI)

Registration and login are exempt from CSRF, so no token dance is needed for
those two calls. Everything else (creating a project, etc.) needs a
CSRF token fetched from a cookie-authenticated session first:

```bash
COOKIES=/tmp/cookies.txt
BASE=http://127.0.0.1:8000

curl -s -c "$COOKIES" -b "$COOKIES" -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","name":"Demo","password":"SuperSecret123!"}'

CSRF=$(curl -s -c "$COOKIES" -b "$COOKIES" "$BASE/auth/csrf-token" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['csrf_token'])")

curl -s -c "$COOKIES" -b "$COOKIES" -X POST "$BASE/projects/" \
  -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" \
  -d '{"name":"Demo Project"}'
```

Re-fetch a fresh CSRF token before every subsequent mutating call in the same
script (the token is one-shot-ish and tied to the session -- fetching it
once per `POST` is simplest and cheap).

## 6. Verify in a real browser

Use the Chromium installed in step 1 via a small Node script (not the
frontend's own `node_modules` -- it doesn't have Playwright as a
dependency). Log in through the real `/login` page (not `/auth` -- that
route doesn't exist), then navigate wherever you need:

```js
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
await page.fill('input[type="email"]', 'demo@example.com');
await page.fill('input[type="password"]', 'SuperSecret123!');
await page.click('button[type="submit"]');
await page.waitForURL(/\/projects/, { timeout: 15000 });
// ... navigate to the page under test, screenshot, etc.
```

**Always look at the screenshot.** A blank frame or an empty panel where data
should be is a real bug, not a rendering artifact -- this exact workflow
previously caught a `useNodesState`/`useEdgesState` staleness bug that
`tsc --noEmit` could not have found (the graph canvas rendered but stayed
permanently empty because the async data update never got synced into
ReactFlow's own state).

## 7. Clean up afterward

Stop every process you started (`TaskStop` on each background task, or
`pkill -f "redis-src/src/redis-server"` etc.) and check for stray artifacts
before finishing:

```bash
find /path/to/forge-ai -maxdepth 2 -iname "dump.rdb"   # Redis writes this on exit
git status   # confirm only the files you intentionally edited show as changed
```

Never leave mongod/redis/uvicorn/vite running in the background when done,
and never let a verification run touch the repo's real `backend/mongodb_data/`.
