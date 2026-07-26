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

- [x] **P1 — `secret-scan` had failed on `main` since 2026-07-17.** A separate
  workflow from `ci.yml`, red on four false positives, none of them credentials:
  three lines in `.claude/skills/design/scripts/{icon,logo}/generate.py` that
  hand the module-level Gemini key *constant* to the client as a bare
  identifier, and one line in `.gitallowed` itself — `git secrets --scan` scans
  the allowlist file, so the entries there trip the very pattern they suppress.
  Fixed with two allowlist entries, each covering a name-to-name reference that
  cannot be a credential under any value.

  Clearing that step then exposed the *next* one, which had never run: a
  grep-based scanner whose pattern definitions had drifted from the
  pre-commit hook they claim to mirror. It flagged any identifier merely
  containing `re_` plus ten characters (two test function names) and every
  environment-interpolated value in `docker-compose.prod.yml`. Re-synced to the
  hook, and both copies gained a widened interpolation allowance — the shared
  pattern recognised the error form but not the default form, so it flagged
  every optional provider key. Verified by running the extracted step body
  against the repo, and with a canary file: real keys, credential URLs and
  unquoted password assignments are all still caught, and a secret hidden in an
  interpolation default is still caught by `git secrets` at the other layer.

  **Note for future runs:** describing these findings in prose re-triggers the
  scanner, so this file's own wording is deliberately indirect. Do not paste
  matched lines verbatim into this log.
- [ ] **P2 — The frontend HEALTHCHECK assertion has the same bug just fixed on
  the backend.** `.github/workflows/ci.yml` still greps `{{.Config.Healthcheck}}`
  for the string `Cmd`, which Go never renders. It is currently unreachable —
  `docker build --target=none` always fails, so the step takes the
  grep-the-Dockerfile branch — but it will misfire the moment that changes.
- [ ] **P1 — De-duplicate the secret-scanner definitions.** The pattern list and
  allowances exist twice, in `scripts/git-hooks/pre-commit` and inline in
  `.github/workflows/secret-scanning.yml`, with a comment claiming they mirror
  each other. They had silently drifted, and the CI copy was the stale one. They
  have been re-synced by hand, which will drift again — extract them into one
  sourceable file that both read.
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

- [x] **P0 — No ICP definition.** §5 flagged the target customer as CRITICAL and
  undefined. Written up in `docs/icp.md`: primary ICP is small/mid digital
  product agencies (2–30 people), India first, with startup teams secondary and
  enterprise deliberately deferred. Framed as falsifiable hypotheses with a
  ranked validation plan, since Forge has zero users and nothing is confirmed.
- [x] **P0 — The free tier could not complete a single build.** Found while writing
  the ICP. A build costs 15 credits (architect 3, designer 2, developer 5,
  integration 2, PM 1, business model 2) plus 2 per debug iteration, but
  `free_credits` is 5 — reduced from 10 to limit abuse, per the comment in
  `backend/core/config.py`. A free user runs out about a third of the way
  through their first build and never sees a finished application, so no
  prospect can evaluate the product before paying. §8 flagged the opposite risk
  (10 credits being too generous) and the correction overshot. Fix by letting
  the first build always complete and metering after it, and by shipping
  pre-built showcase apps so proof does not depend on free credits at all.
  **Fixed:** the first option is implemented — `api/builds.py` claims a one-shot
  `free_build_used` flag before reserving, and an account whose claim succeeds
  builds unmetered. The flag is flipped atomically rather than derived from a
  build count, since two concurrent first requests would both read zero builds.
  Note the reservation is `sum(CREDIT_COSTS) * (len(tech_stack) + 1)` — 17 for a
  bare project and larger with a stack — so the real gap was wider than the flat
  15 first recorded. The showcase-apps option remains open and still worth doing.
- [ ] **P2 — The free-build grant is consumed on start, not on success.** A build
  that fails for platform reasons burns it, and the account cannot retry
  unmetered. Restoring it automatically would let a user farm unmetered builds by
  forcing failures, so the trade is deliberate; the right fix is an admin-side
  reset, which does not exist yet. Revisit if support tickets appear.
- [ ] **P2 — `free_credits` is now vestigial.** With the first build unmetered, a
  new account's 5 credits cannot buy anything: the cheapest possible second build
  reserves 17. Either raise it to something that buys a real build or drop it to
  zero and let the one free build be the whole free tier — but do not leave it at
  a number that looks like a grant and functions as nothing.
- [ ] **P0 — Positioning is undifferentiated.** §2/§7: "autonomous AI software
  engineering platform" does not say why Forge wins, and both `README.md` and
  `landing.html` currently lead with "Your AI Engineering Team" — aimed at
  everyone, therefore at no one. Now unblocked: rewrite against the agency
  persona in `docs/icp.md`, leading with the agile PM layer (which §4 confirms
  no competitor has) and cost per project rather than credits per month.
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

### 2026-07-26 — Track: Business (run 1)

Worked the first Business item: the P0 missing ICP. Written up in `docs/icp.md`.

**Decision.** Primary ICP is small/mid digital product agencies (2–30 people)
building custom apps for external clients, India first. Startup teams secondary;
enterprise and indie developers deliberately deprioritised.

The audit's §5 table ranks enterprise "Highest" on ARPU alone. That ranking is
how a pre-revenue company spends a year losing enterprise deals, so the document
re-ranks by ARPU *against whether Forge can win the segment today* — §4 marks
enterprise readiness "❌ Not ready" and names procurement and legal as gates.
Agencies win on four of Forge's five real advantages, most of all the agile PM
layer: for a solo developer it is overhead, but for an agency the PRD and sprint
plan are billable client-facing artefacts, and §4 confirms no competitor ships
anything equivalent. The shipped pricing curve already fits — Pro is 7.5× the
credits for 2.5× the price ($1.00 vs $3.00 per build), rewarding exactly the
high-throughput buyer an agency is.

Everything is framed as falsifiable hypotheses with a ranked validation plan.
Forge has zero users; presenting any of it as fact would be the same error the
audit is complaining about. Output quality (§4: entirely unproven) gates the
other four tests, because for this ICP one bad client deliverable is
unrecoverable.

**Found while doing it.** The free tier cannot complete a single build — 15
credits required, 5 granted. Logged as a new P0 above. This severs the funnel
for every persona in the document, so the ICP work would have been academic
without catching it.

**Free-tier blocker, resolved same session.** keshav chose "let the first build
complete", so it was implemented rather than left as a decision. `api/builds.py`
claims a one-shot `free_build_used` flag before the credit reservation; on a
successful claim the build reserves zero and runs unmetered. Zero was chosen
deliberately over a larger grant because every refund path already computes
`max(0, reserved - used)`, so a zero reservation neither debits the account nor
credits it back — `tasks/build_tasks.py` needed no changes at all.

The claim is an atomic flag flip, not a build count: two concurrent first
requests would both read zero builds and both go free. Five tests cover it,
including a guard on that mechanism specifically, and all five were checked
against the pre-fix code — three fail there, which is what makes them worth
keeping. Backend now 737 passed at 68.11%.

Two follow-ups were opened rather than silently accepted: the grant is consumed
on start rather than success, and `free_credits` is now vestigial at 5. Both are
in the Technical backlog above.

**Next run: Technical.**
