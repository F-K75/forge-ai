#!/bin/bash
# Points this clone's git hooks at the tracked scripts/git-hooks/ directory
# (TEST-006). Run once after cloning: ./scripts/install-git-hooks.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

chmod +x "$REPO_ROOT"/scripts/git-hooks/*
git -C "$REPO_ROOT" config core.hooksPath scripts/git-hooks

echo "✅ git hooks installed (core.hooksPath = scripts/git-hooks)"
