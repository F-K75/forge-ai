# TODOS

## Worker metrics exposure for optimizer fleet ratios

- **What:** Expose Celery-worker Prometheus metrics (worker `/metrics` endpoint, Pushgateway, or Redis aggregate) so optimizer Counters are fleet-scrapeable.
- **Why:** API-process `/metrics` never sees worker-side optimizer events; PromQL “fleet” ratios are false until workers are scraped or metrics are centralized.
- **Pros:** Honest cache-hit / compression dashboards; unblocks finishing revised 4B properly.
- **Cons:** Deploy/Helm/ops surface; not required for CB/concurrency correctness.
- **Context:** Surfaced in `/plan-eng-review` (2026-08-01) + Codex outside voice. See plan `keshav-main-backend-reliability-plan-20260801-024334.md`. Start at `backend/core/metrics.py` and current worker deployment manifests.
- **Depends on / blocked by:** Can ship reliability slice without this. Do after CB/concurrency/gateway schema PR lands.
- **Status:** done — workers publish snapshots to Redis and the API `/metrics` aggregates them (`backend/core/fleet_metrics.py`).
- **Added:** 2026-08-01

## Optimize-before-cache / response-cache rekey

- **What:** Change optimizer pipeline so response-cache hits can skip full context optimize/truncate, without breaking tenant-scoped cache keys (rekey on raw messages or carefully designed dual-key).
- **Why:** Today `optimize_context` always runs before cache lookup (`optimizer/service.py`); cache hits still pay dedupe/truncate CPU. Q3 + eng-review 14C.
- **Pros:** Lower latency/CPU on hot cached prompts.
- **Cons:** Cache-key migration can cause miss storms or incorrect hits; needs careful tenancy tests.
- **Context:** Deferred from reliability slice on purpose. Start at `backend/optimizer/service.py:117-139` and `backend/optimizer/response_cache.py`.
- **Depends on / blocked by:** Independent of CB/concurrency PR; ship as its own perf PR.
- **Status:** done — response cache is checked on the original messages before optimize/truncate (`backend/optimizer/service.py`).
- **Added:** 2026-08-01

## Harness eval for JSON-repair prompt quality

- **What:** Add a small harness eval suite that checks whether the gateway structured-output repair nudge produces schema-valid JSON on representative fixtures (architect/designer/developer).
- **Why:** Eng-review 12B shipped control-flow unit mocks only; repair English/effectiveness is unmeasured and can burn credits on retries.
- **Pros:** Catches weak repair prompts before production; reuses `backend/harness/evaluator.py`.
- **Cons:** Needs fixtures or recorded outputs; live-model CI is costly unless offline.
- **Context:** Repair lives in `backend/gateway/service.py` (`structured_output_schema` + `_repair`). Do after T3 gateway schema wiring in the reliability plan.
- **Depends on / blocked by:** Gateway schemas for hot agents (reliability T3).
- **Status:** done — `backend/harness/json_repair_suite.py` + `backend/tests/test_json_repair_suite.py`.
- **Added:** 2026-08-01

## Gateway schemas for pm / integration / business_model

- **What:** Wire `GatewayRequest.structured_output_schema` (+ one repair) for remaining build-pipeline agents that still bare-`json.loads`: PM, Integration, Business Model.
- **Why:** Same malformed-JSON failure class as architect/designer/developer; deferred from reliability T3 to keep the first wedge small.
- **Pros:** Consistent handoff safety across the full build pipeline.
- **Cons:** More schema maintenance; lower leverage than the three hot agents.
- **Context:** Today `backend/agents/pm.py`, `integration.py`, `business_model.py` hand-roll fence-strip + `json.loads`. Reuse the T3 pattern from the reliability plan.
- **Depends on / blocked by:** Reliability T3 (gateway schema pattern for hot agents) should land first.
- **Status:** done — PM, Integration and Business Model agents use `_call_structured` with schemas from `backend/agents/structured_schemas.py`.
- **Added:** 2026-08-01

## Persist TemplateRegistry overlay to Mongo

- **What:** Persist prompt template registry CRUD (admin create/update/delete) to MongoDB instead of a process-local overlay.
- **Why:** Q3 architecture review P2 — template edits don’t survive restart and don’t sync across API workers.
- **Pros:** Multi-worker template consistency; durable admin UX.
- **Cons:** Needs migration + invalidation; not on the LLM reliability hot path (CB/concurrency).
- **Context:** `backend/prompt_builder/registry.py`; reuse `core/migrations.py`. Independent of the reliability slice.
- **Depends on / blocked by:** None hard; schedule after reliability PR if capacity allows.
- **Status:** done — overlay persisted in `backend/prompt_builder/persistence.py`, hydrated at startup in `backend/main.py`.
- **Added:** 2026-08-01

## Regenerate: enqueue before deleting plan artifacts

- **What:** Reorder `regenerate_initiative` so `generate_initiative_plan.delay(...)` is enqueued before (or owns) the `prds/epics/stories/tasks/sprints` deletes, or move deletes into the worker.
- **Why:** Current order deletes-then-enqueues. If the enqueue raises (Redis down), the `except` refunds credits but the plan artifacts are already wiped — user loses the plan and no regeneration starts.
- **Pros:** Closes the data-loss window; credits and artifacts stay consistent on enqueue failure.
- **Cons:** Reordering creates new edge cases (stale artifacts visible between enqueue and delete) that need tests.
- **Context:** Surfaced in `/plan-ceo-review` re-audit (2026-08-15). Code at `backend/api/initiatives.py:381-409`; refund already works, only the artifact delete timing is wrong.
- **Depends on / blocked by:** None; independent of the credit-charging change that shipped.
- **Status:** done (2026-11-13) — deletes moved into the worker (`_replace_plan_artifacts` in `backend/tasks/pm_tasks.py`); old plan is kept until the new one is generated.
- **Added:** 2026-08-15
