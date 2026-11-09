import {
  Compass,
  TrendingUp,
  Palette,
  Code2,
  Plug,
  ShieldCheck,
  FileStack,
  Scale,
  NotebookPen,
  Layers,
  ListChecks,
  ListTodo,
  CalendarRange,
  Users,
  Terminal,
  type LucideIcon,
} from "lucide-react";

export type FlowStageId = "discovery" | "definition" | "planning" | "execution";

export interface FlowStageMeta {
  id: FlowStageId;
  name: string;
  stepNumber: string;
  color: string;
  description: string;
  agentIds: string[];
  keyDeliverable: string;
  primaryRole: string;
}

export const FLOW_STAGES: FlowStageMeta[] = [
  {
    id: "discovery",
    name: "Discovery",
    stepNumber: "01",
    color: "#0071E3",
    description: "Problem framing, market assumptions, and weighted decision scoring",
    agentIds: ["business_analyst", "decision_engine"],
    keyDeliverable: "Problem Brief & Decision Matrix (ADR)",
    primaryRole: "Requirements discovery & criteria modeling",
  },
  {
    id: "definition",
    name: "Definition",
    stepNumber: "02",
    color: "#BF5AF2",
    description: "System architecture, section-numbered PRD, and wireframe frames",
    agentIds: ["architect", "prd_writer", "designer"],
    keyDeliverable: "Architecture Blueprint & Structured PRD v1.0",
    primaryRole: "Full technical specification & design tokens",
  },
  {
    id: "planning",
    name: "Planning",
    stepNumber: "03",
    color: "#FF9F0A",
    description: "Work breakdown: quarterly epics, user stories, and sprint capacity",
    agentIds: ["epic_generator", "story_generator", "task_generator", "sprint_planner", "pm"],
    keyDeliverable: "Sprint Commitment Backlog & Dependency DAG",
    primaryRole: "Scrum decomposition & execution scheduling",
  },
  {
    id: "execution",
    name: "Execution",
    stepNumber: "04",
    color: "#30D158",
    description: "Autonomous code generation, sandbox tests, and git pull request",
    agentIds: ["developer", "task_executor", "scrum_master", "business_improver", "integration"],
    keyDeliverable: "Tested Source Code & GitHub Pull Request",
    primaryRole: "Production synthesis & continuous verification",
  },
];

export interface CatalogAgent {
  id: string;
  label: string;
  stage: FlowStageId;
  stageLabel: string;
  hue: string;
  icon: LucideIcon;
  kind: "build" | "gateway";
  credits: number;
  purpose: string;
  model: string;
  tools: string[];
  inputs: string[];
  outputs: string[];
  successRate: number;
  avgDuration: string;
  samplePrompt: string;
}

export const AGENT_CATALOG: CatalogAgent[] = [
  // Discovery
  {
    id: "business_analyst",
    label: "Business Analyst",
    stage: "discovery",
    stageLabel: "Discovery",
    hue: "#0071E3",
    icon: FileStack,
    kind: "gateway",
    credits: 2,
    purpose: "Turns raw prompts into scoped briefs covering problem, target users, assumptions, and risks.",
    model: "gemini-2.5-flash",
    tools: ["Context Assembler", "Risk Scorer", "User Persona Synthesizer"],
    inputs: ["Raw prompt", "Repo context", "Domain constraints"],
    outputs: ["Scoped Brief", "Target Personas", "Risk Matrix"],
    successRate: 98,
    avgDuration: "0.9s",
    samplePrompt: "Frame requirements for a multi-tenant payment checkout gateway with webhooks.",
  },
  {
    id: "decision_engine",
    label: "Decision Engine",
    stage: "discovery",
    stageLabel: "Discovery",
    hue: "#5E5CE6",
    icon: Scale,
    kind: "gateway",
    credits: 2,
    purpose: "Evaluates competing architectural trade-offs against weighted criteria and produces formal ADRs.",
    model: "gemini-2.5-flash",
    tools: ["Multi-Criteria Scorer", "Trade-Off Matrix", "ADR Formatter"],
    inputs: ["Candidate options", "Latency/Cost/Scale criteria", "Team preferences"],
    outputs: ["Weighted Recommendation", "ADR-001 Architecture Decision Record"],
    successRate: 96,
    avgDuration: "1.1s",
    samplePrompt: "Compare PostgreSQL with Drizzle ORM versus MongoDB for multi-tenant analytics.",
  },
  // Definition
  {
    id: "architect",
    label: "System Architect",
    stage: "definition",
    stageLabel: "Definition",
    hue: "#0A84FF",
    icon: Compass,
    kind: "build",
    credits: 3,
    purpose: "Synthesizes modular system topology, database schemas, API routes, and network boundaries.",
    model: "gemini-2.5-pro",
    tools: ["System Grapher", "Schema Synthesizer", "Contract Validator"],
    inputs: ["Scoped Brief", "ADR Recommendations", "Language/Framework config"],
    outputs: ["System Topology JSON", "Data Model Schemas", "API Endpoint Spec"],
    successRate: 97,
    avgDuration: "1.4s",
    samplePrompt: "Generate a production schema with users, initiatives, agent runs, and audit logs.",
  },
  {
    id: "prd_writer",
    label: "PRD Writer",
    stage: "definition",
    stageLabel: "Definition",
    hue: "#BF5AF2",
    icon: NotebookPen,
    kind: "gateway",
    credits: 2,
    purpose: "Transforms requirements and architecture into a section-numbered, audit-ready PRD specification.",
    model: "gemini-2.5-flash",
    tools: ["PRD Formatter", "Section Numberer", "Acceptance Linter"],
    inputs: ["Scoped Brief", "Architecture Topology", "Non-functional requirements"],
    outputs: ["Numbered PRD v1.0", "Traceability Matrix", "Edge Case Inventory"],
    successRate: 95,
    avgDuration: "1.3s",
    samplePrompt: "Author PRD for real-time collaborative canvas with WebSocket synchronization.",
  },
  {
    id: "designer",
    label: "UI/UX Designer",
    stage: "definition",
    stageLabel: "Definition",
    hue: "#FF375F",
    icon: Palette,
    kind: "gateway",
    credits: 2,
    purpose: "Proposes responsive layouts, design system tokens, and accessible component frames.",
    model: "gemini-2.5-flash",
    tools: ["Design Token Generator", "Grid Layout Engine", "WCAG AA Checker"],
    inputs: ["PRD Requirements", "Brand guidelines", "Display archetype"],
    outputs: ["Design Tokens JSON", "Wireframe Frames", "Component Hierarchy"],
    successRate: 93,
    avgDuration: "1.5s",
    samplePrompt: "Generate a high-contrast dashboard layout with bento metric cards and data tables.",
  },
  // Planning
  {
    id: "epic_generator",
    label: "Epic Generator",
    stage: "planning",
    stageLabel: "Planning",
    hue: "#FF9F0A",
    icon: Layers,
    kind: "gateway",
    credits: 2,
    purpose: "Breaks the PRD into cohesive, quarter-sized epics with dependencies and business goals.",
    model: "gemini-2.5-flash",
    tools: ["WBS Decomposer", "Epic Estimator", "Dependency Grapher"],
    inputs: ["Approved PRD", "Target milestones"],
    outputs: ["Epics Catalog", "Business Value Scores", "Milestone Roadmap"],
    successRate: 94,
    avgDuration: "0.7s",
    samplePrompt: "Decompose PRD into 3 milestones: Auth & Core DB, Agent Gateway, and UI Console.",
  },
  {
    id: "story_generator",
    label: "Story Generator",
    stage: "planning",
    stageLabel: "Planning",
    hue: "#30D158",
    icon: ListChecks,
    kind: "gateway",
    credits: 2,
    purpose: "Expands each epic into implementable user stories with Gherkin Given/When/Then acceptance criteria.",
    model: "gemini-2.5-flash",
    tools: ["Gherkin Generator", "Acceptance Verifier", "Story Point Sizer"],
    inputs: ["Epic definitions", "User personas"],
    outputs: ["User Story Cards", "Acceptance Criteria Suites", "Complexity Points"],
    successRate: 92,
    avgDuration: "0.6s",
    samplePrompt: "Generate user stories for team invitation, role revocation, and RBAC enforcement.",
  },
  {
    id: "task_generator",
    label: "Task Generator",
    stage: "planning",
    stageLabel: "Planning",
    hue: "#64D2FF",
    icon: ListTodo,
    kind: "gateway",
    credits: 2,
    purpose: "Translates user stories into discrete engineering tasks with file targets and test requirements.",
    model: "gemini-2.5-flash",
    tools: ["Task Grapher", "File Target Matcher", "Time Estimator"],
    inputs: ["User stories", "Repository file tree"],
    outputs: ["Engineering Task Graph", "Affected File Paths", "Unit Test Checklists"],
    successRate: 91,
    avgDuration: "0.6s",
    samplePrompt: "Deconstruct story into backend API route, Drizzle migration, and frontend React hook.",
  },
  {
    id: "sprint_planner",
    label: "Sprint Planner",
    stage: "planning",
    stageLabel: "Planning",
    hue: "#AC8E68",
    icon: CalendarRange,
    kind: "gateway",
    credits: 2,
    purpose: "Allocates estimated engineering tasks into sprint sprints balancing agent capacity and dependencies.",
    model: "gemini-2.5-flash",
    tools: ["Capacity Calculator", "Critical Path Solver", "Sprint Board Formatter"],
    inputs: ["Task Graph", "Agent velocity", "Sprint budget"],
    outputs: ["Sprint Backlog", "Critical Path Timeline", "Burn-down Forecast"],
    successRate: 95,
    avgDuration: "0.4s",
    samplePrompt: "Schedule 18 tasks across a 2-week iteration avoiding dependency bottlenecks.",
  },
  {
    id: "pm",
    label: "Project Manager",
    stage: "planning",
    stageLabel: "Planning",
    hue: "#FF9F0A",
    icon: ShieldCheck,
    kind: "build",
    credits: 1,
    purpose: "Enforces milestone approval gates, tracks release health, and aligns stakeholders.",
    model: "gemini-2.5-flash",
    tools: ["Gate Approval Validator", "Health Dashboard Rollup", "Executive Summarizer"],
    inputs: ["Sprint plan", "Gate policies", "Stakeholder reviews"],
    outputs: ["Gate Approval Tokens", "Executive Digest", "Risk Mitigation Actions"],
    successRate: 98,
    avgDuration: "0.4s",
    samplePrompt: "Validate release readiness gate against 100% test pass rate requirement.",
  },
  // Execution
  {
    id: "developer",
    label: "Full-Stack Developer",
    stage: "execution",
    stageLabel: "Execution",
    hue: "#30D158",
    icon: Code2,
    kind: "build",
    credits: 5,
    purpose: "Synthesizes idiomatic TypeScript, React components, and backend API routes matching architecture.",
    model: "gemini-2.5-pro",
    tools: ["AST Code Synthesizer", "Type Checker", "Refactoring Engine", "Import Resolver"],
    inputs: ["Engineering Tasks", "Component Specs", "Existing codebase tree"],
    outputs: ["TypeScript Source Files", "Database Migrations", "API Endpoints"],
    successRate: 94,
    avgDuration: "2.4s",
    samplePrompt: "Implement secure JWT auth route with rate limiting, argon2 hashing, and Drizzle query.",
  },
  {
    id: "task_executor",
    label: "Task Executor",
    stage: "execution",
    stageLabel: "Execution",
    hue: "#FFD60A",
    icon: Terminal,
    kind: "gateway",
    credits: 3,
    purpose: "Runs generated code inside isolated sandbox container: compiles, lints, and executes unit tests.",
    model: "gemini-2.5-flash",
    tools: ["Sandbox Runner", "Vitest/Pytest Harness", "ESLint/TypeScript Compiler"],
    inputs: ["Generated source files", "Unit test files", "Environment configs"],
    outputs: ["Compiler Diagnostics", "Test Results (Pass/Fail)", "Coverage Percentages"],
    successRate: 91,
    avgDuration: "2.1s",
    samplePrompt: "Execute sandbox test suite on newly generated payment reconciliation endpoints.",
  },
  {
    id: "scrum_master",
    label: "Scrum Master",
    stage: "execution",
    stageLabel: "Execution",
    hue: "#0A84FF",
    icon: Users,
    kind: "gateway",
    credits: 1,
    purpose: "Monitors active build execution, unblocks stranded agents, and drafts automated standup notes.",
    model: "gemini-2.5-flash",
    tools: ["Standup Engine", "Blocker Resolver", "Progress Aggregator"],
    inputs: ["Execution stream", "Agent status events"],
    outputs: ["Standup Summary", "Resolved Blockers", "Task Progress Stream"],
    successRate: 97,
    avgDuration: "0.3s",
    samplePrompt: "Audit current execution state and report on active agent throughput.",
  },
  {
    id: "business_improver",
    label: "Business Improver",
    stage: "execution",
    stageLabel: "Execution",
    hue: "#5E5CE6",
    icon: TrendingUp,
    kind: "build",
    credits: 2,
    purpose: "Analyzes production code for conversion optimization, pricing tiers, and analytics telemetry.",
    model: "gemini-2.5-flash",
    tools: ["Analytics Injector", "Monetization Auditor", "SEO / Meta Optimizer"],
    inputs: ["Landing & Checkout code", "Pricing configuration"],
    outputs: ["Analytics Events Map", "Monetization Recommendations"],
    successRate: 95,
    avgDuration: "0.8s",
    samplePrompt: "Audit checkout flow for drop-off risks and inject PostHog telemetry hooks.",
  },
  {
    id: "integration",
    label: "Integration & Deploy",
    stage: "execution",
    stageLabel: "Execution",
    hue: "#FF453A",
    icon: Plug,
    kind: "build",
    credits: 2,
    purpose: "Opens the GitHub Pull Request, verifies CI workflows, and deploys preview container to Cloud Run.",
    model: "gemini-2.5-flash",
    tools: ["GitHub PR Bridge", "Cloud Run Deployer", "Webhook Broadcaster"],
    inputs: ["Passed test logs", "Source branch", "Deployment target config"],
    outputs: ["GitHub Pull Request #142", "Staging Preview URL", "Audit Log Record"],
    successRate: 98,
    avgDuration: "0.8s",
    samplePrompt: "Create pull request with descriptive commit notes and trigger automated staging deployment.",
  },
];

export interface SimulationStep {
  stepNumber: number;
  agentId: string;
  stage: FlowStageId;
  agentLabel: string;
  action: string;
  detail: string;
  durationSec: string;
  inputs: string[];
  outputArtifact: string;
  artifactType: "brief" | "decision" | "architecture" | "prd" | "design" | "epics" | "code" | "tests" | "pr";
  logMessage: string;
}

export interface SimulationScenario {
  id: string;
  name: string;
  tagline: string;
  estimatedRuntime: string;
  tokenSavings: string;
  steps: SimulationStep[];
}

export const SIMULATION_SCENARIOS: SimulationScenario[] = [
  {
    id: "fullstack",
    name: "Full-Stack SaaS Platform",
    tagline: "End-to-end autonomous build: PRD spec to tested microservices and deployed GitHub PR",
    estimatedRuntime: "3.4 min",
    tokenSavings: "42%",
    steps: [
      {
        stepNumber: 1,
        agentId: "business_analyst",
        stage: "discovery",
        agentLabel: "Business Analyst",
        action: "Scope product problem and user personas",
        detail: "Synthesized multi-tenant subscription management brief with 4 target personas and risk mitigation plan.",
        durationSec: "0.9s",
        inputs: ["Prompt: 'Build SaaS billing platform with Stripe & usage metrics'"],
        outputArtifact: "Scoped Brief & Persona Map (brief.md)",
        artifactType: "brief",
        logMessage: "[Business Analyst] Scoped 4 user personas. Identified 2 critical compliance constraints (SOC2, PCI-DSS).",
      },
      {
        stepNumber: 2,
        agentId: "decision_engine",
        stage: "discovery",
        agentLabel: "Decision Engine",
        action: "Score architectural trade-offs",
        detail: "Evaluated relational vs document models. Selected PostgreSQL with Drizzle ORM (Score: 9.2/10).",
        durationSec: "1.1s",
        inputs: ["Brief requirements", "Latency & ACID criteria"],
        outputArtifact: "ADR-001 Relational Storage Decision (adr-001.md)",
        artifactType: "decision",
        logMessage: "[Decision Engine] Evaluated options. Chose PostgreSQL + Drizzle ORM for transaction safety and schema type safety.",
      },
      {
        stepNumber: 3,
        agentId: "architect",
        stage: "definition",
        agentLabel: "System Architect",
        action: "Synthesize system topology & schemas",
        detail: "Drafted 8 relational tables (Users, Tenants, Invoices, Webhooks) and 14 REST API contracts.",
        durationSec: "1.4s",
        inputs: ["ADR-001", "Scoped Brief"],
        outputArtifact: "System Architecture Blueprint (architecture.json)",
        artifactType: "architecture",
        logMessage: "[Architect] Generated 8 normalized tables with foreign keys and index strategies for tenant_id.",
      },
      {
        stepNumber: 4,
        agentId: "prd_writer",
        stage: "definition",
        agentLabel: "PRD Writer",
        action: "Compile section-numbered PRD v1.0",
        detail: "Formulated PRD with 6 numbered requirements, edge cases, error codes, and acceptance gates.",
        durationSec: "1.3s",
        inputs: ["System Blueprint", "Product Scope"],
        outputArtifact: "Structured PRD v1.0 (PRD.md)",
        artifactType: "prd",
        logMessage: "[PRD Writer] Produced 6 core functional requirements with Gherkin acceptance criteria.",
      },
      {
        stepNumber: 5,
        agentId: "designer",
        stage: "definition",
        agentLabel: "UI/UX Designer",
        action: "Formulate design tokens & wireframes",
        detail: "Built responsive 12-column bento layout, accessibility color pairs (WCAG AA), and Tailwind classes.",
        durationSec: "1.2s",
        inputs: ["PRD v1.0", "Brand guidelines"],
        outputArtifact: "Design Tokens & Wireframes (tokens.json)",
        artifactType: "design",
        logMessage: "[Designer] Defined design tokens, high-contrast card states, and responsive navigation shell.",
      },
      {
        stepNumber: 6,
        agentId: "developer",
        stage: "execution",
        agentLabel: "Full-Stack Developer",
        action: "Synthesize production TypeScript codebase",
        detail: "Generated 18 TypeScript files: Express API router, Drizzle ORM client, and React 18 interface components.",
        durationSec: "2.4s",
        inputs: ["Architecture Blueprint", "PRD Requirements", "Design Tokens"],
        outputArtifact: "Full-Stack Source Code (src/**/*.tsx)",
        artifactType: "code",
        logMessage: "[Developer] Synthesized 18 source files without AST errors. Zero missing import warnings.",
      },
      {
        stepNumber: 7,
        agentId: "task_executor",
        stage: "execution",
        agentLabel: "Task Executor",
        action: "Execute sandbox tests & validation",
        detail: "Passed 42 unit and integration tests inside container sandbox with 98.4% code coverage.",
        durationSec: "2.1s",
        inputs: ["Generated Source Code", "Test Suites"],
        outputArtifact: "Sandbox Test Report (42/42 Green)",
        artifactType: "tests",
        logMessage: "[Task Executor] Sandbox execution successful: 42/42 tests passed in 1.8s. 0 vulnerabilities.",
      },
      {
        stepNumber: 8,
        agentId: "integration",
        stage: "execution",
        agentLabel: "Integration & Deploy",
        action: "Open GitHub PR & verify staging build",
        detail: "Created Pull Request #142 with commit logs and deployed live preview to Cloud Run container.",
        durationSec: "0.8s",
        inputs: ["Verified build artifacts", "Git branch: feat/billing-platform"],
        outputArtifact: "GitHub Pull Request #142 & Live Staging URL",
        artifactType: "pr",
        logMessage: "[Integration] Pull Request #142 opened on GitHub. Preview environment live and verified.",
      },
    ],
  },
  {
    id: "microservice",
    name: "Event-Driven API Microservice",
    tagline: "High-throughput API service with Kafka event pub/sub, rate limiters, and telemetry",
    estimatedRuntime: "1.8 min",
    tokenSavings: "36%",
    steps: [
      {
        stepNumber: 1,
        agentId: "business_analyst",
        stage: "discovery",
        agentLabel: "Business Analyst",
        action: "Analyze throughput and latency SLAs",
        detail: "Scoped API throughput requirement (10,000 req/sec) with 99.99% availability target.",
        durationSec: "0.7s",
        inputs: ["Service SLA brief"],
        outputArtifact: "SLA Brief (brief.md)",
        artifactType: "brief",
        logMessage: "[Business Analyst] Established 10,000 RPS requirement with token bucket rate limiting.",
      },
      {
        stepNumber: 2,
        agentId: "architect",
        stage: "definition",
        agentLabel: "System Architect",
        action: "Design event bus and Redis cache tier",
        detail: "Defined pub/sub topics, idempotency keys, and fast-fail circuit breakers.",
        durationSec: "1.2s",
        inputs: ["SLA Brief"],
        outputArtifact: "Microservice Topology (architecture.json)",
        artifactType: "architecture",
        logMessage: "[Architect] Designed circuit breaker pattern with Redis distributed locking.",
      },
      {
        stepNumber: 3,
        agentId: "developer",
        stage: "execution",
        agentLabel: "Full-Stack Developer",
        action: "Implement async event processors",
        detail: "Generated Node.js / Hono microservice with Redis streams and structured JSON logging.",
        durationSec: "2.1s",
        inputs: ["Microservice Topology"],
        outputArtifact: "API Service Code (server.ts)",
        artifactType: "code",
        logMessage: "[Developer] Implemented event workers with exponential backoff retries.",
      },
      {
        stepNumber: 4,
        agentId: "task_executor",
        stage: "execution",
        agentLabel: "Task Executor",
        action: "Run concurrency & load benchmark",
        detail: "Simulated 5,000 concurrent payloads: 0 dropped packets, p99 latency 14ms.",
        durationSec: "1.9s",
        inputs: ["API Service Code"],
        outputArtifact: "Load Test Benchmark Report",
        artifactType: "tests",
        logMessage: "[Task Executor] Load test passed: 0 failures, 14ms p99 response time.",
      },
      {
        stepNumber: 5,
        agentId: "integration",
        stage: "execution",
        agentLabel: "Integration & Deploy",
        action: "Publish container image & deploy",
        detail: "Pushed container to registry and verified health probe on Cloud Run.",
        durationSec: "0.9s",
        inputs: ["Tested Container Image"],
        outputArtifact: "Production Deployment URL",
        artifactType: "pr",
        logMessage: "[Integration] Deployment verified healthy. Prometheus metrics active.",
      },
    ],
  },
  {
    id: "security_patch",
    name: "Automated Security Patch & Hotfix",
    tagline: "Rapid vulnerability remediation: root cause diagnosis to sandboxed regression testing",
    estimatedRuntime: "1.2 min",
    tokenSavings: "51%",
    steps: [
      {
        stepNumber: 1,
        agentId: "business_analyst",
        stage: "discovery",
        agentLabel: "Business Analyst",
        action: "Triage CVE alert & incident impact",
        detail: "Identified Prototype Pollution risk in nested parameter parser. Scoped blast radius.",
        durationSec: "0.5s",
        inputs: ["CVE security advisory payload"],
        outputArtifact: "Vulnerability Assessment (brief.md)",
        artifactType: "brief",
        logMessage: "[Business Analyst] Triaged CVE vulnerability: input sanitizer bypass in query parser.",
      },
      {
        stepNumber: 2,
        agentId: "developer",
        stage: "execution",
        agentLabel: "Full-Stack Developer",
        action: "Synthesize cryptographic sanitize patch",
        detail: "Applied Object.freeze and strict Zod validation schema to reject prototype tampering.",
        durationSec: "1.4s",
        inputs: ["Vulnerability Assessment", "Vulnerable code path"],
        outputArtifact: "Security Patch Diff (patch.diff)",
        artifactType: "code",
        logMessage: "[Developer] Applied defensive copy and strict Zod schema to reject forbidden keys.",
      },
      {
        stepNumber: 3,
        agentId: "task_executor",
        stage: "execution",
        agentLabel: "Task Executor",
        action: "Execute exploit payload attack vectors",
        detail: "Executed 16 exploit tests; all malicious payloads blocked with HTTP 400 Bad Request.",
        durationSec: "1.5s",
        inputs: ["Security Patch Diff", "Exploit Test Harness"],
        outputArtifact: "Penetration Test Report (16/16 Blocked)",
        artifactType: "tests",
        logMessage: "[Task Executor] 16 exploit attack vectors successfully deflected. Zero regressions.",
      },
      {
        stepNumber: 4,
        agentId: "integration",
        stage: "execution",
        agentLabel: "Integration & Deploy",
        action: "Submit hotfix PR & trigger emergency release",
        detail: "Submitted PR #143 labeled 'security-hotfix' and notified security engineering channel.",
        durationSec: "0.6s",
        inputs: ["Verified Patch"],
        outputArtifact: "Hotfix PR #143 (Ready to Merge)",
        artifactType: "pr",
        logMessage: "[Integration] Hotfix PR #143 tagged for automated merge once maintainer signs off.",
      },
    ],
  },
];

export const MOCK_ARTIFACT_PREVIEWS = {
  brief: {
    title: "Scoped Product Brief",
    filename: "brief.md",
    language: "markdown",
    content: `# Product Brief: Autonomous Multi-Tenant Billing Engine

## 1. Executive Summary
Provide modern engineering teams with self-serve billing, metering, and credit top-up workflows without manual invoice operations.

## 2. Target Personas
- **Org Administrator**: Needs consolidated monthly invoices, usage quotas, and member seat control.
- **Finance Manager**: Needs downloadable CSV tax exports and webhook alerts when balances cross 80%.
- **Developer User**: Needs deterministic API key quotas and instant payment confirmation.

## 3. Core Assumptions & Constraints
- Zero customer payment data touches internal servers (Stripe & Cashfree tokenization only).
- Multi-currency support (USD, EUR, INR) with real-time rate fallback.
- ACID compliance on credit deduction transactions.`,
  },
  decision: {
    title: "Architecture Decision Record (ADR)",
    filename: "ADR-001-storage-selection.md",
    language: "markdown",
    content: `# ADR-001: Relational Database Selection with Drizzle ORM

## Context
The application requires high-frequency credit deduction transactions, multi-tenant billing records, and audit logs.

## Options Evaluated
1. **PostgreSQL + Drizzle ORM**: Score 9.4/10 (Strong ACID, schema migrations, lightweight client).
2. **MongoDB + Mongoose**: Score 7.1/10 (Flexible docs, but complex multi-document distributed transactions).
3. **Cloud Firestore**: Score 8.0/10 (Excellent client sync, but higher query latency for batch billing).

## Decision
Adopt **PostgreSQL with Drizzle ORM** for zero-overhead TypeScript typing, deterministic schema migrations, and rock-solid relational foreign key constraints.`,
  },
  architecture: {
    title: "System Architecture Blueprint",
    filename: "architecture.json",
    language: "json",
    content: `{
  "system": "Forge Autonomous Billing Engine",
  "version": "2.4.0",
  "runtime": "Node.js 22 LTS + Hono / Express",
  "database": {
    "engine": "PostgreSQL 16",
    "orm": "Drizzle ORM",
    "tables": [
      "users",
      "organizations",
      "credit_ledgers",
      "invoices",
      "webhook_endpoints",
      "audit_logs"
    ],
    "indexes": [
      "idx_users_org_id",
      "idx_ledgers_user_timestamp",
      "idx_invoices_status"
    ]
  },
  "caching": {
    "engine": "Redis 7.2",
    "ttl_seconds": 3600,
    "keys": ["org_credits:*", "rate_limit:*"]
  },
  "api_routes": [
    { "method": "POST", "path": "/api/billing/checkout", "auth": "Bearer" },
    { "method": "GET",  "path": "/api/billing/usage",    "auth": "Bearer" },
    { "method": "POST", "path": "/api/billing/topup",    "auth": "Bearer" }
  ]
}`,
  },
  prd: {
    title: "Structured PRD Specification",
    filename: "PRD-v1.0.md",
    language: "markdown",
    content: `# Product Requirements Document (PRD) v1.0
**Project**: Autonomous Multi-Tenant Billing Engine  
**Author**: PRD Writer Agent  
**Status**: APPROVED

### Functional Requirements
- **FR-1**: User must be able to view current credit balance with live WebSocket updates within 200ms.
- **FR-2**: When balance drops below 20%, an automated in-app banner and email notification must be triggered.
- **FR-3**: Support one-click credit pack purchase via Stripe Checkout with idempotent webhook processing.
- **FR-4**: Export tax-compliant monthly PDF invoices with itemized API call counts and model token usage.

### Non-Functional Requirements
- **NFR-1 Latency**: Checkout session creation under 350ms.
- **NFR-2 Security**: All webhook payloads verified via HMAC-SHA256 signature before processing.
- **NFR-3 Availability**: 99.95% uptime SLA for balance verification endpoints.`,
  },
  design: {
    title: "Design System Tokens & Layout",
    filename: "tokens.json",
    language: "json",
    content: `{
  "theme": "Neubrutalism High-Contrast",
  "colors": {
    "base": "#F4F0EA",
    "panel": "#FFFFFF",
    "ink": "#0A0A0A",
    "accent": "#14B8A6",
    "ok": "#00F59B",
    "warn": "#FF8A00",
    "error": "#FF5376"
  },
  "borders": {
    "width": "2px",
    "color": "#000000",
    "radius": "4px"
  },
  "shadows": {
    "brutal": "4px 4px 0px #000000",
    "brutal_sm": "2px 2px 0px #000000"
  },
  "typography": {
    "display": "Space Grotesk, system-ui",
    "mono": "JetBrains Mono, monospace"
  }
}`,
  },
  code: {
    title: "Generated Full-Stack Source Code",
    filename: "src/server/routes/billing.ts",
    language: "typescript",
    content: `import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client";
import { creditLedgers, invoices } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { stripeClient } from "../services/stripe";

export const billingRouter = Router();

const CheckoutSchema = z.object({
  packageId: z.enum(["pack_starter", "pack_pro", "pack_enterprise"]),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

billingRouter.post("/checkout", requireAuth, async (req, res) => {
  const parsed = CheckoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
  }

  const session = await stripeClient.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [{ price: parsed.data.packageId, quantity: 1 }],
    mode: "payment",
    success_url: parsed.data.successUrl,
    cancel_url: parsed.data.cancelUrl,
    metadata: { userId: req.user.id, orgId: req.user.orgId },
  });

  return res.json({ checkoutUrl: session.url, sessionId: session.id });
});`,
  },
  tests: {
    title: "Sandbox Test Execution Output",
    filename: "test-run.log",
    language: "shell",
    content: `[SANDBOX] Vitest v2.1.8 running on Node.js 22.4.1 (linux-x64)
✓ src/tests/auth.test.ts (8 tests) 142ms
✓ src/tests/billing-checkout.test.ts (14 tests) 310ms
✓ src/tests/webhook-hmac.test.ts (12 tests) 205ms
✓ src/tests/balance-deduction.test.ts (8 tests) 180ms

Test Files  4 passed (4)
     Tests  42 passed (42)
  Duration  1.84s (transform 320ms, setup 180ms, collect 420ms, tests 920ms)

Coverage Summary:
Statements   : 98.4% ( 492/500 )
Branches     : 96.1% ( 98/102 )
Functions    : 100%  ( 64/64 )
Lines        : 98.4% ( 482/490 )

[SANDBOX] Build validation: PASSED with 0 exit code. Ready for release.`,
  },
  pr: {
    title: "GitHub Pull Request #142",
    filename: "github-pr-142.json",
    language: "json",
    content: `{
  "number": 142,
  "title": "feat(billing): autonomous multi-tenant credit ledger and Stripe checkout",
  "state": "open",
  "branch": "feat/billing-platform -> main",
  "author": "forge-ai[bot]",
  "changed_files": 18,
  "additions": 1420,
  "deletions": 48,
  "checks": [
    { "name": "vitest / unit-tests", "status": "passed", "duration": "1.8s" },
    { "name": "tsc / type-check",   "status": "passed", "duration": "1.1s" },
    { "name": "eslint / linter",    "status": "passed", "duration": "0.9s" },
    { "name": "cloud-run / preview", "status": "passed", "url": "https://preview-pr-142.forge.dev" }
  ],
  "reviewers": ["security-engineer", "lead-architect"],
  "mergeable": true
}`,
  },
};
