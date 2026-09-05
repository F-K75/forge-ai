#!/bin/bash
# SessionStart hook for Claude Code on the web.
#
# Brings a fresh container up to the point where the agent can actually run
# this repo: backend deps on the default python3, frontend node_modules, and
# the gstack skill suite that CLAUDE.md tells agents to use.
#
# Local machines are skipped entirely -- developers manage their own venvs and
# their own gstack install, and this should never touch either.
set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

REPO="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
log() { echo "[session-start] $*"; }

# ---------------------------------------------------------------------------
# Backend deps -> system python3
#
# Deliberately NOT a venv. frontend/package.json has a prebuild step that shells
# out to `python3 ../backend/scripts/export_ws_events.py`, so `npm run build`
# only works if the default interpreter can import fastapi. CI installs the same
# way (see .github/workflows/ci.yml).
# ---------------------------------------------------------------------------
install_backend() {
  if python3 -c "import fastapi, pytest, motor" >/dev/null 2>&1; then
    log "backend deps already present"
    return 0
  fi
  log "installing backend deps"
  # cryptography ships as a Debian-managed package with no RECORD file, so pip
  # cannot uninstall it and the whole requirements install aborts. Installing
  # over it once with --ignore-installed hands ownership to pip.
  if python3 -c "import cryptography,sys; sys.exit(0 if '/usr/lib/python3/dist-packages' in cryptography.__file__ else 1)" 2>/dev/null; then
    pip install -q --ignore-installed cryptography 2>&1 | grep -vi "^WARNING: Running pip as" || true
  fi
  pip install -q -r "$REPO/backend/requirements.txt" 2>&1 | grep -vi "^WARNING: Running pip as" || true
  python3 -c "import fastapi, pytest, motor" || { log "ERROR: backend deps failed to import"; return 1; }
}

# ---------------------------------------------------------------------------
# Frontend deps. `npm install` (not `ci`) so a warm container reuses the cache.
# ---------------------------------------------------------------------------
install_frontend() {
  if [ -d "$REPO/frontend/node_modules/vite" ]; then
    log "frontend deps already present"
    return 0
  fi
  log "installing frontend deps"
  npm install --prefix "$REPO/frontend" --no-audit --no-fund >/dev/null 2>&1 \
    || { log "WARN: npm install failed, frontend tests/build unavailable"; return 0; }
}

# ---------------------------------------------------------------------------
# Playwright chromium shim.
#
# The image ships a chromium build under $PLAYWRIGHT_BROWSERS_PATH, but gstack
# pins a newer playwright that wants a different revision directory, and
# cdn.playwright.dev is blocked by the network policy -- so the download fails
# and gstack's setup aborts before it registers any skills. Point the revision
# gstack asks for at the build that is already on disk. Version-agnostic: the
# wanted revision is read from playwright itself, never hardcoded.
# ---------------------------------------------------------------------------
shim_playwright_chromium() {
  local gstack_dir="$1"
  local pw_root="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"
  [ -d "$pw_root" ] || { log "no playwright browsers dir, skipping shim"; return 0; }

  local want
  want=$(cd "$gstack_dir" && bun --eval \
    'import {chromium} from "playwright"; console.log(chromium.executablePath());' 2>/dev/null | tail -1) || true
  case "$want" in "$pw_root"/*) ;; *) log "could not resolve wanted chromium path, skipping shim"; return 0 ;; esac
  if [ -x "$want" ]; then log "chromium already satisfied"; return 0; fi

  # $want looks like <root>/chromium-<rev>/chrome-linux64/chrome
  local want_dir rev
  want_dir=$(dirname "$want")
  rev=$(basename "$(dirname "$want_dir")"); rev="${rev#chromium-}"

  # first existing build with a real chrome binary, either layout
  local donor=""
  local d
  for d in "$pw_root"/chromium-*/chrome-linux64 "$pw_root"/chromium-*/chrome-linux; do
    if [ -x "$d/chrome" ]; then donor="$d"; break; fi
  done
  if [ -z "$donor" ]; then log "WARN: no chromium build on disk to shim"; return 0; fi
  mkdir -p "$(dirname "$want_dir")"
  ln -sfn "$donor" "$want_dir"
  touch "$(dirname "$want_dir")/INSTALLATION_COMPLETE" "$(dirname "$want_dir")/DEPENDENCIES_VALIDATED"
  log "shimmed chromium rev $rev -> $donor"

  # Headless shell is a separate download and is what chromium.launch() uses by
  # default. Older builds name it chrome-linux/headless_shell; newer playwright
  # expects chrome-headless-shell-linux64/chrome-headless-shell.
  local hs_donor="" hs_dir
  for d in "$pw_root"/chromium_headless_shell-*/chrome-linux; do
    if [ -x "$d/headless_shell" ]; then hs_donor="$d"; break; fi
  done
  if [ -z "$hs_donor" ]; then log "WARN: no headless shell on disk to shim"; return 0; fi
  hs_dir="$pw_root/chromium_headless_shell-$rev/chrome-headless-shell-linux64"
  if [ -x "$hs_dir/chrome-headless-shell" ]; then return 0; fi
  mkdir -p "$hs_dir"
  local f
  for f in "$hs_donor"/*; do ln -sfn "$f" "$hs_dir/$(basename "$f")"; done
  ln -sfn "$hs_donor/headless_shell" "$hs_dir/chrome-headless-shell"
  touch "$pw_root/chromium_headless_shell-$rev/INSTALLATION_COMPLETE" \
        "$pw_root/chromium_headless_shell-$rev/DEPENDENCIES_VALIDATED"
  log "shimmed headless shell rev $rev"
}

# ---------------------------------------------------------------------------
# gstack -- the skill suite CLAUDE.md routes to (/qa, /review, /ship, ...).
# Per-developer install, so it lives in ~/.claude/skills and not in the repo.
# Never fails the hook: a session without gstack is degraded, not broken.
# ---------------------------------------------------------------------------
install_gstack() {
  local dir="$HOME/.claude/skills/gstack"
  if [ -x "$dir/browse/dist/browse" ] && [ -d "$HOME/.claude/skills/review" ]; then
    log "gstack already installed"
    return 0
  fi
  if ! command -v bun >/dev/null 2>&1; then
    log "WARN: bun not found, skipping gstack (install: curl -fsSL https://bun.sh/install | bash)"
    return 0
  fi
  if [ ! -d "$dir/.git" ]; then
    log "cloning gstack"
    rm -rf "$dir"
    mkdir -p "$HOME/.claude/skills"
    git clone --single-branch --depth 1 -q https://github.com/garrytan/gstack.git "$dir" \
      || { log "WARN: gstack clone failed, skipping"; return 0; }
  fi
  # setup runs `bun install` itself, but the shim needs playwright resolvable
  # first -- otherwise setup tries to download chromium and aborts.
  (cd "$dir" && bun install --frozen-lockfile >/dev/null 2>&1) || (cd "$dir" && bun install >/dev/null 2>&1) || true
  shim_playwright_chromium "$dir" || log "WARN: chromium shim failed, /browse may be unavailable"
  log "running gstack setup"
  # GSTACK_SKIP_FONTS: the emoji-font install shells out to apt and is only
  # cosmetic (PDF output), not worth the session-start latency.
  (cd "$dir" && GSTACK_SKIP_FONTS=1 ./setup >/dev/null 2>&1) \
    || { log "WARN: gstack setup failed, skills may be unavailable"; return 0; }
  log "gstack ready"
}

install_backend
install_frontend
install_gstack
log "done"
