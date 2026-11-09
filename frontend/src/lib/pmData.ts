import type {
  PMInitiative,
  PMPRD,
  PMEpic,
  PMStory,
  PMTask,
  PMSprint,
  PMExecution,
} from "./types/api";

export const SAMPLE_INITIATIVES: PMInitiative[] = [
  {
    id: "init-fintech-ledger",
    user_id: "user-system",
    name: "Autonomous FinTech Clearing & Real-Time Settlement Engine",
    status: "active",
    vision:
      "High-throughput event-sourced transaction ledger with zero-drift reconciliation, multi-currency wallets, and automated regulatory audit logging.",
    business_goals: [
      "Sub-50ms transaction latency under peak 50k ops/sec load",
      "Zero-tolerance double-spend prevention with idempotent event sourcing",
      "Automated compliance filing for ISO 20022 and PCI-DSS audit trails",
    ],
    product_scope:
      "Core transaction pipeline, ledger consensus agent, fraud anomaly detection hook, and multi-tenant ledger UI.",
    functional_requirements: [
      "Double-entry bookkeeping validation with atomic debit/credit constraints",
      "Instantaneous settlement webhooks with exponential retry semantics",
      "Real-time fraud score gating before transaction ledger commitment",
    ],
    non_functional_requirements: [
      "99.999% system availability with multi-region quorum",
      "Strict data encryption at rest (AES-256) and in transit (mTLS 1.3)",
    ],
    success_metrics: [
      "Daily clearing volume > $10M without manual intervention",
      "Reconciliation discrepancy rate < 0.0001%",
    ],
    tech_stack: ["TypeScript", "Kafka", "PostgreSQL", "Go", "Redis", "TailwindCSS"],
    estimated_timeline: "6 sprints · 12 weeks",
    project_ids: ["proj-ledger-core", "proj-reconcile-worker"],
    version: 3,
    created_at: new Date(Date.now() - 14 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 3600000).toISOString(),
  },
  {
    id: "init-incident-copilot",
    user_id: "user-system",
    name: "Autonomous Site Reliability & Incident Remediation Agent",
    status: "completed",
    vision:
      "AI SRE copilot that monitors telemetry, detects infrastructure anomalies, correlates telemetry with git commits, and drafts automated rollbacks.",
    business_goals: [
      "Reduce Mean Time to Resolution (MTTR) by 65% across tier-1 services",
      "Zero noisy false alarms through Bayesian anomaly thresholding",
      "Generate comprehensive root-cause analysis within 120s of incident resolution",
    ],
    product_scope:
      "Telemetry ingestion pipeline, AST log correlator, remediation executor, and executive incident summary dashboard.",
    functional_requirements: [
      "Continuous streaming ingest of OpenTelemetry spans and Prometheus metrics",
      "Automated git blame and commit AST diff matching during high error rates",
      "One-click canary rollback execution with Kubernetes API integration",
    ],
    non_functional_requirements: [
      "Telemetry processing latency < 500ms",
      "Fail-safe execution gates requiring dual-key confirmation for production rollbacks",
    ],
    success_metrics: [
      "Automated mitigation executed in 88% of P2/P3 incidents",
      "SRE on-call fatigue reduced by 40%",
    ],
    tech_stack: ["Python", "Gemini 2.5 Pro", "Prometheus", "Kubernetes", "FastAPI"],
    estimated_timeline: "4 sprints · 8 weeks",
    project_ids: ["proj-sre-copilot"],
    version: 2,
    created_at: new Date(Date.now() - 28 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 18 * 3600000).toISOString(),
  },
  {
    id: "init-healthcare-triage",
    user_id: "user-system",
    name: "Clinical Tele-Triage & Automated EHR Sync Platform",
    status: "generating",
    vision:
      "HIPAA-compliant asynchronous patient triage portal with smart conversational intake, vital anomaly triage, and automated FHIR/HL7 EHR synchronization.",
    business_goals: [
      "Reduce emergency department wait times by 35% through pre-intake triage",
      "Seamless bi-directional sync with Epic & Cerner hospital health records",
      "Full HIPAA, HITECH, and SOC2 Type II certification compliance",
    ],
    product_scope:
      "Patient triage conversational agent, clinical review workstation, FHIR adapter bridge, and doctor handoff dashboard.",
    functional_requirements: [
      "Multi-modal patient symptom capture with differential diagnosis scoring",
      "Standardized HL7/FHIR v4 resource generation for intake observations",
      "Real-time clinician alert escalation for critical vital telemetry",
    ],
    non_functional_requirements: [
      "End-to-end zero-knowledge encryption for all Protected Health Information",
      "WCAG 2.1 AAA accessibility for patient-facing interactive views",
    ],
    success_metrics: [
      "Intake completion time reduced from 22 mins to 4.5 mins",
      "Clinical data entry accuracy exceeding 99.4%",
    ],
    tech_stack: ["React", "FastAPI", "FHIR API", "PostgreSQL", "TailwindCSS"],
    estimated_timeline: "8 sprints · 16 weeks",
    project_ids: ["proj-tele-triage"],
    version: 1,
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 15 * 60000).toISOString(),
  },
  {
    id: "init-developer-sandbox",
    user_id: "user-system",
    name: "Cloud Sandbox & AST Security Vulnerability Scanner",
    status: "active",
    vision:
      "Browser-based ephemeral container execution environment with real-time abstract syntax tree analysis and zero-trust permission isolation.",
    business_goals: [
      "Instant code preview startup (< 800ms) inside WebAssembly containers",
      "Block zero-day supply chain package attacks before container compilation",
      "Zero unauthorized filesystem escape vectors in user code executions",
    ],
    product_scope:
      "WebAssembly runtime bridge, AST static analyzer, vulnerability CVE lookup worker, and IDE preview panel.",
    functional_requirements: [
      "Dynamic sandboxing of npm and pip package post-install scripts",
      "Real-time dependency license compliance and vulnerability banner generation",
      "Ephemeral container resource limiting (CPU, Memory, Network egress)",
    ],
    non_functional_requirements: [
      "Sandbox memory footprint < 64MB per running worker instance",
      "Air-gapped execution mode for proprietary financial modules",
    ],
    success_metrics: [
      "Vulnerability detection recall > 99.8%",
      "Under 1 second mean build latency for TypeScript applets",
    ],
    tech_stack: ["WebAssembly", "Docker", "Node.js", "TailwindCSS", "Rust"],
    estimated_timeline: "5 sprints · 10 weeks",
    project_ids: ["proj-cloud-sandbox"],
    version: 2,
    created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 8 * 3600000).toISOString(),
  },
  {
    id: "init-ai-marketplace",
    user_id: "user-system",
    name: "Autonomous Agent Tool Connector & Extension Marketplace",
    status: "draft",
    vision:
      "Decentralized ecosystem for custom autonomous agents, LLM tool definitions, credit billing, and community extension distribution.",
    business_goals: [
      "Empower third-party developers to publish verified agent tool extensions",
      "Unified usage-based billing with automated creator revenue splits",
      "Strict sandbox verification before extension publishing approval",
    ],
    product_scope:
      "Extension packaging specification, review board pipeline, creator dashboard, and in-app catalog.",
    functional_requirements: [
      "OpenAPI 3.1 tool definition validator and sandbox mock runner",
      "Stripe Connect integration for automatic creator monthly payouts",
      "Semantic similarity search across marketplace agent capabilities",
    ],
    non_functional_requirements: [
      "Tool invocation proxy latency overhead < 15ms",
      "Deterministic capability tagging and rating verification",
    ],
    success_metrics: [
      "Over 100 verified community tool extensions published",
      "Gross merchandise volume > $50k in first quarter",
    ],
    tech_stack: ["React", "TailwindCSS", "Stripe", "PostgreSQL", "Node.js"],
    estimated_timeline: "3 sprints · 6 weeks",
    project_ids: [],
    version: 1,
    created_at: new Date(Date.now() - 40 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
];

export const SAMPLE_PRDS: Record<string, PMPRD> = {
  "init-fintech-ledger": {
    id: "prd-fintech-ledger",
    initiative_id: "init-fintech-ledger",
    executive_summary:
      "The FinTech Clearing & Settlement Engine provides cryptographic double-entry ledger capabilities designed for high-frequency financial platforms. By separating state mutation from event log projection, it guarantees immutable auditability and real-time transaction reconciliation across multi-currency accounts.",
    problem_statement:
      "Legacy batch clearing pipelines incur 24-48 hour settlement delays, high reconciliation error rates, and vulnerability to concurrency double-spends during high volatility traffic spikes.",
    solution:
      "An event-sourced consensus architecture utilizing Raft log replication and Redis cache-aside projection, accompanied by autonomous reconciliation agents that flag ledger drift within milliseconds.",
    security:
      "Mutual TLS 1.3 encryption across all internal microservices, hardware security module (HSM) signing of clearing blocks, and PCI-DSS Level 1 compliant data masking.",
    performance:
      "SLA: 99.9th percentile commit latency under 45ms at 50,000 requests per second. Zero database lock contention via partition-key sharding.",
    scalability:
      "Horizontally scalable stateless ledger ingestion nodes backed by distributed Kafka partitions and PostgreSQL write instances.",
    api_overview:
      "gRPC internal service mesh for inter-ledger coordination, alongside REST and WebSocket public APIs for client deposit/clearing notifications.",
    database_overview:
      "PostgreSQL partitioned by account_id and ledger_date, utilizing immutable append-only transaction tables and materialized balance snapshots.",
    release_plan:
      "Phase 1: Alpha deployment in sandbox with simulated transaction traffic. Phase 2: Canary rollout with 5% partner volume. Phase 3: General Availability.",
    version: 3,
  },
};

export const SAMPLE_EPICS: Record<string, PMEpic[]> = {
  "init-fintech-ledger": [
    {
      id: "epic-1",
      initiative_id: "init-fintech-ledger",
      title: "Core Double-Entry Event Sourcing Pipeline",
      description: "Immutable transactional event stream with atomic debit/credit constraints and zero balance divergence.",
      priority: "p0",
      story_points: 34,
      estimated_duration: "3 weeks",
      owner: "Lead Systems Architect",
      status: "in_progress",
      order: 1,
    },
    {
      id: "epic-2",
      initiative_id: "init-fintech-ledger",
      title: "Real-Time Anomaly & Fraud Scoring Gate",
      description: "Sub-5ms inline fraud detection heuristic model verifying velocity, IP reputation, and balance deviation.",
      priority: "p1",
      story_points: 21,
      estimated_duration: "2 weeks",
      owner: "Security Specialist",
      status: "ready",
      order: 2,
    },
    {
      id: "epic-3",
      initiative_id: "init-fintech-ledger",
      title: "Autonomous Reconciliation & Audit Telemetry",
      description: "Continuous background reconciler comparing external bank settlement feeds with internal ledger logs.",
      priority: "p1",
      story_points: 18,
      estimated_duration: "2 weeks",
      owner: "Compliance Engineer",
      status: "ready",
      order: 3,
    },
  ],
};

export const SAMPLE_STORIES: Record<string, PMStory[]> = {
  "init-fintech-ledger": [
    {
      id: "story-101",
      epic_id: "epic-1",
      initiative_id: "init-fintech-ledger",
      title: "Atomic Transaction Commit Validator",
      description: "As a ledger worker, I need atomic validation of double-entry debit and credit totals before writing to the immutable log.",
      acceptance_criteria: [
        "Sum of debits must equal sum of credits to the exact integer cent",
        "Source account must have sufficient settled balance or pre-approved overdraft limit",
        "Idempotency token must reject duplicate client requests within a 24-hour window",
      ],
      definition_of_done: ["Unit test suite passes with 100% boundary condition coverage", "Integration benchmark verifies 25k ops/sec"],
      priority: "p0",
      story_points: 8,
      status: "in_progress",
    },
    {
      id: "story-102",
      epic_id: "epic-1",
      initiative_id: "init-fintech-ledger",
      title: "Kafka Event Partition Sharding",
      description: "Configure distributed event partitions grouped by customer account hash to prevent cross-account head-of-line blocking.",
      acceptance_criteria: [
        "Events for a given account key are guaranteed strict sequential ordering",
        "Partition rebalancing completes under 500ms without message loss",
      ],
      priority: "p1",
      story_points: 5,
      status: "done",
    },
    {
      id: "story-103",
      epic_id: "epic-2",
      initiative_id: "init-fintech-ledger",
      title: "Velocity Anomaly Detector Hook",
      description: "Evaluate transaction frequency per user to identify sudden account takeovers or automated bot attacks.",
      acceptance_criteria: [
        "Flag user accounts executing > 10 transactions in under 5 seconds",
        "Emit telemetry event with risk score to the moderation dashboard",
      ],
      priority: "p1",
      story_points: 8,
      status: "ready",
    },
  ],
};

export const SAMPLE_TASKS: Record<string, PMTask[]> = {
  "init-fintech-ledger": [
    {
      id: "task-01",
      story_id: "story-101",
      epic_id: "epic-1",
      initiative_id: "init-fintech-ledger",
      title: "Implement PostgreSQL advisory lock for account balance mutation",
      description: "Prevent race conditions during simultaneous parallel transfers on the same account ID.",
      status: "done",
      assigned_agent: "backend_agent",
      estimated_hours: 6,
      priority: "p0",
      category: "backend",
    },
    {
      id: "task-02",
      story_id: "story-101",
      epic_id: "epic-1",
      initiative_id: "init-fintech-ledger",
      title: "Synthesize idempotent clearing endpoint with gRPC proto specs",
      description: "Generate protobuf stubs and register service methods for /ClearingService/ProcessTransfer.",
      status: "in_progress",
      assigned_agent: "systems_agent",
      estimated_hours: 8,
      priority: "p0",
      category: "backend",
      dependencies: ["task-01"],
    },
    {
      id: "task-03",
      story_id: "story-101",
      epic_id: "epic-1",
      initiative_id: "init-fintech-ledger",
      title: "Build multi-currency ledger balance snapshot visualizer",
      description: "Real-time UI widget showing live balance, unsettled holds, and reserve ratios.",
      status: "ready",
      assigned_agent: "frontend_agent",
      estimated_hours: 5,
      priority: "p1",
      category: "frontend",
      dependencies: ["task-02"],
    },
    {
      id: "task-04",
      story_id: "story-102",
      epic_id: "epic-1",
      initiative_id: "init-fintech-ledger",
      title: "Write chaos testing suite simulating Kafka partition disconnects",
      description: "Verify that network partitions trigger safe client retry semantics without transaction duplication.",
      status: "code_review",
      assigned_agent: "qa_agent",
      estimated_hours: 10,
      priority: "p1",
      category: "testing",
    },
    {
      id: "task-05",
      story_id: "story-103",
      epic_id: "epic-2",
      initiative_id: "init-fintech-ledger",
      title: "Connect Redis sliding window counter for velocity rate-limiting",
      description: "Store transaction timestamps with 60-second TTL in Redis sorted sets.",
      status: "testing",
      assigned_agent: "security_agent",
      estimated_hours: 4,
      priority: "p1",
      category: "backend",
    },
    {
      id: "task-06",
      story_id: "story-103",
      epic_id: "epic-2",
      initiative_id: "init-fintech-ledger",
      title: "Conduct penetration test on clearing webhook signature validation",
      description: "Verify HMAC SHA-256 signature verification and timing-attack resistance.",
      status: "backlog",
      assigned_agent: "security_agent",
      estimated_hours: 8,
      priority: "p0",
      category: "security",
      dependencies: ["task-02", "task-05"],
    },
  ],
};

export const SAMPLE_SPRINTS: Record<string, PMSprint[]> = {
  "init-fintech-ledger": [
    {
      id: "sprint-1",
      initiative_id: "init-fintech-ledger",
      sprint_number: 1,
      name: "Sprint 1: Core Ledger Primitives",
      goal: "Establish immutable double-entry journal schema, atomic validations, and Kafka broker topology.",
      start_date: new Date(Date.now() - 14 * 86400000).toISOString(),
      end_date: new Date(Date.now() - 1 * 86400000).toISOString(),
      capacity: 40,
      velocity: 38,
      story_points_planned: 38,
      story_points_completed: 38,
      status: "completed",
    },
    {
      id: "sprint-2",
      initiative_id: "init-fintech-ledger",
      sprint_number: 2,
      name: "Sprint 2: Real-time Settlement & Fraud Gating",
      goal: "Implement inline fraud heuristic validation, gRPC proto routing, and automated reconciliation jobs.",
      start_date: new Date(Date.now()).toISOString(),
      end_date: new Date(Date.now() + 13 * 86400000).toISOString(),
      capacity: 45,
      velocity: 42,
      story_points_planned: 42,
      story_points_completed: 18,
      status: "active",
    },
  ],
};

export const SAMPLE_EXECUTIONS: Record<string, PMExecution[]> = {
  "init-fintech-ledger": [
    {
      id: "exec-01",
      initiative_id: "init-fintech-ledger",
      task_id: "task-02",
      agent_type: "systems_agent",
      status: "running",
      started_at: new Date(Date.now() - 1200000).toISOString(),
    },
    {
      id: "exec-02",
      initiative_id: "init-fintech-ledger",
      task_id: "task-01",
      agent_type: "backend_agent",
      status: "completed",
      started_at: new Date(Date.now() - 3600000).toISOString(),
      completed_at: new Date(Date.now() - 1800000).toISOString(),
    },
  ],
};

const LOCAL_STORAGE_KEY = "forge_local_initiatives_v1";
const LOCAL_DETAILS_KEY_PREFIX = "forge_initiative_details_v1_";

export function getLocalInitiatives(): PMInitiative[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveLocalInitiative(init: PMInitiative): void {
  try {
    const existing = getLocalInitiatives().filter((i) => i.id !== init.id);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([init, ...existing]));
  } catch {
    // ignore local storage errors
  }
}

export function saveLocalInitiativeDetails(pkg: {
  initiative: PMInitiative;
  prd: PMPRD | null;
  epics: PMEpic[];
  stories: PMStory[];
  tasks: PMTask[];
  sprints: PMSprint[];
  executions: PMExecution[];
  is_real_llm?: boolean;
  generated_by?: string;
}): void {
  try {
    saveLocalInitiative(pkg.initiative);
    localStorage.setItem(
      `${LOCAL_DETAILS_KEY_PREFIX}${pkg.initiative.id}`,
      JSON.stringify(pkg)
    );
  } catch (err) {
    console.error("Failed to save local initiative package:", err);
  }
}

export function getLocalInitiativeDetails(id: string): {
  initiative: PMInitiative;
  prd: PMPRD | null;
  epics: PMEpic[];
  stories: PMStory[];
  tasks: PMTask[];
  sprints: PMSprint[];
  executions: PMExecution[];
  is_real_llm?: boolean;
  generated_by?: string;
} | null {
  try {
    const raw = localStorage.getItem(`${LOCAL_DETAILS_KEY_PREFIX}${id}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function updateLocalTaskStatus(initiativeId: string, taskId: string, newStatus: string): void {
  try {
    const details = getLocalInitiativeDetails(initiativeId);
    if (!details) return;
    const taskIndex = details.tasks.findIndex((t) => t.id === taskId);
    if (taskIndex !== -1) {
      details.tasks[taskIndex].status = newStatus as any;
      saveLocalInitiativeDetails(details);
    }
  } catch (err) {
    console.error("Failed to update local task status:", err);
  }
}

export function updateLocalTask(initiativeId: string, taskId: string, patch: Partial<PMTask>): void {
  try {
    const details = getLocalInitiativeDetails(initiativeId);
    if (details) {
      const taskIndex = details.tasks.findIndex((t) => t.id === taskId);
      if (taskIndex !== -1) {
        details.tasks[taskIndex] = { ...details.tasks[taskIndex], ...patch };
        saveLocalInitiativeDetails(details);
        return;
      }
    }
    if (SAMPLE_TASKS[initiativeId]) {
      const idx = SAMPLE_TASKS[initiativeId].findIndex((t) => t.id === taskId);
      if (idx !== -1) {
        SAMPLE_TASKS[initiativeId][idx] = { ...SAMPLE_TASKS[initiativeId][idx], ...patch };
      }
    }
  } catch (err) {
    console.error("Failed to update local task:", err);
  }
}

export function addLocalTask(initiativeId: string, task: PMTask): void {
  try {
    const details = getLocalInitiativeDetails(initiativeId);
    if (details) {
      details.tasks.unshift(task);
      saveLocalInitiativeDetails(details);
      return;
    }
    if (SAMPLE_TASKS[initiativeId]) {
      SAMPLE_TASKS[initiativeId].unshift(task);
    }
  } catch (err) {
    console.error("Failed to add local task:", err);
  }
}

export function deleteLocalTask(initiativeId: string, taskId: string): void {
  try {
    const details = getLocalInitiativeDetails(initiativeId);
    if (details) {
      // Remove task
      details.tasks = details.tasks.filter((t) => t.id !== taskId);
      // Cascade: remove taskId from other tasks' dependencies
      details.tasks.forEach((t) => {
        if (Array.isArray(t.dependencies)) {
          t.dependencies = t.dependencies.filter((depId) => depId !== taskId);
        }
      });
      // Cascade: remove taskId from sprint task_ids
      if (Array.isArray(details.sprints)) {
        details.sprints.forEach((s) => {
          if (Array.isArray(s.task_ids)) {
            s.task_ids = s.task_ids.filter((id) => id !== taskId);
          }
        });
      }
      saveLocalInitiativeDetails(details);
      return;
    }
    if (SAMPLE_TASKS[initiativeId]) {
      SAMPLE_TASKS[initiativeId] = SAMPLE_TASKS[initiativeId].filter((t) => t.id !== taskId);
      SAMPLE_TASKS[initiativeId].forEach((t) => {
        if (Array.isArray(t.dependencies)) {
          t.dependencies = t.dependencies.filter((depId) => depId !== taskId);
        }
      });
    }
  } catch (err) {
    console.error("Failed to delete local task:", err);
  }
}

export function updateLocalEpic(initiativeId: string, epicId: string, patch: Partial<PMEpic>): void {
  try {
    const details = getLocalInitiativeDetails(initiativeId);
    if (details && Array.isArray(details.epics)) {
      const idx = details.epics.findIndex((e) => e.id === epicId);
      if (idx !== -1) {
        details.epics[idx] = { ...details.epics[idx], ...patch, updated_at: new Date().toISOString() };
        saveLocalInitiativeDetails(details);
        return;
      }
    }
    if (SAMPLE_EPICS[initiativeId]) {
      const idx = SAMPLE_EPICS[initiativeId].findIndex((e) => e.id === epicId);
      if (idx !== -1) {
        SAMPLE_EPICS[initiativeId][idx] = { ...SAMPLE_EPICS[initiativeId][idx], ...patch };
      }
    }
  } catch (err) {
    console.error("Failed to update local epic:", err);
  }
}

export function addLocalEpic(initiativeId: string, epic: PMEpic): void {
  try {
    const details = getLocalInitiativeDetails(initiativeId);
    if (details) {
      if (!Array.isArray(details.epics)) details.epics = [];
      details.epics.push(epic);
      saveLocalInitiativeDetails(details);
      return;
    }
    if (SAMPLE_EPICS[initiativeId]) {
      SAMPLE_EPICS[initiativeId].push(epic);
    }
  } catch (err) {
    console.error("Failed to add local epic:", err);
  }
}

export function deleteLocalEpic(initiativeId: string, epicId: string): void {
  try {
    const details = getLocalInitiativeDetails(initiativeId);
    if (details) {
      details.epics = (details.epics || []).filter((e) => e.id !== epicId);
      // Reassign or unbind stories pointing to this epic
      const fallbackEpicId = details.epics[0]?.id || `epic-default-${initiativeId}`;
      (details.stories || []).forEach((s) => {
        if (s.epic_id === epicId) {
          s.epic_id = fallbackEpicId;
        }
      });
      saveLocalInitiativeDetails(details);
      return;
    }
    if (SAMPLE_EPICS[initiativeId]) {
      SAMPLE_EPICS[initiativeId] = SAMPLE_EPICS[initiativeId].filter((e) => e.id !== epicId);
    }
  } catch (err) {
    console.error("Failed to delete local epic:", err);
  }
}

export function updateLocalStory(initiativeId: string, storyId: string, patch: Partial<PMStory>): void {
  try {
    const details = getLocalInitiativeDetails(initiativeId);
    if (details && Array.isArray(details.stories)) {
      const idx = details.stories.findIndex((s) => s.id === storyId);
      if (idx !== -1) {
        details.stories[idx] = { ...details.stories[idx], ...patch, updated_at: new Date().toISOString() };
        saveLocalInitiativeDetails(details);
        return;
      }
    }
    if (SAMPLE_STORIES[initiativeId]) {
      const idx = SAMPLE_STORIES[initiativeId].findIndex((s) => s.id === storyId);
      if (idx !== -1) {
        SAMPLE_STORIES[initiativeId][idx] = { ...SAMPLE_STORIES[initiativeId][idx], ...patch };
      }
    }
  } catch (err) {
    console.error("Failed to update local story:", err);
  }
}

export function addLocalStory(initiativeId: string, story: PMStory): void {
  try {
    const details = getLocalInitiativeDetails(initiativeId);
    if (details) {
      if (!Array.isArray(details.stories)) details.stories = [];
      details.stories.push(story);
      saveLocalInitiativeDetails(details);
      return;
    }
    if (SAMPLE_STORIES[initiativeId]) {
      SAMPLE_STORIES[initiativeId].push(story);
    }
  } catch (err) {
    console.error("Failed to add local story:", err);
  }
}

export function deleteLocalStory(initiativeId: string, storyId: string): void {
  try {
    const details = getLocalInitiativeDetails(initiativeId);
    if (details) {
      details.stories = (details.stories || []).filter((s) => s.id !== storyId);
      // Reassign tasks pointing to this story
      const fallbackStoryId = details.stories[0]?.id || `story-default-${initiativeId}`;
      (details.tasks || []).forEach((t) => {
        if (t.story_id === storyId) {
          t.story_id = fallbackStoryId;
        }
      });
      saveLocalInitiativeDetails(details);
      return;
    }
    if (SAMPLE_STORIES[initiativeId]) {
      SAMPLE_STORIES[initiativeId] = SAMPLE_STORIES[initiativeId].filter((s) => s.id !== storyId);
    }
  } catch (err) {
    console.error("Failed to delete local story:", err);
  }
}

export function updateLocalInitiative(initiativeId: string, patch: Partial<PMInitiative>): void {
  try {
    const details = getLocalInitiativeDetails(initiativeId);
    if (details) {
      details.initiative = { ...details.initiative, ...patch, updated_at: new Date().toISOString() };
      saveLocalInitiativeDetails(details);
    }
    const all = getLocalInitiatives();
    const idx = all.findIndex((i) => i.id === initiativeId);
    if (idx !== -1) {
      all[idx] = { ...all[idx], ...patch, updated_at: new Date().toISOString() };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(all));
    }
  } catch (err) {
    console.error("Failed to update local initiative:", err);
  }
}

export function addLocalExecution(initiativeId: string, exec: PMExecution): void {
  try {
    const details = getLocalInitiativeDetails(initiativeId);
    if (!details) return;
    details.executions = [exec, ...details.executions.filter((e) => e.id !== exec.id)];
    saveLocalInitiativeDetails(details);
  } catch (err) {
    console.error("Failed to add local execution:", err);
  }
}

export function updateLocalSprint(initiativeId: string, sprintId: string, patch: Partial<PMSprint>): void {
  try {
    const details = getLocalInitiativeDetails(initiativeId);
    if (details) {
      const idx = details.sprints.findIndex((s) => s.id === sprintId);
      if (idx !== -1) {
        details.sprints[idx] = { ...details.sprints[idx], ...patch };
        saveLocalInitiativeDetails(details);
        return;
      }
    }
    if (SAMPLE_SPRINTS[initiativeId]) {
      const idx = SAMPLE_SPRINTS[initiativeId].findIndex((s) => s.id === sprintId);
      if (idx !== -1) {
        SAMPLE_SPRINTS[initiativeId][idx] = { ...SAMPLE_SPRINTS[initiativeId][idx], ...patch };
      }
    }
  } catch (err) {
    console.error("Failed to update local sprint:", err);
  }
}

export function addLocalSprint(initiativeId: string, sprint: PMSprint): void {
  try {
    const details = getLocalInitiativeDetails(initiativeId);
    if (details) {
      details.sprints.push(sprint);
      saveLocalInitiativeDetails(details);
      return;
    }
    if (SAMPLE_SPRINTS[initiativeId]) {
      SAMPLE_SPRINTS[initiativeId].push(sprint);
    }
  } catch (err) {
    console.error("Failed to add local sprint:", err);
  }
}

export function findInitiativeById(id: string): {
  initiative: PMInitiative;
  prd: PMPRD | null;
  epics: PMEpic[];
  stories: PMStory[];
  tasks: PMTask[];
  sprints: PMSprint[];
  executions: PMExecution[];
} | null {
  // Check full custom generated details package first
  const customDetails = getLocalInitiativeDetails(id);
  if (customDetails) {
    return customDetails;
  }

  // Check local creations next
  const locals = getLocalInitiatives();
  const foundLocal = locals.find((i) => i.id === id);
  const foundSample = SAMPLE_INITIATIVES.find((i) => i.id === id);
  const initiative = foundLocal || foundSample;

  if (!initiative) return null;

  if (!initiative.risks || (initiative.risks as any[]).length === 0) {
    (initiative as any).risks = [
      {
        description: "High concurrency write conflicts during peak usage hours",
        severity: "high",
        mitigation: "Adopt optimistic database locking with redis caching and retry backoffs",
      },
      {
        description: "Third-party downstream API latency variations",
        severity: "medium",
        mitigation: "Implement circuit breaker patterns and asynchronous background processing",
      },
      {
        description: "Data retention and privacy compliance audits",
        severity: "low",
        mitigation: "Enforce automated data purges and column-level AES-256 encryption",
      },
    ];
  }

  if (!initiative.roadmap || (initiative.roadmap as any[]).length === 0) {
    (initiative as any).roadmap = [
      {
        phase: "Phase 1: Architecture & Foundation",
        goal: "Deliver foundational models, database schemas, and authenticated API shell.",
        duration: "Sprint 1 (Weeks 1-2)",
      },
      {
        phase: "Phase 2: Core Domain Logic",
        goal: "Implement business workflows, event handlers, and active UI controls.",
        duration: "Sprint 2 (Weeks 3-4)",
      },
      {
        phase: "Phase 3: Hardening & Performance",
        goal: "End-to-end integration testing, automated security scans, and P99 latency checks.",
        duration: "Sprint 3 (Weeks 5-6)",
      },
      {
        phase: "Phase 4: Production Rollout",
        goal: "Canary release, monitoring telemetry activation, and documentation handoff.",
        duration: "Sprint 4 (Weeks 7-8)",
      },
    ];
  }

  return {
    initiative,
    prd: SAMPLE_PRDS[initiative.id] || {
      id: `prd-${initiative.id}`,
      initiative_id: initiative.id,
      executive_summary: initiative.vision || "Comprehensive execution plan for product delivery.",
      problem_statement: "Need for structured agile delivery and automated telemetry.",
      solution: "Autonomous multi-agent execution pipeline orchestrating sprint deliverables.",
      version: 1,
    },
    epics: SAMPLE_EPICS[initiative.id] || [
      {
        id: `epic-default-${initiative.id}`,
        initiative_id: initiative.id,
        title: "Phase 1: Architecture & Core Foundations",
        description: "Scaffold underlying services, API contracts, and schema primitives.",
        priority: "p0",
        story_points: 21,
        status: "in_progress",
      },
    ],
    stories: SAMPLE_STORIES[initiative.id] || [
      {
        id: `story-default-${initiative.id}`,
        epic_id: `epic-default-${initiative.id}`,
        initiative_id: initiative.id,
        title: "Setup Core Service Primitives",
        description: "Initial scaffolding of repository, build pipelines, and automated test gates.",
        priority: "p0",
        story_points: 5,
        status: "in_progress",
      },
    ],
    tasks: SAMPLE_TASKS[initiative.id] || [
      {
        id: `task-default-1-${initiative.id}`,
        story_id: `story-default-${initiative.id}`,
        epic_id: `epic-default-${initiative.id}`,
        initiative_id: initiative.id,
        title: "Define database schema and migration baseline",
        status: "done",
        assigned_agent: "database_agent",
        priority: "p0",
      },
      {
        id: `task-default-2-${initiative.id}`,
        story_id: `story-default-${initiative.id}`,
        epic_id: `epic-default-${initiative.id}`,
        initiative_id: initiative.id,
        title: "Implement API router with JWT authentication",
        status: "in_progress",
        assigned_agent: "backend_agent",
        priority: "p0",
      },
      {
        id: `task-default-3-${initiative.id}`,
        story_id: `story-default-${initiative.id}`,
        epic_id: `epic-default-${initiative.id}`,
        initiative_id: initiative.id,
        title: "Construct responsive client-side visual dashboard",
        status: "ready",
        assigned_agent: "frontend_agent",
        priority: "p1",
      },
    ],
    sprints: SAMPLE_SPRINTS[initiative.id] || [
      {
        id: `sprint-default-${initiative.id}`,
        initiative_id: initiative.id,
        sprint_number: 1,
        name: "Sprint 1: Baseline Architecture",
        goal: "Deliver initial foundational working prototype with automated CI/CD.",
        start_date: new Date(Date.now() - 3 * 86400000).toISOString(),
        end_date: new Date(Date.now() + 11 * 86400000).toISOString(),
        capacity: 35,
        velocity: 32,
        story_points_planned: 32,
        story_points_completed: 12,
        status: "active",
      },
    ],
    executions: SAMPLE_EXECUTIONS[initiative.id] || [],
  };
}

export function createSimulatedInitiative(
  prompt: string,
  clarifications?: Record<string, string>,
  additionalNotes?: string
): PMInitiative {
  const cleanPrompt = prompt.trim();
  const id = `init-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const title = cleanPrompt.length > 50 ? `${cleanPrompt.slice(0, 48)}…` : cleanPrompt;

  let stack = ['TypeScript', 'React', 'Node.js', 'TailwindCSS', 'PostgreSQL'];
  if (clarifications?.tech_stack) {
    const userStack = clarifications.tech_stack.split(/[,+/]/).map((s: string) => s.trim()).filter(Boolean);
    if (userStack.length > 0) {
      stack = Array.from(new Set([...userStack, ...stack])).slice(0, 6);
    }
  }

  const userTimeline = clarifications?.timeline_cadence || "4 sprints · 8 weeks";
  const userPersonas = clarifications?.target_users || "Multi-role users and system operators";
  const userMvp = clarifications?.mvp_scope || "Core workflow actions and authenticated dashboard";
  const userCompliance = clarifications?.compliance_security || "SOC2 readiness and role-based access control";

  const newInit: PMInitiative = {
    id,
    user_id: "user-current",
    name: title.replace(/^./, (c) => c.toUpperCase()),
    status: "active",
    vision: `Tailored plan synthesized for "${cleanPrompt}". Tailored for ${userPersonas}. Built on ${stack.join(', ')}.`,
    business_goals: [
      `Deliver production MVP within ${userTimeline} without generic shortcuts`,
      `Implement rigorous compliance adhering to: ${userCompliance}`,
      "Ensure 100% test coverage on critical transactional paths",
    ],
    product_scope: `Core deliverables: ${userMvp}. Integrations: ${clarifications?.integrations || 'Standard APIs'}.${additionalNotes ? ` Constraints: ${additionalNotes}` : ''}`,
    functional_requirements: [
      `Core user journeys for ${userPersonas}`,
      `API service contracts with integrations for ${clarifications?.integrations || 'core services'}`,
      "Real-time operational dashboard with telemetry and audit logs",
    ],
    non_functional_requirements: [
      userCompliance,
      "Sub-150ms P95 API response time with resilient error boundaries",
      "High availability with automated rollback mechanisms",
    ],
    success_metrics: ["100% acceptance criteria passed", "Zero critical security findings", "SLA targets verified"],
    tech_stack: stack,
    estimated_timeline: userTimeline,
    project_ids: [],
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  saveLocalInitiative(newInit);
  return newInit;
}
