// Generated from backend/skills/*/SKILL.md for demo mode. Regenerate when the
// catalogue changes. Mirrors GET /v1/projects/{id}/skills/{name}.
import type { SkillManifest } from "../kernelApi"

export interface SkillManifestWithInstructions extends SkillManifest {
  instructions: string
}

export const DEMO_SKILL_CATALOG: SkillManifestWithInstructions[] = [
  {
    "name": "accessible-design-systems",
    "domain": "design_tools",
    "description": "Semantic design tokens, WCAG AA contrast, keyboard navigation, and responsive grid layouts.",
    "version": "1.0.0",
    "keywords": [
      "ui",
      "ux",
      "design",
      "token",
      "component",
      "layout",
      "accessibility",
      "wcag",
      "dashboard",
      "tailwind"
    ],
    "dependencies": [],
    "required_permissions": [
      "read_repo"
    ],
    "allowed_departments": [
      "design",
      "engineering"
    ],
    "source_path": "backend/skills/accessible-design-systems/SKILL.md",
    "origin": "builtin",
    "instructions": "Use semantic CSS tokens instead of hardcoded colors, enforce WCAG AA contrast, and ensure full keyboard navigability.\n\n## Tokens & components\n- [ ] Three token layers: primitives (`blue-600`), semantic (`color-action-primary`), component (`button-bg`).\n- [ ] Components reference semantic tokens only; no raw hex values or magic pixel numbers.\n- [ ] Spacing and type follow a fixed scale; dark mode is a token swap, not a fork.\n- [ ] Each component documents variants, states, props, and do/don't usage.\n- [ ] Reuse existing components before creating new ones; extend via variants.\n\n## Accessibility\n- [ ] Text contrast >= 4.5:1 (3:1 for large text and UI boundaries) in every theme.\n- [ ] Every interactive element is reachable and operable by keyboard with a visible focus ring.\n- [ ] Use native elements (`button`, `a`, `label`) before ARIA; add ARIA only to fill gaps.\n- [ ] Inputs have associated labels; errors are announced and linked to fields.\n- [ ] Dialogs trap focus, close on Escape, and return focus to the trigger.\n- [ ] Do not convey meaning with color alone; respect `prefers-reduced-motion`.\n- [ ] Touch targets are at least 24x24 CSS px (44 recommended).\n\n## Pitfalls\n- `div` click handlers with no role, tab stop, or key handling.\n- Placeholder text used as the only label."
  },
  {
    "name": "agent-failure-recovery",
    "domain": "agent_engineering",
    "description": "Detecting stuck or failing agents and recovering with bounded repair loops, critique, escalation, and safe stops.",
    "version": "1.0.0",
    "keywords": [
      "self-heal",
      "self-healing",
      "repair loop",
      "critique",
      "stuck",
      "infinite loop",
      "agent failure",
      "recover",
      "escalat",
      "max iterations",
      "guardrail",
      "human-in-the-loop"
    ],
    "dependencies": [
      "multi-agent-orchestration",
      "error-handling-resilience"
    ],
    "required_permissions": [
      "read_repo",
      "read_blackboard"
    ],
    "allowed_departments": [
      "engineering",
      "architecture"
    ],
    "source_path": "backend/skills/agent-failure-recovery/SKILL.md",
    "origin": "builtin",
    "instructions": "Assume agents will fail: detect it from objective signals, repair within a fixed budget, and escalate to a human with context instead of looping.\n\n## Checklist\n- [ ] Define failure signals: failing tests, schema-invalid output, repeated identical actions, no progress.\n- [ ] Cap iterations, repair rounds, tool calls, tokens, and wall-clock time per task.\n- [ ] Detect loops by hashing recent actions/outputs and stopping on repeats.\n- [ ] Feed the concrete failure (error text, failing test) into the repair prompt, not a vague \"try again\".\n- [ ] Use a separate critic/reviewer role to judge outputs against acceptance criteria.\n- [ ] Roll back partial side effects or mark them clearly when a task is abandoned.\n- [ ] Escalate to a human with a summary: goal, attempts, last error, suggested next step.\n- [ ] Record failure categories so recurring ones become eval cases or new guardrails.\n\n## Pitfalls\n- Repair loops that \"fix\" tests by weakening assertions; review test diffs.\n- Silent partial success reported as completed.\n- Retrying a non-transient failure with the same inputs."
  },
  {
    "name": "agent-memory-state",
    "domain": "agent_engineering",
    "description": "Short- and long-term agent memory, context-window management, summarization, and checkpointed run state.",
    "version": "1.0.0",
    "keywords": [
      "memory",
      "long-term memory",
      "agent state",
      "checkpoint",
      "context window",
      "summariz",
      "conversation history",
      "session state",
      "persist",
      "compaction"
    ],
    "dependencies": [
      "rag-context-engineering"
    ],
    "required_permissions": [
      "read_repo",
      "read_blackboard"
    ],
    "allowed_departments": [
      "engineering",
      "architecture"
    ],
    "source_path": "backend/skills/agent-memory-state/SKILL.md",
    "origin": "builtin",
    "instructions": "Keep the working context small and relevant: persist durable facts and run state outside the prompt, and retrieve or summarize them deliberately.\n\n## Checklist\n- [ ] Separate memory types: working context, run state (checkpoints), and long-term facts.\n- [ ] Checkpoint run state after each step so a crashed run resumes instead of restarting.\n- [ ] Budget the context window; summarize or drop old turns before hitting the limit.\n- [ ] Keep summaries factual (decisions, open questions, artifacts) and link to sources.\n- [ ] Store long-term memories with provenance, timestamp, scope (user/project), and TTL.\n- [ ] Retrieve memories by relevance to the current task, not by recency alone.\n- [ ] Scope memory per tenant/project; never share across tenants.\n- [ ] Let users inspect and delete stored memories.\n- [ ] Never store secrets or raw credentials in memory.\n\n## Pitfalls\n- Summaries that drop constraints the user stated early on.\n- Stale memories overriding fresh information; prefer newer facts on conflict.\n- Unbounded memory growth that slows retrieval and raises cost."
  },
  {
    "name": "agent-tool-design",
    "domain": "agent_engineering",
    "description": "Designing agent-callable tools and MCP servers with tight schemas, safe side effects, and model-friendly results.",
    "version": "1.0.0",
    "keywords": [
      "tool",
      "tools",
      "function calling",
      "tool call",
      "tool schema",
      "mcp",
      "mcp server",
      "tool use",
      "agent tool",
      "sandbox"
    ],
    "dependencies": [
      "api-hardening"
    ],
    "required_permissions": [
      "read_repo",
      "write_code"
    ],
    "allowed_departments": [
      "engineering",
      "architecture"
    ],
    "source_path": "backend/skills/agent-tool-design/SKILL.md",
    "origin": "builtin",
    "instructions": "Give agents few, well-named tools with strict input schemas, bounded and explainable outputs, and explicit confirmation for anything destructive.\n\n## Checklist\n- [ ] One tool per user-meaningful action; avoid both mega-tools and dozens of tiny ones.\n- [ ] Name and describe tools for the model: what it does, when to use it, what it returns.\n- [ ] Define JSON schemas with required fields, enums, and bounds; reject unknown fields.\n- [ ] Validate and authorize inside the tool; never trust the model's arguments.\n- [ ] Return concise, structured results with ids the model can reference next.\n- [ ] Truncate or paginate large outputs and say so in the result.\n- [ ] Return actionable error messages (\"file not found: x; did you mean y\") instead of stack traces.\n- [ ] Make read tools side-effect free; make write tools idempotent where possible.\n- [ ] Require human approval or a dry-run mode for destructive or costly actions.\n- [ ] Run code-executing tools in a sandbox with time, memory, network, and filesystem limits.\n- [ ] Log every call with arguments, caller, and outcome for audit.\n\n## Pitfalls\n- Tool outputs that contain instructions the model then follows (treat as untrusted data).\n- Overlapping tools with ambiguous descriptions that the model picks between randomly."
  },
  {
    "name": "api-hardening",
    "domain": "software_engineering",
    "description": "Input validation, bounded pagination, structured error responses, and backward-compatible routing.",
    "version": "1.0.0",
    "keywords": [
      "api",
      "endpoint",
      "route",
      "fastapi",
      "validation",
      "pydantic",
      "rest",
      "backend"
    ],
    "dependencies": [
      "fullstack-architecture"
    ],
    "required_permissions": [
      "read_repo",
      "write_code"
    ],
    "allowed_departments": [
      "engineering",
      "architecture",
      "security"
    ],
    "source_path": "backend/skills/api-hardening/SKILL.md",
    "origin": "builtin",
    "instructions": "Validate all query/body parameters with strict bounds, enforce auth/ownership checks, and never expose stack traces.\n\n## Checklist\n- [ ] Every body/query/path param has a type plus bounds (`min_length`, `max_length`, `ge`, `le`).\n- [ ] List endpoints are paginated with a capped `limit` and a stable sort key.\n- [ ] Every protected route depends on the auth dependency and checks resource ownership.\n- [ ] Return 404 (not 403) for resources the caller cannot see, to avoid existence leaks.\n- [ ] Errors use one structured shape (`detail`, optional `code`); no tracebacks or SQL in responses.\n- [ ] Reject unknown enum values explicitly instead of silently defaulting.\n- [ ] Mutating endpoints are idempotent or accept an idempotency key where retries are likely.\n- [ ] Declare response models so internal fields are filtered out.\n- [ ] Rate-limit expensive or unauthenticated endpoints.\n- [ ] Keep old routes working (or redirect) when paths change; log deprecated usage.\n\n## Tests to add\n- Boundary values (0, max, max+1), missing auth, another user's resource, malformed JSON.\n\n## Pitfalls\n- Trusting client-supplied ids for ownership (IDOR).\n- Unbounded `limit` or regex/search params that allow expensive scans."
  },
  {
    "name": "authn-authz-design",
    "domain": "security",
    "description": "Authentication flows, session and token handling, RBAC and tenant isolation, and resource ownership checks.",
    "version": "1.0.0",
    "keywords": [
      "login",
      "authentication",
      "authorization",
      "session",
      "oauth",
      "oidc",
      "sso",
      "jwt",
      "rbac",
      "role",
      "permission",
      "password",
      "mfa",
      "tenant isolation",
      "ownership",
      "idor",
      "access control"
    ],
    "dependencies": [],
    "required_permissions": [
      "read_repo"
    ],
    "allowed_departments": [
      "security",
      "architecture",
      "engineering"
    ],
    "source_path": "backend/skills/authn-authz-design/SKILL.md",
    "origin": "builtin",
    "instructions": "Authenticate with proven libraries and providers, authorize every request on the server against the specific resource, and isolate tenants by default.\n\n## Authentication\n- [ ] Use a vetted provider/library (OIDC, OAuth 2.1 with PKCE); never hand-roll crypto.\n- [ ] Hash passwords with argon2id or bcrypt; rate-limit and lock out brute force.\n- [ ] Offer MFA for privileged accounts; require re-auth for sensitive actions.\n- [ ] Keep access tokens short-lived; rotate refresh tokens and detect reuse.\n- [ ] Validate JWT signature, algorithm, issuer, audience, and expiry on every request.\n- [ ] Invalidate sessions on logout, password change, and role change.\n\n## Authorization\n- [ ] Centralize checks in one policy layer (`can(user, action, resource)`).\n- [ ] Check ownership/tenant of the specific resource, not just the user's role.\n- [ ] Deny by default; new routes are protected unless explicitly public.\n- [ ] Scope every query by tenant/project id at the repository layer.\n- [ ] Log authorization denials and privilege changes for audit.\n\n## Tests to add\n- Cross-tenant access, expired/forged token, downgraded role, direct object id guessing.\n\n## Pitfalls\n- Trusting role or tenant claims sent by the client in the body.\n- Accepting `alg: none` or mixing symmetric/asymmetric JWT keys."
  },
  {
    "name": "automated-qa-verification",
    "domain": "quality_engineering",
    "description": "Unit, integration, and E2E test authoring with regression coverage and deterministic assertions.",
    "version": "1.0.0",
    "keywords": [
      "test",
      "pytest",
      "vitest",
      "playwright",
      "e2e",
      "qa",
      "coverage",
      "regression",
      "verify"
    ],
    "dependencies": [],
    "required_permissions": [
      "read_repo",
      "run_tests"
    ],
    "allowed_departments": [
      "quality",
      "engineering"
    ],
    "source_path": "backend/skills/automated-qa-verification/SKILL.md",
    "origin": "builtin",
    "instructions": "Cover happy paths, boundary conditions, failure propagation, and authorization denial paths with isolated deterministic tests.\n\n## Checklist\n- [ ] Start from acceptance criteria; write at least one test per criterion.\n- [ ] Choose the lowest layer that proves the behaviour (unit > integration > E2E).\n- [ ] Cover boundaries (empty, one, max, max+1), invalid input, and error propagation.\n- [ ] Test authorization: unauthenticated, wrong user, wrong tenant, insufficient role.\n- [ ] Keep tests isolated: fresh fixtures, no shared mutable state, no test ordering.\n- [ ] Remove nondeterminism: freeze time, seed randomness, stub network and LLM calls.\n- [ ] Assert on behaviour and outputs, not on private implementation details.\n- [ ] Add a regression test that fails before every bug fix and passes after.\n- [ ] Use clear test names: `test_<unit>_<condition>_<expected>`.\n- [ ] Run the full relevant suite locally before declaring done; report exact pass/fail counts.\n\n## Pitfalls\n- Tests that mock the very thing they claim to test.\n- Snapshot tests nobody reads, updated blindly on every change.\n- Coverage targets met with assertion-free tests."
  },
  {
    "name": "ci-pipeline-engineering",
    "domain": "devops",
    "description": "Fast, reliable CI pipelines with GitHub Actions - caching, parallel jobs, required checks, and reproducible builds.",
    "version": "1.0.0",
    "keywords": [
      "ci",
      "github actions",
      "ci pipeline",
      "ci/cd",
      "workflow yaml",
      "required check",
      "build cache",
      "failing build",
      "lint job",
      "matrix build",
      "deploy pipeline"
    ],
    "dependencies": [],
    "required_permissions": [
      "read_repo"
    ],
    "allowed_departments": [
      "infrastructure",
      "delivery",
      "engineering"
    ],
    "source_path": "backend/skills/ci-pipeline-engineering/SKILL.md",
    "origin": "builtin",
    "instructions": "Keep CI fast, deterministic, and trustworthy: every required check must be meaningful, reproducible locally, and green on the main branch.\n\n## Checklist\n- [ ] Fail fast: run lint and type checks before slow test suites.\n- [ ] Split independent jobs (backend, frontend, image build) to run in parallel.\n- [ ] Cache dependencies keyed on lockfile hashes; never cache build outputs blindly.\n- [ ] Pin action versions (ideally by SHA) and tool versions; use lockfiles for installs.\n- [ ] Give jobs least-privilege `permissions:` and avoid exposing secrets to fork PRs.\n- [ ] Use `concurrency` groups to cancel superseded runs on the same branch.\n- [ ] Make every check runnable locally with the same command (`make test`, `npm run ci`).\n- [ ] Upload test reports and artifacts on failure for debugging.\n- [ ] Mark only stable, relevant checks as required for merge.\n- [ ] Track pipeline duration and flake rate; fix regressions like product bugs.\n\n## Pitfalls\n- `continue-on-error` or `|| true` hiding real failures.\n- Steps that grep for output text that changed format, passing or failing for the wrong reason.\n- Deploy steps triggered from untrusted pull request contexts."
  },
  {
    "name": "container-k8s-delivery",
    "domain": "devops",
    "description": "Dockerfiles, Kubernetes manifests, CI/CD pipelines, health probes, and rollback runbooks.",
    "version": "1.0.0",
    "keywords": [
      "docker",
      "kubernetes",
      "k8s",
      "ci/cd",
      "deploy",
      "release",
      "rollout",
      "observability",
      "prometheus"
    ],
    "dependencies": [],
    "required_permissions": [
      "read_repo"
    ],
    "allowed_departments": [
      "infrastructure",
      "delivery",
      "architecture"
    ],
    "source_path": "backend/skills/container-k8s-delivery/SKILL.md",
    "origin": "builtin",
    "instructions": "Ensure non-root containers, explicit readiness/liveness probes, resource limits, and tested rollback steps.\n\n## Checklist\n- [ ] Use a slim, pinned base image; multi-stage builds keep compilers out of runtime images.\n- [ ] Order Dockerfile layers so dependency installs are cached separately from source copies.\n- [ ] Run as a non-root user with a read-only root filesystem where possible.\n- [ ] Keep `.dockerignore` tight: no `.env`, `.git`, tests, or local data in the image.\n- [ ] Define readiness (can serve traffic) and liveness (process is healthy) probes separately.\n- [ ] Set CPU/memory requests and limits; size them from observed usage.\n- [ ] Inject configuration via env/ConfigMaps and secrets via Secrets/external stores, never baked in.\n- [ ] Use rolling updates with `maxUnavailable: 0` or canaries for user-facing services.\n- [ ] Handle SIGTERM: stop accepting work, drain in-flight requests within the grace period.\n- [ ] Tag images immutably (git SHA); never deploy `latest` to production.\n- [ ] Document and rehearse rollback (`kubectl rollout undo` or previous image tag).\n\n## Pitfalls\n- Liveness probes that hit dependencies and restart healthy pods during a DB blip.\n- Migrations that are not backward compatible with the previous app version during rollout."
  },
  {
    "name": "dashboard-data-visualization",
    "domain": "design_tools",
    "description": "Charts, KPI tiles, and dashboards that are accurate, accessible, and readable at a glance in light and dark themes.",
    "version": "1.0.0",
    "keywords": [
      "chart",
      "charts",
      "graph",
      "data visualization",
      "visualiz",
      "dashboard",
      "kpi tile",
      "stat tile",
      "sparkline",
      "legend",
      "axis",
      "recharts",
      "d3",
      "plot",
      "heatmap"
    ],
    "dependencies": [
      "accessible-design-systems"
    ],
    "required_permissions": [
      "read_repo"
    ],
    "allowed_departments": [
      "design",
      "engineering"
    ],
    "source_path": "backend/skills/dashboard-data-visualization/SKILL.md",
    "origin": "builtin",
    "instructions": "Choose the chart from the question being answered, show the most important number first, and never let styling distort the data.\n\n## Checklist\n- [ ] Start from the decision the dashboard supports; cut charts that do not serve it.\n- [ ] Put headline KPIs first with value, unit, comparison period, and trend direction.\n- [ ] Choose the form by task: line for trends, bar for comparison, stacked bar for composition, table for exact lookup.\n- [ ] Start bar axes at zero; label axes and units; avoid dual axes and 3D.\n- [ ] Use a categorical palette with at most ~7 series; highlight one series and mute the rest.\n- [ ] Ensure series colors meet contrast and are distinguishable for color-blind users; add labels or patterns.\n- [ ] Prefer direct labels over legends when there are few series.\n- [ ] Format numbers consistently (thousands separators, abbreviations, fixed decimals).\n- [ ] Provide tooltips plus an accessible text or table alternative.\n- [ ] Design loading, empty, and error states for every chart.\n- [ ] Verify the chart in both light and dark themes using semantic tokens.\n\n## Pitfalls\n- Pie charts with many slices; use a sorted bar chart instead.\n- Averages hiding distribution; show percentiles where tails matter."
  },
  {
    "name": "data-quality-contracts",
    "domain": "data_engineering",
    "description": "Data contracts, validation checks, freshness and volume monitoring, deduplication, and schema-drift detection.",
    "version": "1.0.0",
    "keywords": [
      "data quality",
      "data contract",
      "data validation",
      "schema drift",
      "freshness",
      "dedup",
      "duplicate rows",
      "null rate",
      "great expectations",
      "anomaly",
      "reconcil",
      "data test"
    ],
    "dependencies": [],
    "required_permissions": [
      "read_repo",
      "run_tests"
    ],
    "allowed_departments": [
      "engineering",
      "quality"
    ],
    "source_path": "backend/skills/data-quality-contracts/SKILL.md",
    "origin": "builtin",
    "instructions": "Make data expectations explicit and machine-checked at the boundaries where data enters and leaves each system, and alert before consumers notice.\n\n## Checklist\n- [ ] Write a contract for each shared dataset: schema, types, keys, semantics, owner, SLA.\n- [ ] Version contracts; breaking changes need a migration window and consumer sign-off.\n- [ ] Check primary key uniqueness and not-null on required fields.\n- [ ] Check accepted values and ranges (enums, non-negative amounts, valid dates).\n- [ ] Check referential integrity between related tables.\n- [ ] Monitor freshness (latest timestamp) and volume (row count vs expected range).\n- [ ] Detect schema drift at ingestion and fail or quarantine unexpected columns.\n- [ ] Reconcile totals against the source of truth (e.g. billing vs warehouse revenue).\n- [ ] Route failures to the owning team with a sample of bad rows.\n- [ ] Add a regression check for every data incident.\n\n## Pitfalls\n- Checks that only run in dashboards after bad data has spread.\n- Alert fatigue from thresholds never tuned to normal variation."
  },
  {
    "name": "database-schema-modeling",
    "domain": "data_engineering",
    "description": "Schema design, composite indexing, safe non-destructive migrations, and query performance.",
    "version": "1.0.0",
    "keywords": [
      "database",
      "mongo",
      "postgres",
      "sql",
      "schema",
      "migration",
      "index",
      "billing",
      "data"
    ],
    "dependencies": [],
    "required_permissions": [
      "read_repo"
    ],
    "allowed_departments": [
      "engineering",
      "architecture"
    ],
    "source_path": "backend/skills/database-schema-modeling/SKILL.md",
    "origin": "builtin",
    "instructions": "Design idempotent, backward-compatible migrations, index hot filter keys, and parameterize every query.\n\n## Schema checklist\n- [ ] Model around access patterns: list the queries before choosing fields and collections/tables.\n- [ ] Every record has a stable id, `created_at`, `updated_at`, and tenant/project id where applicable.\n- [ ] Use soft deletes (`deleted_at`) where history or undo matters; filter them in every query.\n- [ ] Enforce constraints in the database (unique, not null, foreign keys/validators), not only in code.\n- [ ] Store money as integer minor units or decimals, never floats.\n\n## Index checklist\n- [ ] Add composite indexes matching filter + sort order of hot queries (equality, then sort, then range).\n- [ ] Add unique indexes for natural keys and idempotency keys.\n- [ ] Remove unused indexes; each one slows writes.\n\n## Migration checklist\n- [ ] Expand, migrate, contract: add new fields first, backfill, switch reads, then remove old fields.\n- [ ] Make migrations idempotent and resumable; batch large backfills.\n- [ ] Keep the previous app version working against the new schema during rollout.\n- [ ] Build large indexes online/concurrently.\n- [ ] Parameterize every query; never interpolate user input.\n\n## Pitfalls\n- Renaming a column in one step and breaking running pods.\n- Unbounded arrays or documents that grow forever."
  },
  {
    "name": "design-to-code-handoff",
    "domain": "design_tools",
    "description": "Turning Figma designs into implementation-ready specs - tokens, component mapping, states, breakpoints, and edge cases.",
    "version": "1.0.0",
    "keywords": [
      "figma",
      "handoff",
      "design spec",
      "redline",
      "mockup",
      "prototype",
      "design token",
      "component mapping",
      "pixel",
      "implement design",
      "design review"
    ],
    "dependencies": [
      "accessible-design-systems"
    ],
    "required_permissions": [
      "read_repo"
    ],
    "allowed_departments": [
      "design",
      "engineering"
    ],
    "source_path": "backend/skills/design-to-code-handoff/SKILL.md",
    "origin": "builtin",
    "instructions": "A design is ready for engineering when every value maps to a token, every element maps to an existing or specified component, and every state is drawn.\n\n## Checklist\n- [ ] Map each element to an existing component and variant; flag anything new explicitly.\n- [ ] Express colors, spacing, radius, typography, and shadows as design tokens, not raw values.\n- [ ] Specify all interaction states: default, hover, focus, active, disabled, loading, error.\n- [ ] Include empty, long-content, and overflow cases (long names, 0 and 1000 items).\n- [ ] Define responsive behaviour for each breakpoint, or reference the layout pattern used.\n- [ ] Annotate accessibility: focus order, labels, roles, and keyboard shortcuts.\n- [ ] Describe motion with duration, easing, and reduced-motion fallback.\n- [ ] Provide exported assets (SVG icons, images at 1x/2x) with names matching the codebase.\n- [ ] Note data requirements and API fields each view needs.\n- [ ] Review the implemented build against the design and log deviations.\n\n## Pitfalls\n- Pixel-perfect mockups with one-off values that bypass the design system.\n- Designs showing only ideal data and the happy path."
  },
  {
    "name": "e2e-browser-testing",
    "domain": "quality_engineering",
    "description": "Playwright/Cypress end-to-end tests for critical user journeys with resilient selectors, seeded data, and visual checks.",
    "version": "1.0.0",
    "keywords": [
      "e2e",
      "end-to-end",
      "playwright",
      "cypress",
      "browser test",
      "ui test",
      "user journey",
      "selector",
      "visual regression",
      "screenshot"
    ],
    "dependencies": [
      "automated-qa-verification"
    ],
    "required_permissions": [
      "read_repo",
      "run_tests"
    ],
    "allowed_departments": [
      "quality",
      "engineering"
    ],
    "source_path": "backend/skills/e2e-browser-testing/SKILL.md",
    "origin": "builtin",
    "instructions": "Reserve E2E tests for critical user journeys, make each one independent and data-seeded, and select elements the way users find them.\n\n## Checklist\n- [ ] List the top journeys (sign up, log in, core create/edit flow, checkout) and cover those first.\n- [ ] Select by role, label, or text (`getByRole`, `getByLabel`), falling back to `data-testid`.\n- [ ] Seed test data via API or fixtures per test; do not depend on previous tests.\n- [ ] Authenticate once and reuse storage state instead of logging in through the UI each time.\n- [ ] Use auto-waiting assertions (`expect(locator).toBeVisible()`); never fixed sleeps.\n- [ ] Stub third-party services (payments, email, LLMs) at the network layer.\n- [ ] Capture trace, video, and screenshots on failure for debugging.\n- [ ] Run against a production-like build, not the dev server with hot reload.\n- [ ] Add visual regression checks only for stable, high-value screens.\n- [ ] Test at least one mobile viewport for responsive journeys.\n\n## Pitfalls\n- Asserting on CSS classes or DOM structure that changes with every refactor.\n- Large suites of E2E tests for logic that unit tests could cover faster."
  },
  {
    "name": "error-handling-resilience",
    "domain": "software_engineering",
    "description": "Exception boundaries, timeouts, retries with backoff, circuit breakers, and graceful degradation for service calls.",
    "version": "1.0.0",
    "keywords": [
      "error handling",
      "exception",
      "retry",
      "retries",
      "timeout",
      "backoff",
      "circuit breaker",
      "resilien",
      "fallback",
      "graceful",
      "idempoten",
      "transient"
    ],
    "dependencies": [
      "api-hardening"
    ],
    "required_permissions": [
      "read_repo",
      "write_code"
    ],
    "allowed_departments": [
      "engineering",
      "architecture"
    ],
    "source_path": "backend/skills/error-handling-resilience/SKILL.md",
    "origin": "builtin",
    "instructions": "Fail loudly at boundaries, retry only transient and idempotent work with bounded backoff, and degrade gracefully instead of cascading failures.\n\n## Checklist\n- [ ] Every outbound call (HTTP, DB, LLM, queue) has an explicit timeout.\n- [ ] Retries use exponential backoff with jitter and a hard cap on attempts and total time.\n- [ ] Only retry transient errors (timeouts, 429, 5xx) and only idempotent operations.\n- [ ] Catch exceptions at a boundary that can act on them; never `except Exception: pass`.\n- [ ] Log with context (operation, ids, attempt), then re-raise or map to a typed domain error.\n- [ ] Map domain errors to HTTP status codes in one place.\n- [ ] Add a circuit breaker or fast-fail path for dependencies that are down.\n- [ ] Define the degraded behaviour (cached value, partial result, feature off) explicitly.\n- [ ] Release resources in `finally`/context managers; cancel background tasks on shutdown.\n\n## Tests to add\n- Dependency timeout, dependency 500 then success, permanent failure after max retries.\n\n## Pitfalls\n- Retry storms: retries at several layers multiply load on a struggling dependency.\n- Swallowed exceptions that turn outages into silent data loss."
  },
  {
    "name": "etl-pipeline-design",
    "domain": "data_engineering",
    "description": "Batch and incremental ETL/ELT pipelines with idempotent loads, backfills, orchestration, and warehouse modeling.",
    "version": "1.0.0",
    "keywords": [
      "etl",
      "elt",
      "data pipeline",
      "ingest",
      "ingestion",
      "backfill",
      "airflow",
      "dagster",
      "dbt",
      "incremental load",
      "cdc",
      "warehouse",
      "batch job"
    ],
    "dependencies": [
      "database-schema-modeling"
    ],
    "required_permissions": [
      "read_repo",
      "write_code"
    ],
    "allowed_departments": [
      "engineering",
      "architecture"
    ],
    "source_path": "backend/skills/etl-pipeline-design/SKILL.md",
    "origin": "builtin",
    "instructions": "Build pipelines that can be rerun safely for any time window: idempotent, incremental, observable, and with a clear contract for each stage.\n\n## Checklist\n- [ ] Define source, destination, freshness target, and owner for each pipeline.\n- [ ] Land raw data unchanged first (bronze), then clean (silver), then model (gold/marts).\n- [ ] Load incrementally by watermark or CDC; keep the watermark in durable state.\n- [ ] Make every load idempotent (merge/upsert on keys, or overwrite by partition).\n- [ ] Partition by event date and support backfills for an arbitrary date range.\n- [ ] Separate event time from processing time; handle late-arriving data explicitly.\n- [ ] Validate schema and row counts at each stage; fail instead of loading bad data.\n- [ ] Use an orchestrator (Airflow, Dagster, cron + locks) with retries, timeouts, and alerts.\n- [ ] Track lineage: which upstream tables and code version produced each table.\n- [ ] Keep transformations in version-controlled SQL/dbt models with tests.\n\n## Pitfalls\n- `INSERT` without dedup causing double counting on retry.\n- Full reloads that silently grow cost and runtime as data grows.\n- Pipelines that succeed while writing zero rows."
  },
  {
    "name": "flaky-test-triage",
    "domain": "quality_engineering",
    "description": "Diagnosing and fixing flaky, intermittent, or order-dependent tests caused by timing, shared state, or nondeterminism.",
    "version": "1.0.0",
    "keywords": [
      "flaky",
      "flaky test",
      "flake",
      "triage",
      "intermittent",
      "nondeterministic",
      "non-deterministic",
      "order-dependent",
      "race condition",
      "quarantine",
      "fails randomly",
      "timing issue"
    ],
    "dependencies": [
      "automated-qa-verification"
    ],
    "required_permissions": [
      "read_repo",
      "run_tests"
    ],
    "allowed_departments": [
      "quality",
      "engineering"
    ],
    "source_path": "backend/skills/flaky-test-triage/SKILL.md",
    "origin": "builtin",
    "instructions": "A flaky test is a bug in the test or the code; reproduce it deliberately, fix the root cause, and never paper over it with blind retries.\n\n## Checklist\n- [ ] Reproduce: run the test in a loop (`pytest --count`, `--repeat-each`) and with random ordering.\n- [ ] Run it alone and with the full suite to detect order dependence or leaked state.\n- [ ] Check for shared state: globals, singletons, module caches, database rows, temp files.\n- [ ] Check timing: fixed sleeps, unawaited coroutines, real clocks, timeouts too tight for CI.\n- [ ] Check nondeterminism: unseeded randomness, set/dict ordering, concurrency, network calls.\n- [ ] Replace sleeps with condition-based waits; freeze or inject time.\n- [ ] Reset singletons and fixtures between tests.\n- [ ] If it cannot be fixed now, quarantine it with an owner and an issue link, not a silent skip.\n- [ ] Track flake rate per test so regressions are visible.\n- [ ] Confirm the fix with a high-iteration loop before closing.\n\n## Pitfalls\n- Adding automatic retries that hide a real race condition in production code.\n- Deleting the test instead of fixing what it was guarding."
  },
  {
    "name": "fullstack-architecture",
    "domain": "software_engineering",
    "description": "API contract design, modular service decomposition, and clean TypeScript/Python interfaces.",
    "version": "1.0.0",
    "keywords": [
      "api",
      "fastapi",
      "endpoint",
      "contract",
      "backend",
      "frontend",
      "react",
      "typescript",
      "architecture"
    ],
    "dependencies": [],
    "required_permissions": [
      "read_repo"
    ],
    "allowed_departments": [
      "architecture",
      "engineering",
      "leadership"
    ],
    "source_path": "backend/skills/fullstack-architecture/SKILL.md",
    "origin": "builtin",
    "instructions": "Define typed API contracts first, isolate side effects behind repository interfaces, and avoid circular imports.\n\n## When to use\n- Adding a feature that spans backend routes, services, and frontend views.\n- Splitting a growing module or deciding where new code belongs.\n\n## Checklist\n- [ ] Write the request/response schema (Pydantic model + TypeScript type) before the handler.\n- [ ] Keep route handlers thin: parse input, call a service, shape the response.\n- [ ] Put persistence behind a repository/DAO; services never build raw queries.\n- [ ] Inject dependencies (db, clients, clock) so services are testable without I/O.\n- [ ] Keep the dependency direction one-way: api -> services -> repositories -> models.\n- [ ] Share or generate types across the boundary; never hand-copy field lists.\n- [ ] Evolve contracts additively; do not rename or retype existing fields.\n- [ ] Name modules after the domain concept, not the technology (\"billing\", not \"utils2\").\n\n## Pitfalls\n- Circular imports between services: extract the shared piece into a lower layer.\n- \"God\" services that own unrelated workflows: split by aggregate/ownership.\n- Leaking raw database documents to clients (internal fields, `_id`)."
  },
  {
    "name": "go-to-market-launch",
    "domain": "product_business",
    "description": "Launch planning, positioning and messaging, beta programs, release notes, and post-launch measurement.",
    "version": "1.0.0",
    "keywords": [
      "launch",
      "go-to-market",
      "gtm",
      "positioning",
      "messaging",
      "announcement",
      "release notes",
      "changelog",
      "beta program",
      "waitlist",
      "early access",
      "landing page copy"
    ],
    "dependencies": [
      "prd-product-strategy"
    ],
    "required_permissions": [
      "read_repo"
    ],
    "allowed_departments": [
      "business",
      "leadership"
    ],
    "source_path": "backend/skills/go-to-market-launch/SKILL.md",
    "origin": "builtin",
    "instructions": "Launch to a specific audience with one clear message, staged exposure, ready support, and launch metrics agreed in advance.\n\n## Checklist\n- [ ] Positioning: target customer, problem, alternative they use today, and why this is better.\n- [ ] One-sentence value proposition and three supporting proof points.\n- [ ] Choose the launch tier (silent, minor, major) based on impact and risk.\n- [ ] Stage exposure: internal dogfood, beta/early access, general availability.\n- [ ] Prepare assets: release notes, changelog entry, docs, demo, in-app announcement.\n- [ ] Brief support and sales with FAQs, known limitations, and escalation paths.\n- [ ] Confirm operational readiness: flags, monitoring, rollback, capacity for the spike.\n- [ ] Define launch metrics (activation, adoption, conversion) and review them at day 1, 7, and 30.\n- [ ] Collect qualitative feedback from beta users and feed it into the roadmap.\n\n## Pitfalls\n- Announcing features before they are reliably available to everyone targeted.\n- Messaging that lists features instead of customer outcomes.\n- No owner for post-launch follow-up."
  },
  {
    "name": "incident-response-runbooks",
    "domain": "devops",
    "description": "Incident triage, mitigation-first response, runbooks, on-call communication, and blameless postmortems.",
    "version": "1.0.0",
    "keywords": [
      "incident",
      "outage",
      "runbook",
      "postmortem",
      "post-mortem",
      "on-call",
      "sev1",
      "sev2",
      "pager",
      "mitigat",
      "root cause",
      "downtime",
      "rollback"
    ],
    "dependencies": [
      "observability-monitoring"
    ],
    "required_permissions": [
      "read_repo"
    ],
    "allowed_departments": [
      "infrastructure",
      "delivery"
    ],
    "source_path": "backend/skills/incident-response-runbooks/SKILL.md",
    "origin": "builtin",
    "instructions": "Mitigate first, diagnose second: restore service with the safest reversible action, communicate on a fixed cadence, and turn every incident into durable fixes.\n\n## During an incident\n- [ ] Declare the incident, assign an incident commander, and open one channel.\n- [ ] Assess impact: who is affected, which journeys, since when (check recent deploys first).\n- [ ] Prefer reversible mitigations: rollback, feature flag off, scale up, fail over.\n- [ ] Post status updates at a fixed cadence, even when there is no news.\n- [ ] Keep a timestamped timeline of observations and actions.\n- [ ] Confirm recovery with metrics, not with \"seems fine\".\n\n## Runbooks\n- [ ] Each alert links to a runbook: symptoms, dashboards, likely causes, safe commands.\n- [ ] Commands in runbooks are copy-pasteable and tested.\n\n## After\n- [ ] Write a blameless postmortem within a few days: impact, timeline, contributing factors.\n- [ ] Create owned, dated action items (detection, prevention, mitigation speed).\n- [ ] Add regression tests or alerts so the same failure is caught earlier next time.\n\n## Pitfalls\n- Debugging root cause in production while users are still impacted.\n- Postmortems that end with \"be more careful\" instead of system changes."
  },
  {
    "name": "infrastructure-as-code",
    "domain": "devops",
    "description": "Terraform, Helm, and other declarative infrastructure with reviewed plans, remote state, drift detection, and environment parity.",
    "version": "1.0.0",
    "keywords": [
      "terraform",
      "iac",
      "infrastructure as code",
      "helm",
      "pulumi",
      "cloudformation",
      "provision",
      "drift",
      "tfstate",
      "vpc",
      "staging environment"
    ],
    "dependencies": [],
    "required_permissions": [
      "read_repo",
      "write_infra"
    ],
    "allowed_departments": [
      "infrastructure"
    ],
    "source_path": "backend/skills/infrastructure-as-code/SKILL.md",
    "origin": "builtin",
    "instructions": "All infrastructure changes go through code review with a visible plan; nothing is changed by hand in the console.\n\n## Checklist\n- [ ] Store state remotely with locking and encryption; never commit state files.\n- [ ] Split stacks by blast radius (network, data, compute) and by environment.\n- [ ] Pin provider and module versions; upgrade deliberately.\n- [ ] Parameterize environments with variables, keeping staging and production structurally identical.\n- [ ] Run `fmt`, `validate`, a linter (tflint/checkov), and `plan` in CI; post the plan on the PR.\n- [ ] Review plans for destroys and replacements; protect stateful resources (`prevent_destroy`).\n- [ ] Tag every resource with owner, environment, and cost center.\n- [ ] Reference secrets from a secret manager; never put them in variables files.\n- [ ] Detect drift on a schedule and reconcile through code, not console edits.\n- [ ] Document import steps for resources created before IaC adoption.\n\n## Pitfalls\n- Renaming a resource address and causing destroy/recreate of a database.\n- Applying locally with stale state or credentials different from CI."
  },
  {
    "name": "llm-cost-optimization",
    "domain": "ai_engineering",
    "description": "Reduce LLM spend and latency with model routing, prompt caching, batching, token budgets, and streaming.",
    "version": "1.0.0",
    "keywords": [
      "token cost",
      "llm cost",
      "cost",
      "spend",
      "budget",
      "prompt caching",
      "prompt cache",
      "model routing",
      "cheaper model",
      "batch api",
      "latency",
      "tokens",
      "streaming"
    ],
    "dependencies": [
      "prompt-engineering"
    ],
    "required_permissions": [
      "read_repo"
    ],
    "allowed_departments": [
      "engineering",
      "architecture"
    ],
    "source_path": "backend/skills/llm-cost-optimization/SKILL.md",
    "origin": "builtin",
    "instructions": "Measure cost and latency per feature first, then route each request to the cheapest model that passes its eval bar and cut tokens that do not change the answer.\n\n## Checklist\n- [ ] Attribute token usage and cost per feature, tenant, and model in logs/metrics.\n- [ ] Route simple tasks (classification, extraction) to small models; reserve large models for hard ones.\n- [ ] Put stable content (system prompt, tool definitions, documents) first to maximize prompt-cache hits.\n- [ ] Cap `max_tokens` per call and trim retrieved context to a budget.\n- [ ] Use batch/asynchronous APIs for non-interactive workloads.\n- [ ] Stream responses for interactive UX to cut time-to-first-token.\n- [ ] Cache deterministic results (same input + prompt version) with a TTL.\n- [ ] Enforce per-run and per-tenant budgets with a hard stop and a clear error.\n- [ ] Verify every cost change against the eval set so quality does not silently drop.\n\n## Pitfalls\n- Changing a single byte at the start of the prompt and invalidating the cache.\n- Retry loops that multiply spend on persistent failures.\n- Optimizing average cost while p99 runaway agent loops dominate the bill."
  },
  {
    "name": "llm-evaluation-harness",
    "domain": "ai_engineering",
    "description": "Offline and online evaluation of LLM features with golden datasets, graders, LLM-as-judge rubrics, and regression gates.",
    "version": "1.0.0",
    "keywords": [
      "eval",
      "evaluation",
      "evals",
      "golden set",
      "golden dataset",
      "llm judge",
      "llm-as-judge",
      "hallucinat",
      "rubric",
      "grader",
      "benchmark",
      "faithfulness",
      "accuracy"
    ],
    "dependencies": [
      "prompt-engineering"
    ],
    "required_permissions": [
      "read_repo",
      "run_tests"
    ],
    "allowed_departments": [
      "engineering",
      "quality"
    ],
    "source_path": "backend/skills/llm-evaluation-harness/SKILL.md",
    "origin": "builtin",
    "instructions": "No prompt, model, or retrieval change ships without a measured comparison against a fixed evaluation set and an agreed pass threshold.\n\n## Checklist\n- [ ] Build a golden set (50-300 cases) from real traffic, covering edge cases and known failures.\n- [ ] Record the expected answer or the properties a good answer must have.\n- [ ] Use deterministic graders first (exact match, JSON schema, regex, unit tests on code).\n- [ ] Use an LLM judge only with a written rubric, a fixed judge model, and spot-checked agreement.\n- [ ] Score dimensions separately: correctness, faithfulness to sources, format, safety.\n- [ ] Run baseline vs candidate on the same set and report deltas with sample failures.\n- [ ] Gate CI on regressions beyond a threshold, not on absolute perfection.\n- [ ] Track cost and latency per case alongside quality.\n- [ ] Add every production incident as a new eval case.\n\n## Pitfalls\n- Evaluating on examples that also appear in few-shot prompts.\n- Judge bias toward longer answers or its own model family.\n- A single aggregate score that hides category regressions."
  },
  {
    "name": "load-performance-testing",
    "domain": "quality_engineering",
    "description": "Load, stress, and soak testing with k6 or Locust against explicit latency and throughput targets.",
    "version": "1.0.0",
    "keywords": [
      "load test",
      "load testing",
      "stress test",
      "soak test",
      "k6",
      "locust",
      "throughput",
      "p95",
      "p99",
      "concurrency",
      "capacity",
      "requests per second"
    ],
    "dependencies": [
      "performance-profiling"
    ],
    "required_permissions": [
      "read_repo",
      "run_tests"
    ],
    "allowed_departments": [
      "quality",
      "engineering"
    ],
    "source_path": "backend/skills/load-performance-testing/SKILL.md",
    "origin": "builtin",
    "instructions": "Load tests answer a specific capacity question with explicit targets; run them against a production-like environment and report percentiles, not averages.\n\n## Checklist\n- [ ] State the question and target (e.g. \"p95 < 300 ms at 200 RPS with < 0.1% errors\").\n- [ ] Model realistic traffic: endpoint mix, think time, payload sizes, authenticated users.\n- [ ] Use a production-like environment and dataset size; never load test production unannounced.\n- [ ] Warm up before measuring; run long enough to see GC, cache, and pool effects.\n- [ ] Ramp gradually to find the knee where latency or errors climb.\n- [ ] Run a soak test (hours) to catch leaks and connection exhaustion.\n- [ ] Record p50/p95/p99 latency, throughput, error rate, and resource saturation together.\n- [ ] Stub or rate-limit paid third-party calls (LLMs, payments) during tests.\n- [ ] Compare against the previous baseline and attach results to the PR or release.\n- [ ] Make thresholds pass/fail criteria in the script so CI can gate on them.\n\n## Pitfalls\n- The load generator becoming the bottleneck; monitor it too.\n- Testing only cached GET requests and missing write-path limits."
  },
  {
    "name": "multi-agent-orchestration",
    "domain": "agent_engineering",
    "description": "DAG wave scheduling, shared blackboard artifacts, bounded delegation, and self-healing critique loops.",
    "version": "1.0.0",
    "keywords": [
      "agent",
      "multi-agent",
      "dag",
      "workflow",
      "orchestrate",
      "delegate",
      "blackboard"
    ],
    "dependencies": [],
    "required_permissions": [
      "read_blackboard"
    ],
    "allowed_departments": [
      "leadership",
      "architecture",
      "engineering"
    ],
    "source_path": "backend/skills/multi-agent-orchestration/SKILL.md",
    "origin": "builtin",
    "instructions": "Schedule independent tasks in parallel waves, validate acyclic dependencies, and cap delegation depth and repair rounds.\n\n## Checklist\n- [ ] Model work as a DAG of tasks with explicit `depends_on`; reject cycles before running.\n- [ ] Group tasks into waves; run each wave concurrently with a bounded worker pool.\n- [ ] Give every task one owner role, a clear objective, and a definition of done.\n- [ ] Exchange results through typed blackboard artifacts, not free-form chat history.\n- [ ] Pass each agent only the artifacts it needs (least context, least privilege).\n- [ ] Cap delegation depth, total tasks, repair rounds, wall-clock time, and budget per run.\n- [ ] Block downstream tasks when an upstream task fails; surface the root cause.\n- [ ] Route critique to a different role than the author for self-healing loops.\n- [ ] Emit structured events per task (started, skill activated, completed, failed) for tracing.\n- [ ] Make runs resumable from the last completed wave.\n\n## Pitfalls\n- Agents delegating back to each other in an unbounded loop.\n- Shared mutable state written by parallel tasks without ownership rules.\n- Parallelizing tasks that secretly depend on each other's side effects."
  },
  {
    "name": "observability-monitoring",
    "domain": "devops",
    "description": "Structured logging, metrics, distributed tracing, SLOs, and actionable alerting for production services.",
    "version": "1.0.0",
    "keywords": [
      "observability",
      "monitoring",
      "metrics",
      "prometheus",
      "grafana",
      "tracing",
      "opentelemetry",
      "otel",
      "structured logging",
      "logs",
      "alert",
      "slo",
      "sli",
      "error budget"
    ],
    "dependencies": [],
    "required_permissions": [
      "read_repo"
    ],
    "allowed_departments": [
      "infrastructure",
      "engineering",
      "delivery"
    ],
    "source_path": "backend/skills/observability-monitoring/SKILL.md",
    "origin": "builtin",
    "instructions": "Instrument for the questions you will ask during an incident: what is broken, for whom, since when, and why - then alert only on user-visible symptoms.\n\n## Checklist\n- [ ] Emit structured JSON logs with timestamp, level, service, request id, and tenant/project id.\n- [ ] Propagate a correlation/trace id across HTTP, queues, and background jobs.\n- [ ] Expose RED metrics per endpoint: rate, errors, duration (histograms, not averages).\n- [ ] Add saturation metrics: queue depth, worker utilization, connection pool usage.\n- [ ] Trace cross-service calls with OpenTelemetry; include DB, cache, and LLM spans.\n- [ ] Define SLIs and SLOs for key user journeys; alert on error-budget burn rate.\n- [ ] Every alert links to a runbook and is actionable by the on-call person.\n- [ ] Keep metric label cardinality bounded (no user ids or raw URLs as labels).\n- [ ] Redact secrets and personal data from logs and traces.\n- [ ] Build one service dashboard: traffic, errors, latency, saturation, recent deploys.\n\n## Pitfalls\n- Alerting on causes (CPU 80%) instead of symptoms (checkout errors).\n- Logging full request bodies containing tokens or PII."
  },
  {
    "name": "performance-profiling",
    "domain": "software_engineering",
    "description": "Measure-first performance work - profiling CPU, memory, and I/O hot paths, removing N+1 calls, and adding caches safely.",
    "version": "1.0.0",
    "keywords": [
      "performance",
      "profil",
      "latency",
      "slow",
      "bottleneck",
      "cpu",
      "memory leak",
      "n+1",
      "hot path",
      "caching",
      "speed up"
    ],
    "dependencies": [],
    "required_permissions": [
      "read_repo",
      "run_tests"
    ],
    "allowed_departments": [
      "engineering",
      "quality"
    ],
    "source_path": "backend/skills/performance-profiling/SKILL.md",
    "origin": "builtin",
    "instructions": "Measure before changing anything, fix the largest bottleneck first, and prove the improvement with the same measurement.\n\n## Checklist\n- [ ] Define the metric and target (p95 latency, throughput, peak memory) and the workload.\n- [ ] Reproduce with realistic data volume; capture a baseline.\n- [ ] Profile (py-spy, cProfile, Chrome DevTools, `EXPLAIN`) instead of guessing.\n- [ ] Look first for N+1 queries, repeated serialization, sync I/O in async code, and unbounded loops.\n- [ ] Batch or parallelize independent I/O; move CPU-heavy work off the event loop.\n- [ ] Add caches only with an explicit key, TTL, size bound, and invalidation rule.\n- [ ] Re-run the same benchmark and report before/after numbers in the PR.\n- [ ] Add a regression guard (benchmark test or budget alert) for the fixed path.\n\n## Pitfalls\n- Micro-optimizing code that is 1% of the profile.\n- Caches that serve stale or cross-tenant data.\n- Benchmarking against an empty database."
  },
  {
    "name": "prd-product-strategy",
    "domain": "product_business",
    "description": "PRD authorship, unit economics, pricing models, ICP validation, and measurable KPI definitions.",
    "version": "1.0.0",
    "keywords": [
      "prd",
      "pricing",
      "monetiz",
      "revenue",
      "business",
      "roadmap",
      "requirement",
      "kpi",
      "market"
    ],
    "dependencies": [],
    "required_permissions": [
      "read_repo"
    ],
    "allowed_departments": [
      "business",
      "leadership"
    ],
    "source_path": "backend/skills/prd-product-strategy/SKILL.md",
    "origin": "builtin",
    "instructions": "Link customer problems to measurable acceptance criteria, explicit scope boundaries, and sustainable unit economics.\n\n## PRD checklist\n- [ ] Problem: who has it (ICP/persona), how often, and the evidence (interviews, data, tickets).\n- [ ] Goal and success metrics: one primary KPI with a target and a measurement method.\n- [ ] Guardrail metrics that must not regress (latency, churn, support load).\n- [ ] Scope: in scope, explicitly out of scope, and future considerations.\n- [ ] User stories with testable acceptance criteria for each in-scope capability.\n- [ ] Risks, assumptions, and open questions with owners.\n- [ ] Rollout plan: flags, beta cohort, launch criteria, kill criteria.\n\n## Business checklist\n- [ ] Pricing model fits the value metric customers perceive (seats, usage, outcomes).\n- [ ] Unit economics: gross margin per customer including infra and LLM costs; CAC payback.\n- [ ] Competitive alternatives and why customers would switch.\n- [ ] Roadmap items ranked by impact, confidence, and effort, with explicit trade-offs.\n\n## Pitfalls\n- Solution-first PRDs that never state the problem.\n- KPIs that cannot be measured with current instrumentation.\n- Usage-based pricing without cost ceilings for heavy users."
  },
  {
    "name": "product-analytics-experiments",
    "domain": "product_business",
    "description": "Product metrics, event tracking plans, funnels, cohort retention, and statistically sound A/B experiments.",
    "version": "1.0.0",
    "keywords": [
      "a/b test",
      "ab test",
      "experiment",
      "funnel",
      "retention",
      "activation",
      "cohort",
      "product analytics",
      "conversion",
      "north star",
      "churn",
      "tracking plan",
      "event tracking"
    ],
    "dependencies": [
      "prd-product-strategy"
    ],
    "required_permissions": [
      "read_repo"
    ],
    "allowed_departments": [
      "business",
      "leadership"
    ],
    "source_path": "backend/skills/product-analytics-experiments/SKILL.md",
    "origin": "builtin",
    "instructions": "Decide what you will measure and what result would change your decision before shipping, then instrument it and read results honestly.\n\n## Metrics & tracking\n- [ ] Define a north-star metric plus input metrics the team can move.\n- [ ] Write a tracking plan: event names (`object_action`), properties, owner, and purpose.\n- [ ] Track server-side for business-critical events (signup, purchase) to avoid ad-blocker loss.\n- [ ] Exclude internal, test, and bot traffic.\n- [ ] Respect consent and avoid sending PII in event properties.\n\n## Experiments\n- [ ] Write a hypothesis, primary metric, guardrails, and minimum detectable effect up front.\n- [ ] Compute sample size and run duration before launch; run full weekly cycles.\n- [ ] Randomize at the right unit (user, account) and check for sample ratio mismatch.\n- [ ] Do not peek and stop early on a lucky p-value; use pre-set stopping rules.\n- [ ] Report effect size with confidence intervals, plus segment checks for harm.\n- [ ] Record the decision and learning in an experiment log.\n\n## Pitfalls\n- Vanity metrics (page views) standing in for value delivered.\n- Changing the metric definition after seeing results."
  },
  {
    "name": "prompt-engineering",
    "domain": "ai_engineering",
    "description": "System prompt design, few-shot examples, structured JSON outputs, and versioned prompt templates for LLM features.",
    "version": "1.0.0",
    "keywords": [
      "prompt",
      "system prompt",
      "few-shot",
      "instruction",
      "structured output",
      "json schema",
      "prompt template",
      "llm",
      "completion",
      "tool use"
    ],
    "dependencies": [],
    "required_permissions": [
      "read_repo"
    ],
    "allowed_departments": [
      "engineering",
      "architecture",
      "business",
      "quality",
      "security"
    ],
    "source_path": "backend/skills/prompt-engineering/SKILL.md",
    "origin": "builtin",
    "instructions": "Treat prompts as versioned code: state the role, task, constraints, and output contract explicitly, and verify changes against an evaluation set.\n\n## Checklist\n- [ ] Open with role and goal, then constraints, then the exact output format.\n- [ ] Separate trusted instructions from untrusted data with clear delimiters or tags.\n- [ ] Prefer structured outputs (JSON schema / tool calling) over parsing free text.\n- [ ] Validate model output against the schema; retry once with the validation error, then fail.\n- [ ] Add 2-5 few-shot examples covering edge cases, not just the happy path.\n- [ ] Say what to do when information is missing (ask, abstain, or use a default).\n- [ ] Keep prompts in templates under version control with an id and version.\n- [ ] Log prompt version, model, and parameters with each call for debugging.\n- [ ] Pin temperature and model version for deterministic workflows.\n- [ ] Re-run the eval set before shipping any prompt change.\n\n## Pitfalls\n- Contradictory instructions spread across system and user messages.\n- Examples that leak the expected answer pattern too narrowly (overfitting).\n- Silent truncation when the prompt exceeds the context window."
  },
  {
    "name": "prompt-injection-defense",
    "domain": "security",
    "description": "Defending LLM and agent features against direct and indirect prompt injection, jailbreaks, and data exfiltration via tools.",
    "version": "1.0.0",
    "keywords": [
      "prompt injection",
      "injection",
      "jailbreak",
      "untrusted input",
      "untrusted content",
      "indirect injection",
      "exfiltrat",
      "llm security",
      "system prompt leak",
      "tool output",
      "guardrail"
    ],
    "dependencies": [
      "prompt-engineering"
    ],
    "required_permissions": [
      "read_repo"
    ],
    "allowed_departments": [
      "security",
      "engineering"
    ],
    "source_path": "backend/skills/prompt-injection-defense/SKILL.md",
    "origin": "builtin",
    "instructions": "Assume any text the model reads may contain instructions from an attacker; limit what the model can do with them rather than relying on the prompt to resist.\n\n## Checklist\n- [ ] Inventory untrusted inputs: user messages, retrieved documents, web pages, emails, tool outputs, file contents.\n- [ ] Delimit untrusted content and tell the model it is data, never instructions.\n- [ ] Apply least privilege to tools: the model can only reach what the current user can.\n- [ ] Require human confirmation for high-impact actions (sending, deleting, paying, sharing).\n- [ ] Block exfiltration channels: unrestricted URL fetches, markdown image links, arbitrary webhooks.\n- [ ] Never put secrets in prompts; assume the system prompt can be extracted.\n- [ ] Validate model outputs (schema, allow-lists) before executing them as code, SQL, or commands.\n- [ ] Separate the planner that reads untrusted data from privileged actions where feasible.\n- [ ] Maintain an adversarial test set (direct, indirect, encoded payloads) in CI evals.\n- [ ] Log and alert on suspicious tool sequences (read secret, then network call).\n\n## Pitfalls\n- Relying on \"ignore any instructions in the document\" as the only defense.\n- Treating tool results from your own MCP servers as trusted."
  },
  {
    "name": "query-performance-tuning",
    "domain": "data_engineering",
    "description": "Diagnosing slow SQL and MongoDB queries with explain plans, index tuning, pagination, and aggregation rewrites.",
    "version": "1.0.0",
    "keywords": [
      "slow query",
      "slow queries",
      "query",
      "explain",
      "query plan",
      "index",
      "collection scan",
      "n+1",
      "aggregation",
      "pagination",
      "mongo",
      "postgres",
      "sql",
      "query performance"
    ],
    "dependencies": [
      "database-schema-modeling"
    ],
    "required_permissions": [
      "read_repo"
    ],
    "allowed_departments": [
      "engineering",
      "architecture"
    ],
    "source_path": "backend/skills/query-performance-tuning/SKILL.md",
    "origin": "builtin",
    "instructions": "Read the query plan before changing anything; most slow queries are fixed by the right index, a narrower projection, or removing an N+1 pattern.\n\n## Checklist\n- [ ] Find the worst queries by total time (pg_stat_statements, Mongo profiler, APM), not by anecdote.\n- [ ] Run `EXPLAIN (ANALYZE, BUFFERS)` or `.explain(\"executionStats\")` on realistic data.\n- [ ] Look for sequential/collection scans, large sorts in memory, and high rows-examined vs returned.\n- [ ] Add or reorder composite indexes to match equality, sort, then range fields.\n- [ ] Project only needed fields; avoid `SELECT *` and fetching large blobs in lists.\n- [ ] Replace offset pagination on large tables with keyset/cursor pagination.\n- [ ] Collapse N+1 lookups into a join, `$in` query, or batched loader.\n- [ ] Push filters early in aggregation pipelines (`$match` before `$lookup`/`$group`).\n- [ ] Re-measure and compare plans before and after; keep the fix in a migration.\n\n## Pitfalls\n- Adding an index per query until writes slow down.\n- Functions on indexed columns (`lower(email)`) that prevent index use without an expression index.\n- Tuning on a tiny dev dataset where every plan looks fast."
  },
  {
    "name": "rag-context-engineering",
    "domain": "ai_engineering",
    "description": "Hybrid retrieval, chunking, embedding pipelines, prompt structuring, and citation grounding.",
    "version": "1.0.0",
    "keywords": [
      "rag",
      "embedding",
      "retrieval",
      "llm",
      "prompt",
      "context",
      "vector",
      "ai"
    ],
    "dependencies": [],
    "required_permissions": [
      "read_repo"
    ],
    "allowed_departments": [
      "engineering",
      "architecture",
      "leadership"
    ],
    "source_path": "backend/skills/rag-context-engineering/SKILL.md",
    "origin": "builtin",
    "instructions": "Bound retrieved context budgets, preserve source citations, and enforce grounded abstention when evidence is missing.\n\n## Checklist\n- [ ] Chunk by document structure (headings, functions, paragraphs), not fixed byte offsets alone.\n- [ ] Store chunk metadata: source id, path/url, section, version/hash, tenant/project id.\n- [ ] Combine lexical (BM25) and vector retrieval; rerank the merged candidates.\n- [ ] Filter by tenant/project before ranking, never after.\n- [ ] Enforce a token budget for retrieved context; drop lowest-ranked chunks first.\n- [ ] Deduplicate near-identical chunks before they reach the prompt.\n- [ ] Put instructions, retrieved evidence, and the user question in clearly delimited sections.\n- [ ] Require citations to chunk ids and verify cited ids exist in the provided context.\n- [ ] Instruct the model to say it does not know when evidence is missing.\n- [ ] Re-embed on source change (hash comparison) and on embedding model change.\n\n## Evaluate\n- Track retrieval recall@k on a labelled question set and answer faithfulness separately.\n\n## Pitfalls\n- Cross-tenant leakage through a shared index without filters.\n- Mixing embeddings from different models or dimensions in one index."
  },
  {
    "name": "refactoring-legacy-code",
    "domain": "software_engineering",
    "description": "Safe, incremental refactoring of legacy modules behind characterization tests, with no behaviour change per step.",
    "version": "1.0.0",
    "keywords": [
      "refactor",
      "legacy",
      "tech debt",
      "technical debt",
      "cleanup",
      "clean up",
      "dead code",
      "decouple",
      "monolith",
      "modulariz",
      "rewrite",
      "simplif"
    ],
    "dependencies": [
      "fullstack-architecture",
      "automated-qa-verification"
    ],
    "required_permissions": [
      "read_repo",
      "write_code",
      "run_tests"
    ],
    "allowed_departments": [
      "engineering",
      "architecture"
    ],
    "source_path": "backend/skills/refactoring-legacy-code/SKILL.md",
    "origin": "builtin",
    "instructions": "Pin current behaviour with characterization tests, then change structure in small, separately verifiable steps that never mix refactoring with feature work.\n\n## Checklist\n- [ ] Identify the seam: the smallest boundary you can test around without touching internals.\n- [ ] Write characterization tests that record current outputs, including odd ones.\n- [ ] Make one mechanical change per commit (extract, rename, move, inline) and run tests each time.\n- [ ] Keep public signatures stable; add adapters or deprecation shims for old call sites.\n- [ ] Delete dead code only after confirming no references (grep, coverage, runtime logs).\n- [ ] Replace hidden globals and singletons with injected dependencies where you touch them.\n- [ ] Track remaining debt explicitly (TODO with owner, or an issue).\n- [ ] Measure before/after for anything on a hot path.\n\n## Strategy\n- Prefer strangler-fig replacement over big-bang rewrites.\n- Leave the code better than you found it, but stay inside the agreed scope.\n\n## Pitfalls\n- \"While I'm here\" behaviour changes hidden inside a refactor diff.\n- Fixing a bug that callers silently depend on without flagging it."
  },
  {
    "name": "responsive-layout-patterns",
    "domain": "design_tools",
    "description": "Mobile-first responsive layouts with CSS grid/flexbox, breakpoints, container queries, and fluid typography.",
    "version": "1.0.0",
    "keywords": [
      "responsive",
      "mobile",
      "mobile-first",
      "breakpoint",
      "css grid",
      "flexbox",
      "viewport",
      "container query",
      "sidebar",
      "overflow",
      "fluid typography",
      "tablet"
    ],
    "dependencies": [
      "accessible-design-systems"
    ],
    "required_permissions": [
      "read_repo"
    ],
    "allowed_departments": [
      "design",
      "engineering"
    ],
    "source_path": "backend/skills/responsive-layout-patterns/SKILL.md",
    "origin": "builtin",
    "instructions": "Design the smallest screen first, let content decide breakpoints, and make layouts flex rather than snap between fixed widths.\n\n## Checklist\n- [ ] Start from a single-column mobile layout; add columns as space allows.\n- [ ] Use flexbox for one-dimensional rows/stacks and grid for two-dimensional layouts.\n- [ ] Pick breakpoints where content breaks, using the design system's shared values.\n- [ ] Use container queries for components that live in variable-width slots.\n- [ ] Size with relative units (`rem`, `%`, `fr`, `minmax`, `clamp`) instead of fixed pixels.\n- [ ] Collapse sidebars into drawers and wide tables into cards or horizontal scroll with a hint.\n- [ ] Keep line length readable (45-80 characters) at every width.\n- [ ] Prevent overflow: long words, URLs, and code blocks wrap or scroll inside their box.\n- [ ] Test at 320px width, 200% zoom, and both orientations; nothing is cut off.\n- [ ] Images use `srcset`/`sizes` and reserve space to avoid layout shift.\n\n## Pitfalls\n- Hiding essential actions on mobile instead of reorganizing them.\n- Hover-only interactions with no touch equivalent."
  },
  {
    "name": "secrets-management",
    "domain": "security",
    "description": "Storing, injecting, rotating, and scanning for secrets such as API keys, tokens, and database credentials.",
    "version": "1.0.0",
    "keywords": [
      "secret",
      "secrets",
      "api key",
      "credential",
      "vault",
      ".env",
      "env var",
      "rotation",
      "rotate",
      "kms",
      "leaked",
      "token leak",
      "gitleaks",
      "secret scanning"
    ],
    "dependencies": [],
    "required_permissions": [
      "read_repo"
    ],
    "allowed_departments": [
      "security",
      "infrastructure",
      "engineering"
    ],
    "source_path": "backend/skills/secrets-management/SKILL.md",
    "origin": "builtin",
    "instructions": "Secrets live in a secret manager, reach processes at runtime with least privilege, rotate on a schedule, and are revoked immediately when exposed.\n\n## Checklist\n- [ ] Keep secrets out of git, images, logs, and client bundles; `.env` files are gitignored.\n- [ ] Load secrets from a manager (Vault, cloud secret manager, Kubernetes Secrets) at runtime.\n- [ ] Give each service its own credential with the minimum scope it needs.\n- [ ] Prefer short-lived tokens (OIDC, workload identity) over long-lived static keys.\n- [ ] Encrypt secrets at rest and in transit; restrict who can read them and audit access.\n- [ ] Run secret scanning (gitleaks, trufflehog, push protection) in pre-commit and CI.\n- [ ] Redact secret-shaped values in logs and error reports.\n- [ ] Document rotation for each secret and rotate on a schedule.\n\n## If a secret leaked\n- [ ] Revoke or rotate it first, then remove it from code and history.\n- [ ] Check access logs for use during the exposure window.\n- [ ] Record the incident and add a scanner rule if it was missed.\n\n## Pitfalls\n- Deleting the commit but not rotating the key (history and forks keep it).\n- Sharing one admin credential across services and environments."
  },
  {
    "name": "security-threat-audit",
    "domain": "security",
    "description": "OWASP verification, auth/RBAC boundary checks, SSRF/path-traversal defense, and secrets hygiene.",
    "version": "1.0.0",
    "keywords": [
      "security",
      "auth",
      "oauth",
      "jwt",
      "rbac",
      "csrf",
      "xss",
      "audit",
      "compliance",
      "gdpr",
      "vulnerability"
    ],
    "dependencies": [],
    "required_permissions": [
      "read_repo",
      "emit_findings"
    ],
    "allowed_departments": [
      "security",
      "architecture",
      "leadership"
    ],
    "source_path": "backend/skills/security-threat-audit/SKILL.md",
    "origin": "builtin",
    "instructions": "Verify server-side authentication and resource ownership on every protected route, reject path traversal and unsafe URLs, and emit structured blocking findings.\n\n## Checklist\n- [ ] Map entry points and trust boundaries: public routes, webhooks, workers, admin tools.\n- [ ] Every protected route authenticates server-side and checks ownership/tenant of the resource.\n- [ ] Role checks are enforced in the backend, not only hidden in the UI.\n- [ ] Inputs reaching queries, shells, templates, or file paths are parameterized or allow-listed.\n- [ ] File paths are resolved and confined to a base directory (no `..` or symlink escapes).\n- [ ] Server-side fetches of user URLs block private, loopback, and metadata IP ranges (SSRF).\n- [ ] Output is encoded for its context; cookies use `HttpOnly`, `Secure`, `SameSite`.\n- [ ] State-changing requests are CSRF-protected when cookie-authenticated.\n- [ ] No secrets in code, logs, error messages, or client bundles.\n- [ ] Personal data handling matches retention and deletion obligations (GDPR).\n\n## Findings format\n- Severity (critical/high/medium/low), location (file:line), exploit scenario, fix, and whether it blocks release.\n\n## Pitfalls\n- Reporting theoretical issues without an exploit path; prioritize by real impact."
  },
  {
    "name": "supply-chain-security",
    "domain": "security",
    "description": "Dependency vulnerability scanning, lockfiles and pinning, SBOMs, license checks, and safe upgrades of third-party packages.",
    "version": "1.0.0",
    "keywords": [
      "supply chain",
      "cve",
      "sbom",
      "npm audit",
      "pip-audit",
      "lockfile",
      "vulnerable dependency",
      "dependency vulnerab",
      "outdated dependenc",
      "typosquat",
      "license",
      "dependabot",
      "renovate"
    ],
    "dependencies": [],
    "required_permissions": [
      "read_repo",
      "run_security_scan"
    ],
    "allowed_departments": [
      "security"
    ],
    "source_path": "backend/skills/supply-chain-security/SKILL.md",
    "origin": "builtin",
    "instructions": "Know exactly what third-party code ships, pin it, scan it continuously, and upgrade on a predictable cadence with tests as the safety net.\n\n## Checklist\n- [ ] Commit lockfiles for every ecosystem and install with them in CI and images.\n- [ ] Pin direct dependencies; avoid unbounded ranges for runtime packages.\n- [ ] Run vulnerability scans (`pip-audit`, `npm audit`, OSV, container image scan) in CI.\n- [ ] Triage findings by reachability and exposure, not CVSS score alone.\n- [ ] Generate an SBOM for released images and keep it with the release.\n- [ ] Check new dependencies: maintenance activity, popularity, license, install scripts, name typos.\n- [ ] Enable automated update PRs (Dependabot/Renovate) grouped by risk.\n- [ ] Pin CI actions and base images by digest or exact version.\n- [ ] Verify licenses are compatible with distribution (flag GPL/AGPL in proprietary code).\n\n## Pitfalls\n- Adding a large dependency for a ten-line helper.\n- Ignoring transitive vulnerabilities because \"we don't import it directly\".\n- Upgrading majors without reading changelogs or running the full test suite."
  },
  {
    "name": "user-story-writing",
    "domain": "product_business",
    "description": "Backlog-ready user stories and epics with testable acceptance criteria, sizing, and clear definitions of done.",
    "version": "1.0.0",
    "keywords": [
      "user story",
      "user stories",
      "acceptance criteria",
      "backlog",
      "epic",
      "gherkin",
      "given/when/then",
      "ticket",
      "definition of done",
      "sprint",
      "story points",
      "spec"
    ],
    "dependencies": [
      "prd-product-strategy"
    ],
    "required_permissions": [
      "read_repo"
    ],
    "allowed_departments": [
      "business",
      "leadership"
    ],
    "source_path": "backend/skills/user-story-writing/SKILL.md",
    "origin": "builtin",
    "instructions": "Write stories small enough to ship in a few days, from the user's point of view, with acceptance criteria an engineer and a tester can verify without asking.\n\n## Checklist\n- [ ] Format: \"As a <persona>, I want <capability>, so that <outcome>\".\n- [ ] Each story is independent, negotiable, valuable, estimable, small, and testable (INVEST).\n- [ ] Acceptance criteria use Given/When/Then and cover happy path, edge cases, and errors.\n- [ ] Include permissions: who can and cannot perform the action.\n- [ ] Note non-functional needs: performance, accessibility, analytics events, audit logging.\n- [ ] Link designs, API contracts, and the parent epic/PRD.\n- [ ] List explicit out-of-scope items to prevent scope creep.\n- [ ] Split large stories by workflow step, data variation, or user role, not by technical layer.\n- [ ] Define done: merged, tested, documented, behind a flag or released, metrics visible.\n\n## Pitfalls\n- \"Technical stories\" with no user-visible outcome; attach them to the story they enable.\n- Acceptance criteria that restate the title (\"user can export\") without observable results."
  },
  {
    "name": "ux-copy-states",
    "domain": "design_tools",
    "description": "UX microcopy and interface states - empty, loading, error, success - with clear CTAs and consistent voice.",
    "version": "1.0.0",
    "keywords": [
      "microcopy",
      "ux copy",
      "copywriting",
      "empty state",
      "loading state",
      "error message",
      "error state",
      "success message",
      "cta",
      "button label",
      "tooltip",
      "wording",
      "confirmation dialog"
    ],
    "dependencies": [],
    "required_permissions": [
      "read_repo"
    ],
    "allowed_departments": [
      "design",
      "business",
      "engineering"
    ],
    "source_path": "backend/skills/ux-copy-states/SKILL.md",
    "origin": "builtin",
    "instructions": "Every screen needs designed states, not just the happy path; copy tells users what happened, why, and what to do next in as few words as possible.\n\n## States checklist\n- [ ] Empty: explain what will appear here and offer the first action.\n- [ ] Loading: use skeletons for layout-heavy views; show progress for long tasks.\n- [ ] Error: say what failed, in plain language, and how to recover (retry, fix input, contact).\n- [ ] Partial: show what loaded and mark what did not.\n- [ ] Success: confirm the outcome briefly and point to the next step.\n- [ ] Permission denied and offline states are distinct from generic errors.\n\n## Copy checklist\n- [ ] Buttons start with a verb that names the outcome (\"Create project\", not \"Submit\").\n- [ ] Destructive confirmations name the object and consequence (\"Delete 3 files? This can't be undone.\").\n- [ ] Field errors sit next to the field and say how to fix the value.\n- [ ] Use the user's vocabulary, not internal system names or error codes.\n- [ ] Keep terms consistent across the product (one word per concept).\n- [ ] Sentence case, short sentences, no blame (\"We couldn't save\" not \"You failed\").\n- [ ] Leave room for translation (text can grow 30-40%).\n\n## Pitfalls\n- \"Something went wrong\" with no next step.\n- Spinners with no timeout or fallback message."
  }
]
