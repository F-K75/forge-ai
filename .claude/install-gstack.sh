#!/bin/bash
# Install gstack into ~/.claude/skills/gstack
# Mirrors the install_gstack() logic from .claude/hooks/session-start.sh
set -euo pipefail

log() { echo "[gstack-install] $*"; }

GSTACK_DIR="$HOME/.claude/skills/gstack"

if [ -x "$GSTACK_DIR/browse/dist/browse" ] && [ -d "$HOME/.claude/skills/review" ]; then
  log "gstack already installed"
  exit 0
fi

if ! command -v bun >/dev/null 2>&1; then
  log "ERROR: bun not found. Install it first: curl -fsSL https://bun.sh/install | bash"
  exit 1
fi

if [ ! -d "$GSTACK_DIR/.git" ]; then
  log "cloning gstack"
  rm -rf "$GSTACK_DIR"
  mkdir -p "$HOME/.claude/skills"
  git clone --single-branch --depth 1 -q https://github.com/garrytan/gstack.git "$GSTACK_DIR" \
    || { log "ERROR: gstack clone failed"; exit 1; }
fi

log "installing deps"
(cd "$GSTACK_DIR" && bun install --frozen-lockfile >/dev/null 2>&1) \
  || (cd "$GSTACK_DIR" && bun install >/dev/null 2>&1) || true

log "running gstack setup"
(cd "$GSTACK_DIR" && GSTACK_SKIP_FONTS=1 ./setup >/dev/null 2>&1) \
  || { log "WARN: gstack setup had non-fatal issues"; }

log "gstack installed to $GSTACK_DIR"
log "Start a new Claude Code session to load gstack skills (/review, /qa, /ship, /browse, etc.)"
