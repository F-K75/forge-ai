# CLAUDE.md

Guidance for Claude Code and other AI coding agents working in this repository.

## gstack (recommended)

This project uses [gstack](https://github.com/garrytan/gstack), a suite of Claude Code
skills for planning, review, shipping, QA, and browsing. It is recommended, not required
— nothing in this repo blocks work when it is absent.

gstack is a per-developer install: it lives in `~/.claude/skills/gstack`, not in this
repo. Install a pinned revision rather than tracking the default branch, since `./setup`
executes code from the cloned repo:

```bash
git clone --single-branch https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
cd ~/.claude/skills/gstack
git checkout a3259400a366593e0c909dd9ac3e59752efd2488  # v1.60.1.0
./setup
```

Use `~/.claude/skills/gstack/...` for gstack file paths. `/gstack-upgrade` pulls and
executes the latest revision — review what changed before running it, and bump the
pinned SHA above when you do.

Note: `./setup` downloads a Playwright Chromium build. On restricted networks that step
fails and the browser-backed skills (`/browse`, `/qa`, `/design-review`) will not work;
the rest of gstack still installs.

### Web browsing

Use the `/browse` skill from gstack for **all** web browsing.
**Never** use `mcp__claude-in-chrome__*` tools.

### Available skills

- `/office-hours`
- `/plan-ceo-review`
- `/plan-eng-review`
- `/plan-design-review`
- `/design-consultation`
- `/design-shotgun`
- `/design-html`
- `/review`
- `/ship`
- `/land-and-deploy`
- `/canary`
- `/benchmark`
- `/browse`
- `/connect-chrome`
- `/qa`
- `/qa-only`
- `/design-review`
- `/setup-browser-cookies`
- `/setup-deploy`
- `/setup-gbrain`
- `/retro`
- `/investigate`
- `/document-release`
- `/document-generate`
- `/codex`
- `/cso`
- `/autoplan`
- `/plan-devex-review`
- `/devex-review`
- `/careful`
- `/freeze`
- `/guard`
- `/unfreeze`
- `/gstack-upgrade`
- `/learn`
