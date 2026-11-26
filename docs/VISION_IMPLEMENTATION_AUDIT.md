# Forge AI — Vision vs. Implementation Audit

**Date:** 2026-11-26 · **Baseline commit:** `67eff52` (feat(kernel): add multi-agent orchestration kernel)

This audit checks the "Agentic Software Engineering OS" master vision against the code in
this repository. Status levels:

- **Implemented**: the code exists, is mounted in the API, and has passing tests.
- **Partial**: a real foundation exists, but it is much smaller than the vision describes.
- **Not started**: nothing in the code beyond a mention in docs or marketing text.

Verification: I ran 70 tests across 9 suites (kernel, skill engine, protocol gateway, P1
protocols/runtime, decision log + Product Lead, knowledge graph, memory/bench/marketplace,
sandbox runner, execution stream routing). **All 70 passed.**

## 1. Architecture layers

| Vision component | Status | Evidence |
|---|---|---|
| Agent Orchestration Kernel | **Implemented** | `backend/core/agent_kernel.py` (2,320 LOC), `api/kernel.py`, `orchestration/engine/*` (scheduler, dispatcher, state machine, retry, recovery, dependency resolver) |
| Skill Engine | **Partial** | `core/skill_engine.py`: registry, router, dependency resolution, permission validation, telemetry/routing boost, `SKILL.md` directory discovery. **11 built-in skills, not 104.** Called from the kernel (`get_skill_router`) |
| Protocol Gateway | **Partial** | `core/protocol_gateway.py` (881 LOC): MCP Streamable-HTTP client + gateway with invocation audit, MCP Apps spec, AG-UI event broker, A2UI surface builder. `core/a2a_adapter.py`: A2A agent card + task send |
| Evaluation Engine | **Implemented (basic)** | `core/evaluation_engine.py`, `harness/*` (A/B, regression, benchmark) |
| Execution Engine / sandbox | **Implemented** | `core/execution_sandbox.py` (git-worktree or isolated-dir per agent), `sandbox/runner.py`, CSP, moderation |
| Governance Engine | **Partial** | `core/permissions.py`, `core/audit.py`, `gateway/guardrails.py`, approval gates in the kernel, org LLM policy API |
| Model Gateway | **Implemented** | `core/llm/router.py` (1,407 LOC), circuit breaker, budget manager, rate limiter, 9 providers (Anthropic, OpenAI, Azure, Gemini, Groq, Mistral, Ollama, OpenRouter, Together) |
| Context Engine / Company Brain | **Partial** | `core/knowledge_fabric.py`, `agent_registry/knowledge_graph.py`, `repo_memory.py`, `retrieval/*` (embeddings + index), decision log |
| Persistent AI Product Lead | **Implemented (thin)** | `services/product_lead.py` (136 LOC), `api/product_lead.py`, decision extraction |
| Generative Experience Layer | **Partial** | A2UI allowlist has **6 components** (heading, metric_row, checklist, approval_card, conflict_list, eval_table), not 60. Frontend renders them in `KernelInspectorPanel` / `MultiAgentKernelPanel` |
| Infrastructure | **Implemented** | FastAPI, MongoDB, Redis, Celery (`celery_app.py`), Docker Compose (dev/staging/prod), `k8s/` manifests |
| Forge Intelligence Cloud | **Not started** | No vLLM or LiteLLM integration. "vllm" appears only as a provider-preference string and in skill descriptions. Ollama is the only local-model path |

## 2. Protocols

| Protocol | Vision priority | Status |
|---|---|---|
| MCP | P0 | **Implemented**: Streamable HTTP client, tool specs, audited invocation |
| A2UI | P0 | **Partial**: 6-component declarative, XSS-safe surface builder |
| AG-UI | P0 | **Implemented (basic)**: event model + stream broker wired into the kernel |
| MCP Apps | P1 | **Partial**: spec dataclass (`mcp-apps/v1`) only |
| A2A | P1 | **Partial**: agent card + task request/response adapter |
| AI SDK UI Stream | P1 | **Not started** |
| ACP, WebMCP, OASF | P2 | **Not started** (no code references) |
| ANP, AP2, x402, UCP | P3 | **Not started** (no code references) |

## 3. Agent organisation

| Vision department | In code |
|---|---|
| Leadership | Orchestrator, Product Lead ✔ · Engineering Manager ✘ |
| Business | Business Analyst, Business Model, PM, Research ✔ |
| Architecture | Architect ✔ (one role, not separate Solution and System Architects) |
| Design | Designer ✔ · UX Researcher ✘ |
| Engineering | Developer, Task Executor ✔ · Frontend, Backend and AI Engineer exist as `.agents/agents/*.md` definitions for coding agents, not as runtime agents |
| Infrastructure | DevOps ✔ · Cloud and Reliability Engineers ✘ |
| Security | Security ✔ · separate Security Auditor ✘ |
| Quality | QA ✔ · Independent Reviewer (definition only) |
| Delivery | Scrum Master, Sprint/Epic/Story generators, releases API ✔ · Release Manager and Documentation agents ✘ |

Runtime agents: 22 modules in `backend/agents/`. Agent registry, workload, ownership,
team chat and PR workflow are in `backend/agent_registry/`.

## 4. Expanded capabilities

| Capability | Status |
|---|---|
| Parallel engineering via worktrees | **Implemented**: `isolate_worktrees` kernel option, `execution_sandbox.py` |
| Self-healing (bounded retries) | **Partial**: retry with backoff in the kernel and `orchestration/engine/retry_engine.py`. No automated diagnose-and-repair loop |
| Repository intelligence | **Partial**: repo memory, knowledge graph, embeddings retrieval. No dependency or architecture mapping found |
| Universal Skill SDK (shared with Claude Code/Codex) | **Partial**: 8 `SKILL.md` skills mirrored in `.claude/skills` and `.agents/skills`, and the engine can discover `SKILL.md` directories |
| Agent/skill marketplace | **Partial**: `core/skill_marketplace.py`, `api/marketplace.py` |
| Financial governance | **Implemented**: billing (Razorpay, Cashfree), credits, credit alerts, budget API, LLM budget manager, AI usage accounting |
| Enterprise governance | **Partial**: audit logs, permissions, approval gates, GDPR, enterprise API |
| Continuous improvement | **Partial**: skill outcome telemetry feeds a routing boost. No controlled learning loop |

## 5. Corrected status table

| Component | Vision doc said | Actual |
|---|---|---|
| Existing multi-agent platform | Previously reported implemented | **Confirmed implemented** |
| 104-skill architecture | Proposed | **Taxonomy built** (all 9 domains in `SkillDomain`). 11 skills exist, about 10% of 104 |
| Universal Skill Engine | Architecture proposed | **Implemented core**: discovery, routing, dependencies, permissions, telemetry |
| A2UI and generative UI | Integration planned | **Partial**: 6 of 60 components |
| Expanded protocol gateway | Integration planned | **Partial**: MCP, AG-UI and A2A adapters exist. 8 of 13 protocols have no code |
| Forge Intelligence Cloud | Conceptual | **Confirmed conceptual** |
| Full autonomous organisation | Expansion roadmap | **Partial**: about 60% of the roles exist as runtime agents |

## 6. Recommended next steps (in vision priority order)

1. Expand A2UI from 6 to about 15 components that cover the nine agent surfaces before targeting 60.
2. Grow the skill catalogue past 11, preferably as `SKILL.md` files loaded through `discover_from_directory` rather than hard-coded `BUILTIN_SKILLS`.
3. Promote MCP Apps and A2A from data models to end-to-end flows with integration tests.
4. Add a LiteLLM or vLLM provider to start the Intelligence Cloud track.
5. Defer the P2/P3 protocols until there is a concrete use case.
