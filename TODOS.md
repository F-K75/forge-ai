# TODOS

Deferred work with enough context to pick up cold. Newest first.

---

## T1 — Rotate the exposed password and JWT (P1)

**What:** Rotate the credentials that were committed in `.claude/settings.json`.

**Why:** Credential-shaped values sat in `permissions.allow` from commit `cb1b7973`
(2026-07-13) until `923a8e8` (2026-07-27) — roughly two weeks in a pushed remote.
Untracking the file stops the bleeding but does not invalidate the credentials, and
does not undo any clone or fork made in that window.

**Pros:** Closes a live exposure.
**Cons:** None. This is not optional.

**Context:** Found during `/plan-eng-review` of the gstack enforcement branch, by the
outside-voice pass, then verified independently. Neither the git-secrets patterns nor
the grep fallback caught it: both anchored on `password = value` and the file used JSON
`"password":"..."`. That scanner gap is fixed in `923a8e8`; this item is the exposure
itself. Affected: one login password tied to a real email address, and a bearer JWT.

**Depends on:** Nothing. Do this first.

---

## T2 — Restore team-safe Claude Code settings (P2)

**What:** Reintroduce a committed Claude Code settings file carrying only the shared,
non-sensitive permission allowlist.

**Why:** `923a8e8` untracked `.claude/settings.json` because it mixed three things:
a legitimate shared permissions allowlist, one machine's local state
(`/Users/keshav/...` paths, scratchpad UUIDs, `Bash(kill -9 ...)`), and live
credentials. Untracking removed all three, so the shared allowlist is gone for anyone
who clones fresh.

**Pros:** Teammates get the permissions allowlist back without the secrets.
**Cons:** Requires auditing the old file line by line to decide what is genuinely
shared. The machine-local entries should not come back at all.

**Context:** The pre-`923a8e8` file is recoverable from git history. Claude Code reads
`.claude/settings.json` (committed) and `.claude/settings.local.json` (gitignored) —
the split this repo needed and did not have. Both are now in `.gitignore`; the
committed one will need that entry removed once it is clean.

**Depends on:** T1 (do not resurrect anything from that file before rotation).

---

## T3 — Reference gstack from CONTRIBUTING.md and README.md (P3)

**What:** Add a short pointer to `CLAUDE.md` and the gstack install from the onboarding
docs.

**Why:** `README.md`, `CONTRIBUTING.md`, and `docs/` mention neither gstack nor
`CLAUDE.md`. `CONTRIBUTING.md` is the canonical setup path (clone → venv → pip install
→ npm install → pytest) and a contributor following it never learns gstack exists.

**Pros:** Onboarding stops depending on someone happening to open `CLAUDE.md`.
**Cons:** One more place that drifts when the gstack setup changes.

**Context:** Surfaced by the outside-voice pass during `/plan-eng-review`. Lower
priority now that gstack is recommended rather than required — nothing breaks if a
contributor skips it. Keep the pointer short and link to `CLAUDE.md` rather than
duplicating install steps.

**Depends on:** Nothing.

---

## T4 — Purge the credentials from git history (P3)

**What:** Rewrite history to remove the credential-bearing versions of
`.claude/settings.json`, then force-push.

**Why:** Rotation (T1) makes the leaked values useless, but they remain readable in
history for anyone with repo access or an existing clone.

**Pros:** Removes the values from the canonical remote.
**Cons:** Rewrites shared history and force-pushes. Cannot reach clones or forks made
during the exposure window. Deliberately sequenced after rotation because purging
history is not a substitute for it.

**Context:** Explicitly deferred during the review — the decision was rotate first,
purge separately. Tooling: `git filter-repo` (preferred) or BFG. Coordinate before
force-pushing.

**Depends on:** T1.

---

## T5 — Detect drift in the gstack command list (P3)

**What:** Either drop the 35-command list from `CLAUDE.md` or add a check that it
matches what gstack actually ships.

**Why:** The list is duplicated verbatim between this repo's `CLAUDE.md` and each
developer's global `~/.claude/CLAUDE.md`, both loaded every session. Every
`/gstack-upgrade` that adds or renames a command silently desyncs the repo copy, and
nothing detects it.

**Pros:** Removes a doc that goes stale without any signal.
**Cons:** The list is genuinely useful for discovery. Dropping it trades convenience
for accuracy; a drift check keeps both but costs a script.

**Context:** Surfaced by the outside-voice pass, which noted Claude Code already
surfaces skill names from skill metadata, making the hand-maintained list redundant.
gstack generates `llms.txt` listing its skills, which a check could diff against.

**Depends on:** Nothing.
