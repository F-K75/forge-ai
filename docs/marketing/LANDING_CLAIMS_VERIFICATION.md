# Landing page claims: verification

Checked 2026-11-27 against the code on `claude/nice-thompson-2qjp9a`. Copy lives in
`frontend/src/components/landing/landingContent.ts` (stats, steps, plans, FAQ) plus the
feature cards in `FeatureCarousel.tsx`, the lifecycle band in `ProofSection.tsx`, the hero in
`LandingHero.tsx` and the pricing footnote in `PricingSection.tsx`. Paths below are relative
to `backend/` unless they start with `frontend/` or `docs/`.

Verdicts: **True** = kept. **Partial** = reworded to what the code does. **False** = removed
or replaced.

## Product facts (STATS, hero, feature cards)

| Claim | Verdict | Evidence | Action |
|---|---|---|---|
| 40 skills in the engine | True | 40 `skills/*/SKILL.md` directories | Kept |
| 9 skill domains | True | `core/skill_engine.py:27` (`SkillDomain`, 9 members) | Kept |
| Skills routed by task, permissions checked | True | `core/skill_engine.py:634` (`route_for_task`), `:47` (`SkillPermissionError`) | Kept |
| 9 cloud model providers | False (8) | `core/llm/router.py:1320-1402` registers Anthropic, OpenAI, OpenRouter, Gemini, Groq, Together, Mistral, Azure OpenAI. The audit's "9" counts Ollama, which is self-hosted | Stat now 8, note "Plus Ollama, vLLM and LiteLLM"; FAQ and feature card say eight |
| Self-hosted models via Ollama, vLLM, LiteLLM | True | `core/llm/router.py:1376-1386`, `providers/openai_compatible.py:1-10`, `core/config.py:40-54` | Kept |
| Budgets, rate limits, circuit breakers | True | `core/llm/router.py:17-20`, `core/llm/budget_manager.py`, `rate_limiter.py`, `circuit_breaker.py` | Kept |
| 5 protocols live / 13 planned | Partial (stale) | `api/protocols.py`: MCP `:291`, MCP Apps `:252`, AG-UI `:161`, A2UI `:314`, A2A `:426`, and AI SDK UI stream `:196` (6 with adapters). 13 is the full scope in `docs/VISION_IMPLEMENTATION_AUDIT.md:35-44`, not "planned" on top of the live ones. MCP Apps and A2UI are partial implementations | Stat now `6/13` "Protocols with adapters / in scope"; AI SDK UI added to hero list and feature card |
| Agents: Product Lead, Architect, Designer, engineers, DevOps, Security, QA, Release | True | `core/agent_kernel.py:128-356` (`ORG_BLUEPRINT`) | Kept |
| Governance: "approval gates, a full audit trail and sandboxed worktrees" | Partial | Gate is opt-in: `require_delivery_approval: bool = False` (`core/agent_kernel.py:566`; UI default `frontend/src/components/MultiAgentKernelPanel.tsx:366`). Audit log covers recorded actions (`core/audit.py`), not every step. Git worktrees are off: `WorktreeManager(enable_git_worktrees=False)` (`core/execution_sandbox.py:493`), so tasks get isolated directories | "Optional approval gates, an audit log and isolated workspaces per task" |
| Memory: "company memory, every run starts where the last left off" | Partial | Knowledge fabric is project-scoped (`core/knowledge_fabric.py:7`, `:323`), fed into runs (`core/agent_kernel.py:1133`, `:1521`), persisted and hydrated at startup (`api/enterprise.py:38-48`, `main.py:172-174`). Not organisation-wide | "persist as project memory" |
| Hero: "stops for your approval where it matters" | Partial | Gate is opt-in (above) | "can stop for your approval" |

## Lifecycle steps (STEPS, ProofSection)

| Claim | Verdict | Evidence | Action |
|---|---|---|---|
| Plan: you review the plan before any code is written | Partial | Plan approval exists (`api/initiatives.py:597`, PRD approvals `:664-690`) but builds are not blocked on it | "You can review and approve the plan before any code is written" |
| Build: each engineer works in its own sandboxed git worktree | Partial | Per-task lease (`core/execution_sandbox.py:104-160`) but in `isolated_dir` mode by default (`:493`) | "its own isolated workspace" |
| Verify: "Nothing merges unverified"; type checks, tests and reviews on every change | Partial | Allowlisted profiles only: `python_syntax`, `security_hygiene`, `python_unittest`, `containerized_python_syntax` (`core/execution_sandbox.py:362`), run when a task returns a profile and files (`core/agent_kernel.py:2130-2146`). No type checker. Repair loop: `max_repair_rounds: int = 2` (`:565`). Forge has no merge step | Title "Every change gets checked."; body names syntax, tests and a security scan, plus a repair round |
| Ship: waits at the gate; decision goes to audit log and company memory | Partial | Gate opt-in (`core/agent_kernel.py:566`, `:1204-1219`); gate decisions are audit-logged (`api/kernel.py:327-370`); the run outcome, not the gate decision, goes to the decision log (`core/agent_kernel.py:2291`) | Title "Ship behind an optional approval gate."; body says what is recorded where |
| ProofSection Ship: "Verified changes wait at an approval gate ... full audit trail" | Partial | As above | "Checked changes can wait at an approval gate, and every decision is written to the audit log." |

## Pricing (PLANS, PricingSection)

| Claim | Verdict | Evidence | Action |
|---|---|---|---|
| No credit card required to start | True | Register takes email, name, password only and grants `free_credits` (`api/auth.py:371-390`); Google sign-up the same (`api/auth.py:1220`); first build unmetered (`api/builds.py:133-155`); no Stripe/Razorpay/Cashfree call before a paid upgrade (`api/billing.py:285-300` is checkout only). `trial_ends_at` is never set at signup (`core/models.py:130`), so the trial check (`api/builds.py:92`) does not fire. Building does require a verified email (`api/builds.py:100-105`) | Kept |
| Free: 10 credits at signup, first build free, 1 project | True | `core/config.py:167`, `api/billing.py:80-96`, `api/builds.py:133-155`, project limit enforced `api/projects.py:114-117` | Kept |
| Standard $20/mo, $200/yr, 100 credits/mo; Pro $50/mo, $500/yr, 750 credits/mo | Partial: prices match, **monthly credits are never granted** | Prices `core/config.py:163-169`, `api/billing.py:97-129`, yearly = 10x monthly (`:103`, `:119`). But no code adds plan credits: Stripe `checkout.session.completed` only sets `plan` and logs `credits_granted` (`api/billing.py:464-470`); `invoice.payment_succeeded` only marks the invoice paid (`:517-527`); Razorpay/Cashfree subscription events only update status. The only credit increments are credit-pack purchases (`api/billing.py:942`, `api/razorpay.py:219`, `api/cashfree.py:336`) | Copy kept (it matches the billing config) but **billing must be fixed before launch** to grant the monthly allowance on activation and renewal |
| BYOK on Pro | True | Enforced for Pro and Enterprise, Anthropic or OpenAI-compatible only (`api/auth.py:930-955`) | FAQ now says "Pro and Enterprise" and which providers |
| Credit packs available any time | True | `api/billing.py:153-158`, `:597` | Kept |
| Enterprise custom credit volume | True | `api/billing.py:130-150` (`custom_pricing`) | Kept |
| Unlimited projects / All agents / support tiers | True / not code-checkable | `max_projects: -1` (`api/billing.py:111`, `:128`); support levels are an operational promise | Kept |

## FAQ

| Claim | Verdict | Evidence | Action |
|---|---|---|---|
| Agents plan as a task graph, build in parallel, verify, prepare releases; visible live | True | Kernel waves/DAG (`core/agent_kernel.py`), AG-UI stream (`api/protocols.py:161`) | Kept |
| Approval gates in front of merging or deploying; sandboxed git worktrees; nothing touches main until approved | Partial | Gate opt-in and before delivery only (above). Agents never push: the only push is the user-triggered `POST /deployments/github/push` (`api/deployments.py:450`), which defaults to `main` (`:106`). No git worktrees by default | Rewritten: agents never push on their own, opt-in delivery gate, gate decisions audit-logged, isolated workspace per task |
| Nine cloud providers incl. 8 named | False (8) | See providers row | "eight cloud providers (...)" |
| Pro plans can bring their own API keys | Partial | Pro and Enterprise; Anthropic or OpenAI-compatible only (`api/auth.py:930-955`) | Reworded |
| Secrets are encrypted at rest | Partial | `core/encryption.py` (Fernet, dedicated `FIELD_ENCRYPTION_KEY`, rotation in `docs/FIELD_ENCRYPTION_KEY_ROTATION.md`) is used for GitHub token (`api/auth.py:397`, `:928`), BYOK LLM key (`:955`), TOTP secret (`:624`) and initiative prompt/goals/risks and PRD fields (`api/initiatives.py:33-75`). Forge API keys are SHA-256 hashed (`api/api_keys.py:41`). Outgoing webhook signing secrets are stored in plaintext (`api/webhooks.py:69`) | "stored credentials (your GitHub token, your own LLM API key and your 2FA secret) are encrypted at rest; Forge API keys are stored only as hashes" |
| Export or delete project data at any time | Partial | Account-level only: `GET /gdpr/export` (`api/gdpr.py:344`) and `DELETE /gdpr/delete` (`:370`) cover user, projects, builds, files, messages, initiatives and their artifacts, sprints, billing and the collections in `_DIRECT_USER_COLLECTIONS` (`:152-167`). Deleting a single project is a soft delete (`api/projects.py:220`). Not covered by export or delete: `kernel_runs`, `knowledge_fabric_nodes`, project-keyed `decision_log` entries, `semantic_chunks`, `mcp_audit_logs` | "export your account data, or delete your account with its projects and builds". Follow-up: extend the GDPR cascade to the kernel and memory collections |
| Company memory scoped to your organisation | False (project) | `core/knowledge_fabric.py:7`, `:323` | "scoped to each project" |
| Self-host with Docker Compose and Kubernetes (API, workers, MongoDB, Redis) | True | `docker-compose.yml`, `docker-compose.prod.yml`, `k8s/*.yaml`; MIT `LICENSE` | Kept |
| Credits: every plan includes a monthly allowance | False for Free | Free is a one-time grant (`core/config.py:167`); paid allowance not granted in code (pricing row) | "Free accounts get 10 credits at signup and their first build free; paid plans include a monthly allowance" |
| Yearly = ten months; Enterprise custom volume; credit packs | True | `api/billing.py:103`, `:119`, `:130-158` | Kept |

## Open issues found (not marketing copy)

1. **Monthly plan credits are never granted** (pricing row). Highest priority.
2. GDPR export/delete misses kernel runs, memory nodes, project-keyed decision log entries, semantic chunks and MCP audit logs.
3. Outgoing webhook signing secrets are stored unencrypted.
4. `docs/VISION_IMPLEMENTATION_AUDIT.md` is stale: it says vLLM/LiteLLM and the AI SDK UI stream do not exist, but both do now.
