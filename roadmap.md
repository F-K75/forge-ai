# Forge AI — Product Roadmap

> **Status:** Living document. Phases 0–7 reflect what is already built in this repository
> (verified against `README.md`, `docs/ARCHITECTURE.md`, `PRODUCTION_READINESS_AUDIT.md`,
> and the actual `backend/`, `frontend/`, `orchestrator/`, `orchestration/` trees).
> Phases 8+ are planned work, sequenced against the North Star below.

---

## North Star

**"From idea to operating business, with AI doing the work."**

Forge AI's vision is to become the autonomous software company that turns an idea into a
production-ready *business*, not just a codebase. Today, building software means stitching
together product managers, designers, engineers, DevOps, QA, and business judgment. Forge AI
collapses that into an AI-native development organization: specialized agents that build,
challenge assumptions, validate, ship, and continuously improve — without a human manually
orchestrating every step.

Forge is not positioned as:
> ❌ "AI that writes code."

Forge is positioned as:
> ✅ "AI that builds and operates software businesses."

That requires the system to reason about more than source code — Product, Business, Design,
Engineering, Quality, Security, Infrastructure, Economics, Analytics, and Iteration all have
to be first-class concerns, not afterthoughts bolted onto a code generator.

### The three stages

| Stage | Description | Forge AI status |
|---|---|---|
| **1. AI Coding Agent** | Writes software from a prompt | ✅ Complete (Phase 1) |
| **2. AI Software Factory** | Coordinates specialized agents to build, test, review, and ship software | ✅ Mostly complete (Phases 1–7); hardening in Phase 8 |
| **3. AI Business Builder** | Understands the business objective and autonomously executes toward measurable outcomes — validates demand, ships, watches real-world signal, and decides what to build next | 🔲 Not started — **this is the real destination** |

The roadmap below is organized so that reaching Stage 3 is a visible, tracked destination
(Phase 12) rather than an implicit hope. Phases 9–11 harden and commercialize the Stage 2
factory; Phase 12 is where Forge starts becoming the thing described in the North Star.

### The long-term picture

A user should eventually be able to say:

> "Build me a SaaS product for automating financial reporting for mid-sized companies."

...and Forge, not the human, walks the full chain:

1. Challenge the business idea
2. Identify the target customer
3. Define the narrowest viable wedge
4. Create the product specification
5. Design the UX
6. Architect the system
7. Build the application
8. Integrate required services
9. Test and validate it
10. Run security and release checks
11. Deploy it
12. Monitor usage, errors, and costs
13. Learn from real-world signals
14. Decide what should be built next

The human becomes the decision-maker and owner; Forge becomes the execution engine. Steps
4–11 are largely built today (Phases 1–7). Steps 1–3 and 12–14 — validating *whether* and
*what* to build, and closing the loop after launch — are the gap between where Forge is now
and the North Star, and are the explicit focus of Phase 12.

---

## Phase 0 — Foundation & Platform Skeleton
**Goal:** Ship a deployable, authenticated full-stack platform with persistent storage.

| # | Capability | Evidence in repo | Status |
|---|-----------|-----------------|--------|
| 0.1 | FastAPI backend + React 18 + Vite + TypeScript frontend | `backend/main.py`, `frontend/` | ✅ Done |
| 0.2 | MongoDB (Motor) + Redis + Celery worker | `backend/core/database.py`, `backend/celery_app.py`, `docker-compose*.yml` | ✅ Done |
| 0.3 | Docker Compose (dev / staging / prod) + Kubernetes manifests | `docker-compose.yml`, `docker-compose.prod.yml`, `docker-compose.staging.yml`, `k8s/` | ✅ Done |
| 0.4 | Render + Cloudflare Pages deployment blueprints | `render.yaml`, `CLOUDFLARE_PAGES.md`, `wrangler.toml` | ✅ Done |
| 0.5 | JWT auth + MFA (TOTP) + email verification + password reset | `backend/api/auth.py`, `backend/auth.py` | ✅ Done |
| 0.6 | GitHub OAuth + Google OAuth | `backend/api/auth.py` (`/auth/google`, `/auth/google/callback`) | ✅ Done |
| 0.7 | Organizations, members, roles, invitations | `backend/api/auth.py` org routes + `backend/core/permissions.py` | ✅ Done |
| 0.8 | Field-level encryption + secrets rotation runbook | `backend/core/encryption.py`, `docs/FIELD_ENCRYPTION_KEY_ROTATION.md` | ✅ Done |
| 0.9 | Versioned DB migrations + rollback | `backend/core/migrations.py` (`@downgrade`, `run_downgrades`) | ✅ Done |
| 0.10 | Health endpoints, Prometheus `/metrics`, Sentry, correlation IDs | `backend/main.py`, `backend/core/metrics.py` | ✅ Done |
| 0.11 | Pre-commit secret-scanning git hook | `scripts/install-git-hooks.sh`, `scripts/git-hooks/pre-commit` | ✅ Done |

---

## Phase 1 — Core AI Build Pipeline *(Stage 1: AI Coding Agent)*
**Goal:** Turn a natural-language prompt into a generated full-stack app, streamed live.

| # | Capability | Evidence in repo | Status |
|---|-----------|-----------------|--------|
| 1.1 | Multi-agent build pipeline: Architect → Designer → Developer → Integration → PM → Business Model | `backend/agents/` (7 agent modules), `backend/core/orchestrator.py` | ✅ Done |
| 1.2 | WebSocket build streaming (`agent_start`, `file_update`, `stream_token`, `build_complete`, `build_failed`) | `backend/services/ws_manager.py`, `frontend/src/hooks/useBuildSocket.ts`, `frontend/src/lib/wsContract.ts` | ✅ Done |
| 1.3 | Celery-enqueued builds with dead-letter queue + admin retry | `backend/tasks/build_tasks.py`, `/admin/builds/dead-letter` | ✅ Done |
| 1.4 | Self-healing debug loop (up to 3 iterations against sandbox errors) | `backend/core/orchestrator.py` debug loop + `backend/sandbox/runner.py` | ✅ Done |
| 1.5 | Sandbox validation: syntax + import checks + content moderation + CSP injection | `backend/sandbox/` (`runner.py`, `moderation.py`, `csp.py`) | ✅ Done |
| 1.6 | Credit-based usage enforcement + plan tiers (Free / Standard / Pro) | `backend/core/config.py`, `/billing/credits/purchase` | ✅ Done |
| 1.7 | Generated app tech stack: React 18 + Vite + TS + Tailwind + FastAPI + Motor + JWT + Docker | `backend/agents/developer.py` output templates | ✅ Done |
| 1.8 | Build rollback to prior version | `POST /builds/{build_id}/rollback/{version}` | ✅ Done |

*Covers North Star steps 7–8 (build, integrate). The Business Model agent (1.1) is an early*
*signal toward Stage 3 but does not yet drive decisions — see Phase 12.*

---

## Phase 2 — AI Gateway Runtime *(Stage 2: AI Software Factory)*
**Goal:** Systematically improve prompt quality, context selection, and output reliability.

| # | Capability | Evidence in repo | Status |
|---|-----------|-----------------|--------|
| 2.1 | Prompt Builder: provider-agnostic dynamic prompt assembly | `backend/prompt_builder/` (`builder.py`, `registry.py`, `context_selector.py`, `validator.py`, `templates/`) | ✅ Done |
| 2.2 | Prompt Builder REST API (build / preview / validate / estimate-tokens / template CRUD) | `backend/api/prompts.py`, `/v1/prompts/...` | ✅ Done |
| 2.3 | Prompt Engineer: composition, few-shot, versioned history, optimizer | `backend/prompt_engineer/` | ✅ Done |
| 2.4 | Context Engineer: retriever + scorer + window manager + assembler | `backend/context_engineer/` | ✅ Done |
| 2.5 | Optimizer: prompt/response cache, context optimizer, cost estimator | `backend/optimizer/` | ✅ Done |
| 2.6 | Retrieval: embeddings + vector index for semantic search | `backend/retrieval/` | ✅ Done |
| 2.7 | Harness: evaluator, A/B test, regression, benchmark, metrics | `backend/harness/` | ✅ Done |
| 2.8 | Loop Engineer: controller driving iterative prompt improvement | `backend/loop_engineer/` | ✅ Done |
| 2.9 | Gateway service + guardrails + audit wrapping outbound LLM calls | `backend/gateway/` (`service.py`, `guardrails.py`, `audit.py`) | ✅ Done |
| 2.10 | Engineering plugins wiring Gateway into build/PM pipelines | `backend/engineering_plugins.py`, `backend/engineering_repository.py` | ✅ Done |
| 2.11 | `/engineering` REST API + persistence | `backend/api/engineering.py` | ✅ Done |

---

## Phase 3 — LLM Provider Layer *(Stage 2: AI Software Factory)*
**Goal:** Run any agent on any LLM provider with resilience and cost control.

| # | Capability | Evidence in repo | Status |
|---|-----------|-----------------|--------|
| 3.1 | Provider adapters: Anthropic, OpenAI, OpenRouter, Gemini, Groq, Together, Mistral, Azure OpenAI, Ollama | `backend/providers/` (9 adapters) | ✅ Done |
| 3.2 | Multi-provider LLM router with YAML/env + DB-backed per-agent overrides | `backend/core/llm/router.py`, `/api/llm/agent/{agent}`, `/api/llm/reload` | ✅ Done |
| 3.3 | Global circuit breaker with half-open recovery + graceful degradation | `backend/core/llm/router.py` (`_ProviderHealthTracker` → circuit breaker) | ✅ Done |
| 3.4 | Model fallback chain | `backend/core/llm/router.py` | ✅ Done |
| 3.5 | Hallucination / malformed-response safeguards | `_validate_response()` in `LLMRouter` | ✅ Done |
| 3.6 | Token accounting + cost tracking per user/org + daily budget enforcement | `backend/core/ai_usage.py`, `backend/api/budget.py` | ✅ Done |
| 3.7 | Org-level LLM policy controls | `backend/api/org_llm_policy.py` | ✅ Done |
| 3.8 | BYOK (Bring Your Own Key) for Pro+ users | Billing + provider layer wiring | ✅ Done |

*Note: 3.6 tracks what it costs Forge to run its own AI — the "Economics" pillar of the*
*North Star, applied to a generated business's own unit economics, is a Phase 12 concern,*
*not this layer.*

---

## Phase 4 — Agile PM Layer *(Stage 2: AI Software Factory)*
**Goal:** Turn an idea into a full delivery plan with AI-generated artifacts and sprint execution.

| # | Capability | Evidence in repo | Status |
|---|-----------|-----------------|--------|
| 4.1 | PM orchestration: BA → PRD → Epic → Story → Task → Sprint Planner | `backend/core/pm_orchestrator.py`, `backend/agents/` (PM agent family) | ✅ Done |
| 4.2 | Initiatives API + WebSocket streaming | `/initiatives`, `/initiatives/ws/{id}`, `backend/services/pm_ws_manager.py` | ✅ Done |
| 4.3 | Epics / Stories / Tasks CRUD + status transitions | `/epics`, `/stories`, `/tasks` | ✅ Done |
| 4.4 | Task execution agent + GitHub link + webhook | `backend/agents/task_executor.py`, `/tasks/{id}/execute`, `/tasks/{id}/github-link`, `/github/webhook` | ✅ Done |
| 4.5 | Sprints: standups, reviews, retros, risk reports, tech-debt reports | `/sprints/{id}/standup`, `/review`, `/retro`, `/risk-report`, `/tech-debt` | ✅ Done |
| 4.6 | Releases API | `/releases` (`POST /generate`, CRUD) | ✅ Done |
| 4.7 | Agent execution records + registry | `/agent-executions`, `backend/api/agent_registry.py` | ✅ Done |
| 4.8 | Frontend PM workspace (initiatives, sprints, kanban, roadmap, analytics, releases) | `frontend/src/pages/pm/` (12 pages) | ✅ Done |

*The BA → PRD chain starts from an already-assumed idea. It does not yet challenge the idea*
*or validate demand (North Star steps 1–3) — that entry point doesn't exist yet. See 12.1.*

---

## Phase 5 — Platform Services & Growth *(Stage 2: AI Software Factory)*
**Goal:** Monetize, grow, and operate the platform at scale.

| # | Capability | Evidence in repo | Status |
|---|-----------|-----------------|--------|
| 5.1 | Dual billing: Stripe + Razorpay (India market) | `backend/api/billing.py`, `backend/api/razorpay.py`, `/billing/webhook`, `/razorpay/webhook` | ✅ Done |
| 5.2 | Subscription lifecycle + credit packs + annual pricing | `/billing/checkout`, `/billing/portal`, `/billing/credits/purchase`, `/billing/cancel`, `/downgrade`, `/reactivate` | ✅ Done |
| 5.3 | Admin console (users, builds, analytics, fraud, feature flags, audit, system health) | `backend/api/admin.py`, `frontend/src/pages/AdminConsole.tsx` | ✅ Done |
| 5.4 | Analytics: event ingestion, funnel, retention, build success, conversion, churn, AI cost, revenue | `backend/api/analytics.py` | ✅ Done |
| 5.5 | Marketplace: publish / browse / download / rate playbooks & templates | `backend/api/marketplace.py`, `frontend/src/pages/MarketplacePage.tsx` | ✅ Done |
| 5.6 | Growth: referrals, in-app notifications, onboarding tracking | `backend/api/growth.py` | ✅ Done |
| 5.7 | API key management | `backend/api/api_keys.py` | ✅ Done |
| 5.8 | Outbound webhooks (SSRF-protected) | `backend/api/webhooks.py` | ✅ Done |
| 5.9 | Deployments: GitHub push, Docker deploy, env vars, logs, custom domain, public URL | `backend/api/deployments.py` | ✅ Done |
| 5.10 | GDPR: full data export + cascade deletion + confirmation email | `backend/api/gdpr.py` | ✅ Done |
| 5.11 | Support tickets | `backend/api/support.py`, `frontend/src/pages/...` (support UI) | ✅ Done |
| 5.12 | Feature flags (admin API + UI) | `backend/core/feature_flags.py` | ✅ Done |
| 5.13 | LLM Management page (model selection, per-agent overrides, reload) | `backend/api/llm.py`, `frontend/src/pages/LLMManagementPage.tsx` | ✅ Done |
| 5.14 | Engineering Health / Optimization dashboards | `backend/api/optimizer.py`, `frontend/src/pages/OptimizationDashboard.tsx`, `EngineeringHealthPage.tsx` | ✅ Done |
| 5.15 | Review Board orchestrator (standalone multi-agent code-review service) | `orchestrator/` (port 8100, agent JSON schema, GO / NO_GO / GO_WITH_FIXES) | ✅ Done |
| 5.16 | Review Board UI | `frontend/src/pages/reviews/` (`ReviewsListPage.tsx`, `ReviewDetailPage.tsx`) | ✅ Done |

*5.4 and 5.9 give Forge monitoring/analytics on itself and on deployment mechanics — North*
*Star step 12 ("monitor usage, errors, costs") applied to the *generated app*, feeding back*
*into what to build next, is not yet wired. That closure is Phase 12.*

---

## Phase 6 — Frontend Experience *(Stage 2: AI Software Factory)*
**Goal:** Make the platform feel like a polished, native-grade desktop app.

| # | Capability | Evidence in repo | Status |
|---|-----------|-----------------|--------|
| 6.1 | Landing page + auth (login / signup / forgot / reset / verify) | `frontend/src/pages/LandingPage.tsx`, `AuthPage.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`, `VerifyEmail.tsx` | ✅ Done |
| 6.2 | Onboarding flow | `frontend/src/pages/Onboarding.tsx` | ✅ Done |
| 6.3 | Apple-style desktop shell (AppShell) | `frontend/src/components/AppShell.tsx` | ✅ Done |
| 6.4 | Animated global background (dot-matrix) | `frontend/src/components/GlobalBackground.tsx` | ✅ Done |
| 6.5 | Agent Fleet Graph (React Flow visualization) | `frontend/src/components/AgentFleetGraph.tsx` | ✅ Done |
| 6.6 | Workspace: 3-panel layout (chat + Monaco editor + live preview) | `frontend/src/pages/WorkspacePage.tsx`, `frontend/src/components/editor/`, `frontend/src/components/preview/` | ✅ Done |
| 6.7 | Project history + versioning UI | `frontend/src/pages/ProjectHistory.tsx` | ✅ Done |
| 6.8 | Prompt Studio | `frontend/src/pages/PromptStudioPage.tsx` | ✅ Done |
| 6.9 | Launch sequence (OS boot animation) | `frontend/src/pages/Launch.tsx` | ✅ Done |
| 6.10 | Settings + Billing pages | `frontend/src/pages/SettingsPage.tsx`, `BillingPage.tsx` | ✅ Done |
| 6.11 | State management (Zustand) + typed WebSocket contracts | `frontend/src/store/`, `frontend/src/lib/wsContract.ts`, `orgWsContract.ts`, `pmWsContract.ts`, `reviewWsContract.ts` | ✅ Done |
| 6.12 | Vitest + TypeScript strict mode + ESLint + Prettier + bundle size monitoring + accessibility tooling | `vitest.config.ts`, `tsconfig.json`, `eslint.config.js`, `.prettierrc.json`, `scripts/check-bundle-size.js` | ✅ Done |

---

## Phase 7 — Production Hardening & Reliability *(Stage 2: AI Software Factory)*
**Goal:** Pass a production readiness audit and operate safely at scale.

| # | Capability | Evidence in repo | Status |
|---|-----------|-----------------|--------|
| 7.1 | Security remediation sprint (35 findings F-001 → F-035) | `PRODUCTION_READINESS_AUDIT.md` — all marked ✅ FIXED | ✅ Done |
| 7.2 | JWT security: env-var secrets, algorithm validation, expiration, blacklist | `backend/core/security.py`, `backend/auth.py` | ✅ Done |
| 7.3 | NoSQL injection sanitization | `backend/engineering_repository.py` (`_sanitize_mongo_value`) | ✅ Done |
| 7.4 | OAuth token exposure fix (HTTP-only cookies) | `backend/api/auth.py`, `frontend/src/pages/GoogleCallback.tsx` | ✅ Done |
| 7.5 | Server-side admin enforcement | `backend/api/admin.py` (`admin_required`) | ✅ Done |
| 7.6 | Multi-worker + Redis pub/sub WebSocket manager | `backend/services/ws_manager.py` (Redis-backed) | ✅ Done |
| 7.7 | Per-IP/per-user rate limiting + per-email login lockout + LRU eviction | `backend/core/security.py` | ✅ Done |
| 7.8 | CSRF protection (JTI-based, Redis-backed) | `backend/core/security.py` | ✅ Done |
| 7.9 | Request timeout middleware (120s) | `backend/main.py` (`timeout_middleware`) | ✅ Done |
| 7.10 | Correlation IDs propagated to HTTP + Celery | `backend/main.py`, `backend/celery_app.py` (`task_prerun`/`task_postrun`) | ✅ Done |
| 7.11 | Feature flags + admin UI | `backend/core/feature_flags.py` | ✅ Done |
| 7.12 | WebSocket event versioning | `WSEvent`, `PMWSEvent`, `WSEventBase` (version field) | ✅ Done |
| 7.13 | Frontend error boundaries + loading states + skeletons | `frontend/src/components/ErrorBoundary.tsx`, `LoadingSpinner`, `Skeleton`, `Suspense` | ✅ Done |
| 7.14 | Bundle size monitoring in CI | `scripts/check-bundle-size.js` + CI step | ✅ Done |
| 7.15 | Accessibility tooling (eslint-plugin-jsx-a11y + @axe-core/react) | `eslint.config.js`, runtime axe integration | ✅ Done |
| 7.16 | Test coverage enforcement (fail-under 60%) | `backend/pyproject.toml` (`[tool.coverage.run]`) + CI gate | ✅ Done |
| 7.17 | Webhook test coverage + billing idempotency tests | `tests/test_webhook_service.py`, `test_billing_idempotency.py`, `test_razorpay.py` | ✅ Done |
| 7.18 | Backup / restore testing in CI | `scripts/test_restore.py` + `backup-restore` CI job | ✅ Done |
| 7.19 | Kubernetes hardening: HPA, pod anti-affinity, immutable tags, graceful drain | `k8s/backend.yaml`, `k8s/celery-worker.yaml` | ✅ Done |
| 7.20 | Production readiness audit score: 82/100 (Conditional GO) | `PRODUCTION_READINESS_AUDIT.md` | ✅ Done |

---

## Phase 8 — Near-Term Hardening (Next 1–4 Weeks) *(Stage 2 → stabilize the factory)*
**Goal:** Close the remaining P2/P3 gaps from the production audit and reliability review.

| # | Capability | Owner / Area | Status |
|---|-----------|-------------|--------|
| 8.1 | Load test: validate 1,000 concurrent users with <500ms p95 latency | Backend + SRE | 🔲 Planned |
| 8.2 | Penetration test: independent security review with no critical findings | Security | 🔲 Planned |
| 8.3 | Execute accessibility tests in CI and fix violations | Frontend | 🔲 Planned |
| 8.4 | Enforce WebSocket auth at connection time (query param / subprotocol) | Backend | 🔲 Planned |
| 8.5 | Expose Celery-worker Prometheus metrics (fleet-scrapeable optimizer ratios) | Backend / Observability | 🔲 Planned |
| 8.6 | Optimize-before-cache: skip full context optimize/truncate on response-cache hit | Backend / Performance | 🔲 Planned |
| 8.7 | Harness eval suite for JSON-repair prompt quality (architect / designer / developer) | AI Gateway | 🔲 Planned |
| 8.8 | Wire Gateway structured-output schemas for PM / Integration / Business Model agents | AI Gateway | 🔲 Planned |
| 8.9 | Persist Prompt TemplateRegistry overlay to MongoDB (survive restart, sync across workers) | AI Gateway | 🔲 Planned |

---

## Phase 9 — Product Experience (Next 1–3 Months) *(Stage 2 → factory polish)*
**Goal:** Differentiate the UX and unblock viral / organic growth.

| # | Capability | Evidence in repo | Status |
|---|-----------|-----------------|--------|
| 9.1 | Custom domain mapping for deployed apps | `backend/api/deployments.py` (`custom domain` endpoint exists; UI/validation pending) | 🔲 Partial |
| 9.2 | Voice mode (Web Speech API) for prompt input | Mentioned in `README.md` roadmap | 🔲 Planned |
| 9.3 | Context window forking (fork build when approaching token limit) | Mentioned in `README.md` roadmap | 🔲 Planned |
| 9.4 | Version history UI (beyond project history — per-file timeline, diff view) | Mentioned in `README.md` roadmap | 🔲 Planned |
| 9.5 | Team workspaces + RBAC | Mentioned in `README.md` roadmap; orgs/roles exist but fine-grained RBAC pending | 🔲 Planned |
| 9.6 | MCP server support for custom integrations | Mentioned in `README.md` roadmap | 🔲 Planned |

---

## Phase 10 — Enterprise Readiness (Next 3–6 Months) *(Stage 2 → monetize the factory)*
**Goal:** Pass enterprise security reviews and land first enterprise logos.

| # | Capability | Evidence in repo | Status |
|---|-----------|-----------------|--------|
| 10.1 | SAML / OIDC / SCIM SSO | ❌ Not started | 🔲 Planned |
| 10.2 | Fine-grained RBAC (beyond org roles) | Org roles exist; resource-level RBAC pending | 🔲 Planned |
| 10.3 | SOC 2 Type II gap assessment + policy creation + control implementation | Roadmap in `FORGE_AI_BUSINESS_AUDIT.md` | 🔲 Planned |
| 10.4 | Penetration test report (annual cadence) | P2 in production audit | 🔲 Planned |
| 10.5 | SLA terms + uptime credits | ❌ Not defined | 🔲 Planned |
| 10.6 | Data Processing Agreement (DPA) + subprocessor list | ❌ Missing | 🔲 Planned |
| 10.7 | Audit log export + immutable retention | `backend/core/audit.py` exists; retention policy + export pending | 🔲 Planned |
| 10.8 | Private cloud / VPC / Private Link deployment option | ❌ Not configured | 🔲 Planned |
| 10.9 | On-premise / air-gapped deployment artifact | ❌ Not configured | 🔲 Planned |
| 10.10 | Incident response runbook + on-call rotation | Partial (`docs/DEPLOYMENT_AND_OPERATIONS.md`); formal IR process pending | 🔲 Planned |

---

## Phase 11 — GTM & Commercial Launch (Parallel Track) *(Stage 2 → sell the factory)*
**Goal:** Convert technical differentiation into revenue and users.

| # | Capability | Evidence in repo | Status |
|---|-----------|-----------------|--------|
| 11.1 | Waitlist / pre-launch landing page + signup flow | `LandingPage.tsx` exists; public-facing waitlist campaign pending | 🔲 Planned |
| 11.2 | Sample apps showcase (50+ generated apps) | Zero sample apps in repo | 🔲 Planned |
| 11.3 | Technical blog + SEO content (5+ posts) | `blog/` has 3 conceptual posts; production content pending | 🔲 Planned |
| 11.4 | Product Hunt + Hacker News launch plan | ❌ Not planned | 🔲 Planned |
| 11.5 | Developer relations (Discord, Twitter/X, YouTube tutorials) | ❌ No public community presence | 🔲 Planned |
| 11.6 | Paid acquisition experiments (Google, Meta) | ❌ Not started | 🔲 Planned |
| 11.7 | Pricing validation + A/B testing (Free tier credit limit, annual discount) | Credit model exists; prices + validation pending (`FORGE_AI_BUSINESS_AUDIT.md`) | 🔲 Planned |
| 11.8 | Enterprise sales playbook + demo environment + CRM | ❌ Not started | 🔲 Planned |
| 11.9 | Customer success function (CSM, knowledge base, NPS tracking) | Support ticket code exists; live CS function pending | 🔲 Planned |
| 11.10 | Referral program activation (code exists, no users yet) | `backend/api/growth.py` referral routes | 🔲 Pending users |
| 11.11 | Positioning shift in messaging: "AI that builds businesses" not "AI that writes code" | Not started — landing page and content currently describe generation, not autonomous execution | 🔲 Planned |

*11.11 is new: the vision explicitly rejects a code-generator narrative. Nothing in the*
*current landing page, blog, or launch plan stakes out the "business builder" framing —*
*without it, GTM sells Stage 1/2 even once Phase 12 work begins.*

---

## Phase 12 — Business Builder Foundations *(Stage 3: AI Business Builder — the North Star)*
**Goal:** Begin closing the loop the vision describes — challenge ideas before building,
and let real-world outcomes drive what gets built next. This is new work; nothing below
exists in the repo today. Sequencing assumes Phases 8–9 (stability) land first.

| # | Capability | What it does | Status |
|---|-----------|--------------|--------|
| 12.1 | Idea validation agent (pre-Architect) | Challenges the business idea, identifies target customer, proposes the narrowest viable wedge — runs *before* PRD/Architect, can push back or ask clarifying questions instead of building immediately | 🔲 Planned |
| 12.2 | Demand-signal research step | Agent does lightweight market/competitor research to surface whether the idea has plausible demand before committing build resources | 🔲 Planned |
| 12.3 | Post-launch monitoring hook for generated apps | Extends 5.9's deployment monitoring to actually watch the *generated app's* usage, errors, and cost-to-run — not just Forge's own metrics | 🔲 Planned |
| 12.4 | Generated-app unit economics tracking | Surfaces what each generated business costs to operate (infra, API costs, etc.) — the "Economics" pillar applied to the output, not just to Forge's own AI spend | 🔲 Planned |
| 12.5 | Iteration agent: "what should we build next" | Closes the loop — reads 12.3/12.4 signal plus user feedback and proposes the next increment, feeding back into the PM layer (Phase 4) as a new initiative | 🔲 Planned |
| 12.6 | Outcome-based pricing pilot | Ties billing (or a tier of it) to verified outcomes — successful deploy, passing Review Board GO, sustained post-launch uptime — rather than credits alone; instruments 5.15's GO/NO_GO and 5.9's deploy-success signal as billing primitives | 🔲 Planned |
| 12.7 | "Decision-maker, not operator" UX | Human-facing surface where the user approves/rejects Forge's proposals at each of the 14 North Star steps, rather than configuring each step manually | 🔲 Planned |

**Exit criteria for Phase 12 (Stage 3 entry):** a user can submit a one-line business idea,
have Forge challenge and scope it, build and ship it, watch it run, and receive an
autonomous proposal for the next iteration — with the human only approving or rejecting
decisions, not orchestrating steps.

---

## Out-of-Scope / Aspirational (No Work Started)
- **Forge Quant** — quant finance product
- **Forge Flow** — workflow automation product
- **Forge Cloud** — managed hosting product
- **Forge Security** — security scanning product
- **Forge Enterprise** — dedicated enterprise SKU
- **Forge Deploy** — standalone deployment platform
- **Mobile apps** (iOS / Android)
- **Desktop / VS Code extension**

---

## How to Read This Roadmap

- **Phases 0–7** are **complete** and reflected in the current codebase. Together they take
  Forge from **Stage 1 (AI Coding Agent)** through most of **Stage 2 (AI Software Factory)**.
- **Phase 8** items are **engineered and planned** but not yet shipped — closing out Stage 2
  reliability gaps.
- **Phases 9–11** are **commercialization work** — polish, enterprise readiness, and GTM for
  the Stage 2 factory. Necessary, but they don't by themselves move Forge toward the vision.
- **Phase 12** is the **first tracked step into Stage 3 (AI Business Builder)** — the actual
  North Star. It's currently unstarted; its purpose in this document is to make sure the
  destination stays visible and isn't crowded out by Stage 2 hardening and sales work.
