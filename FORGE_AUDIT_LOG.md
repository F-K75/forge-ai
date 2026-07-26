# Forge Audit & Fix Log

State file for the daily **audit & fix** scheduled run. A fresh session starts
with no memory, so this file is the only thing that tells it what happened last
time and what to do next. Read it first; append to it last.

## How a run works

1. Read the **Run log** (bottom). Find the most recent entry and its `Track:`.
2. Run the **other** track — the two alternate. If the log is empty, start with
   Technical.
3. Work the **highest-severity unresolved item** for that track from the backlog
   below. One item per run — depth over breadth.
4. Open a pull request against `main`. Never push to `main` directly.
5. Append a dated Run log entry recording the track, what shipped, and anything
   discovered but not fixed. Add new findings to the backlog.

### Rules

- Verify before claiming. A fix is done when the relevant gate passes locally,
  not when the code "looks right". The commands are in **Verifying locally**.
- A finding you cannot fix is still valuable: record it in the backlog with
  evidence rather than dropping it.
- Never rotate credentials, force-push, rewrite history, delete branches, or
  create external accounts. Items needing those go to *Needs keshav*.
- Prefer fixing a root cause once over patching each symptom. If the same
  failure shows up in five places, fix the source.
- Don't weaken a gate to make it pass. Lowering a coverage threshold or
  deleting an assertion is not a fix.
- Scope each PR to one item so it stays reviewable.

## Verifying locally

```bash
# Backend (mirrors the CI job exactly)
cd backend && pip install -r requirements.txt
ruff check . --select F,E9 --exclude venv
bandit -r . -x ./venv,./tests -ll
CI_TEST_MODE=true TESTING=true python -m pytest tests/ -q --timeout=30 \
  --cov=. --cov-report=term --cov-fail-under=60

# Orchestrator
cd orchestrator && pip install -r requirements.txt
ruff check . --select F,E9 --exclude venv && pytest tests/ -q --timeout=30

# Frontend
cd frontend && npm ci && npm run lint && npm test && npm run build

# Production artifacts
docker compose -f docker-compose.prod.yml config -q
```

`CI_TEST_MODE` + `TESTING` together are the test contract: they relax config
validation and shorten the MongoDB server-selection timeout so the suite runs
with no live services. Set both, or tests will stall on real network I/O.

---

## Technical backlog

Severity: **P0** breaks production or the quality gate · **P1** real defect or
risk · **P2** maintainability.

- [ ] **P1 — `secret-scan` has failed on `main` since 2026-07-17.** It is a
  separate workflow from `ci.yml` and is red for four false positives, none of
  which are real credentials:
  `.claude/skills/design/scripts/{icon,logo}/generate.py` pass the module-level
  `GEMINI_API_KEY` *identifier* into `genai.Client(api_key=...)`, and
  `.gitallowed:34` matches its own escaped `self\.api_key = api_key` entry
  because `git secrets --scan` scans the allowlist file too. The fix is
  allowlist entries, but loosening a secret scanner deserves its own reviewed
  change — and note `.claude/skills/` is tooling, not application code, so the
  better fix may be excluding it from the scan entirely.
- [ ] **P2 — The frontend HEALTHCHECK assertion has the same bug just fixed on
  the backend.** `.github/workflows/ci.yml` still greps `{{.Config.Healthcheck}}`
  for the string `Cmd`, which Go never renders. It is currently unreachable —
  `docker build --target=none` always fails, so the step takes the
  grep-the-Dockerfile branch — but it will misfire the moment that changes.
- [ ] **P2 — Re-check the 9 pinned `--ignore-vuln` advisories** in
  `.github/workflows/ci.yml` for patched releases. Two are still being
  suppressed after the gitpython bump cleared the other eight.
- [ ] **P2 — `backend/.coverage` and `backend/coverage.xml` are tracked in
  git.** Both are build artifacts. Worse, the committed `coverage.xml` gets
  picked up and published by the `upload-artifact` step even on runs where the
  test step never executed, so a green-looking coverage artifact can be
  attached to a run that measured nothing. Delete both from the index and add
  them to `.gitignore`.
- [ ] **P1 — A failed index provision poisons the Mongo client.**
  `core/database.py::get_db` assigns `_mongo_client` *before* awaiting
  `_ensure_indexes`. When provisioning raises, the client stays cached, so the
  error surfaces once and every later call silently proceeds against a database
  with no indexes. Assign only after provisioning succeeds, or reset the global
  in the failure path.
- [ ] **P2 — `tasks/pm_tasks.py` is at 20% coverage** (148 statements, 118
  uncovered) and `services/pm_ws_manager.py` at 24%. These are the two weakest
  modules; overall coverage is 68% against a 60% gate, so the headroom exists to
  raise the floor once they are covered.
- [ ] **P2 — Frontend has no coverage gate.** The backend enforces
  `--cov-fail-under=60`; `npm test` has no equivalent, so frontend regressions
  are only caught by whichever tests happen to exist.
- [ ] **P2 — `npm audit` is scoped to `--omit=dev`.** The vite/esbuild dev-server
  advisories are genuinely dev-only, but the exclusion is broad and will hide
  future production-relevant findings in dev-declared packages.

## Business backlog

Source: `FORGE_AI_BUSINESS_AUDIT.md` (18 July 2026, composite score 18/100).
Do **not** duplicate the queue in `FORGE_TASKS.md` — that list is worked by a
separate scheduled run. Skip anything already checked off there. Take the
highest-value item from the audit's P0 blockers and §26 (100 weaknesses) that is
automatable inside this repo.

- [ ] **P0 — No ICP definition.** §5 flags the target customer as CRITICAL and
  undefined. Everything downstream — pricing, messaging, GTM — is unanchored
  without it. Draft `docs/icp.md` with segment, persona, and jobs-to-be-done.
- [ ] **P0 — Positioning is undifferentiated.** §2/§7: "autonomous AI software
  engineering platform" does not say why Forge wins. Produce a messaging
  hierarchy and one-line position, and reflect it in `README.md` and
  `landing.html`.
- [ ] **P1 — Pricing is unvalidated.** §8: tiers exist in
  `backend/core/config.py` but were never tested against willingness to pay.
  Document the assumptions and a validation plan.
- [ ] **P1 — No analytics on the funnel.** Signups, builds started/completed,
  and errors are untracked, so no acquisition or activation metric can be
  computed. (Overlaps a `FORGE_TASKS.md` item — check it there first.)

## Needs keshav (not automatable)

- [ ] **Rotate all live credentials.** `.env` with real API keys is in git
  history — see `INSTANT_NEXT_STEPS.md` #1 and the P0 table in
  `FORGE_AI_BUSINESS_AUDIT.md`. This is the single highest-severity open item in
  the repo and a scheduled run must never attempt it.
- [ ] Lawyer review of the legal docs.
- [ ] GitHub org move, Twitter/X account, Discord server.

---

## Run log

### 2026-07-26 — Track: Technical (run 0, seeded by hand)

**Context.** CI had failed on `main` for six consecutive runs since
2026-07-17. Every failure was an early-stage one that skipped everything
behind it, so the backend test suite, `bandit`, `pip-audit`, the coverage gate,
and the production config smoke test had not executed in nine days. Four
independent defects were hiding behind that.

**Shipped.**

- `api/engineering.py` called `get_harness_repository`, `get_loop_repository`,
  and `get_version_repository` without importing them. Both
  `/engineering/metrics/*` endpoints raised `NameError` into a bare
  `except Exception` and returned HTTP 500 unconditionally. Imported the one
  factory actually used and dropped two dead assignments.
- `services/webhook.py` put a `datetime` into a dict passed straight to
  `json.dumps`, so **every** `queue_webhook_delivery` call raised `TypeError`.
  Webhook delivery could never have worked. Now an ISO string, matching what
  the queue consumer already expected.
- `docker-compose.prod.yml` defined `volumes:` twice on the `backup` service.
  The file failed to parse, and the second key would have dropped the
  `mongo_data` and `backup_data` mounts the backup cron writes to. Merged.
- `backend/requirements.txt` never declared `authlib` (imported by
  `api/auth.py` for GitHub OAuth) or the `pydantic[email]` extra (needed by
  `EmailStr` in the same file). `import main` failed in any clean environment,
  which means the production image was broken too.
- 69 + 2 `ruff` violations cleared across backend and orchestrator, the gate
  that was masking all of the above.
- `apply_retention_ttl_indexes` awaited its 8 `create_index` calls
  sequentially, each burning the full 5s server-selection timeout when MongoDB
  is unreachable — 40s, defeating the concurrency the adjacent index batch was
  explicitly written to achieve. Now gathered concurrently.
- Six pre-existing test failures fixed: Google OAuth routes registered in
  `PUBLIC_ROUTES`; the versioning test rewritten against the OpenAPI schema
  (FastAPI 0.139 replaced flattened `.routes` with lazy `_IncludedRouter`
  placeholders, so the old traversal silently matched nothing); webhook worker
  tests given a real loop exit; AI gateway tests kept off live Mongo.

**Result.** Backend 732 passed / 8 skipped, coverage 68.08% against the 60%
gate, suite runtime 152s → 36s. Orchestrator 15 passed. Both lint gates clean,
`import main` clean, production compose validates.

**Second pass, same day.** Pushing the above let CI reach steps it had not run
in nine days, and three more real defects surfaced immediately — each one had
been sitting behind an earlier failure:

- `pip-audit` reported **8 vulnerabilities in `gitpython` 3.1.50**, the last
  fixed in 3.1.55. Bumped; the scan is now clean (2 ignored, both pre-existing
  pins). `bandit` passed.
- The orchestrator's lint step died with **exit 127, `ruff: command not found`**
  — `orchestrator/requirements.txt` never declared `ruff` even though the job
  runs it. So that job has never actually linted anything. Added, pinned to
  match the backend.
- `prod-artifacts` got past compose validation and built the image, then
  claimed `backend/Dockerfile is missing HEALTHCHECK`. **The Dockerfile has
  one.** The check greps `{{.Config.Healthcheck}}` for `Cmd`, but Go renders
  field values, so a configured healthcheck prints as `{[CMD-SHELL ...] ...}`
  and the string `Cmd` never appears. The assertion could never have passed.
  Rewritten to test the template's own truthiness.

**Third pass, same day.** Each repair let CI reach further and expose the next
masked defect. Three more, all in the workflow itself, none of which had ever
executed:

- The backend's `import main` smoke test ran with `CI_TEST_MODE` but not
  `TESTING`. `core/config.py` only substitutes a dummy `jwt_secret` when
  **both** are set, and the `JWT_SECRET` repository secret resolves to an empty
  string, so the step aborted on `jwt_secret is required and must not be
  empty`. It checks that the import graph is clean, not that production secrets
  exist, so it now runs under the same no-live-services contract as the tests.
- The orchestrator test step died with **exit 4** (pytest usage error):
  `pytest-timeout` was never declared, so `--timeout=30` was an unrecognised
  argument. Declared alongside `ruff`.
- The production config smoke test failed with `-e: command not found`. Its
  `MONGODB_URL` contains a literal `&` and was unquoted, so bash treated it as
  a control operator — backgrounding the half-built `docker run` and trying to
  execute the remaining `-e ...` lines as commands. Quoted.

Confirmed working from the same run: lint clean, `bandit` clean
("No issues identified"), `pip-audit` clean, and the rewritten HEALTHCHECK
assertion passed.

**Fourth pass, same day.** Backend, Review Board, and Frontend all went green —
the backend suite and coverage gate ran in CI for the first time since
2026-07-17, and Review Board passed for the first time at all, having never
had `ruff` installed. One more masked defect in `prod-artifacts`: the
"Verify frontend dist contains entry point" step built the frontend twice and
the *second* build omitted the `--build-arg` flags the Dockerfile requires —
which the very next step asserts. That build failed, `2>/dev/null` swallowed
the error, `BUILD_IMG` came back empty, and `docker run --rm ""` surfaced as
`invalid reference format` rather than as a build failure. Now captures the id
from the single already-correct build, with an explicit empty check so a future
failure stays legible.

**Not fixed.** Everything under Technical backlog above, most importantly the
`secret-scan` workflow — red on `main` since 2026-07-17 for false positives,
unrelated to this branch, and deliberately left for a reviewed change of its
own rather than being bundled into a CI repair.

**Verification caveat.** The HEALTHCHECK fix is the one change here not
verified locally: this container has no Docker daemon (`docker compose config`
is client-side only). The reasoning is in the step's comment; CI is the check.

**Next run: Business.**
