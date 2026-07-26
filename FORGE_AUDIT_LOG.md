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

- [ ] **P1 — `bandit` and `pip-audit` results are unreviewed.** Both steps sat
  behind the failing lint gate from 2026-07-17 to 2026-07-26 and never
  executed. The first green run is the first time they report. Triage whatever
  they surface; the `--ignore-vuln` list in `.github/workflows/ci.yml` has 9
  pinned advisories that should be re-checked for patched releases.
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

**Not fixed.** Everything under Technical backlog above. The `bandit` and
`pip-audit` items matter most: they are about to run for the first time in nine
days and nobody has seen their output.

**Next run: Business.**
