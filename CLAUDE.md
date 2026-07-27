# CLAUDE.md

Guidance for Claude Code and other AI coding agents working in this repository.

## gstack (REQUIRED — global install)

This project uses [gstack](https://github.com/garrytan/gstack), a suite of Claude Code
skills for planning, review, shipping, QA, and browsing. It is required for all
AI-assisted work in this repo and enforced by a `PreToolUse` hook
(`.claude/hooks/check-gstack.sh`), which denies skill invocations when gstack is missing.

**Before doing ANY work, verify gstack is installed:**

```bash
test -d ~/.claude/skills/gstack/bin && echo "GSTACK_OK" || echo "GSTACK_MISSING"
```

If GSTACK_MISSING: STOP. Do not proceed. Tell the user:

> gstack is required for all AI-assisted work in this repo.
> Install it:
> ```bash
> git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
> cd ~/.claude/skills/gstack && ./setup --team
> ```
> Then restart your AI coding tool.

Do not skip skills, ignore gstack errors, or work around missing gstack.
gstack is a per-developer install: it lives in `~/.claude/skills/gstack`, not in this
repo. Use `~/.claude/skills/gstack/...` for gstack file paths. Update with
`/gstack-upgrade`.

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
