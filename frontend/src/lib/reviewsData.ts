export interface BacklogItem {
  id: string;
  title: string;
  description: string;
  fix: string;
  severity: "critical" | "high" | "medium" | "low";
  effort: "S" | "M" | "L";
  impact: number;
  files: string[];
}

export interface ReviewAgentReport {
  agent_id: string;
  name: string;
  role: string;
  status: "idle" | "active" | "done" | "failed";
  score?: number | null;
  issues: number;
  cost_usd: number;
  duration_sec?: number;
  error?: string | null;
}

export interface ReviewRunDetails {
  run_id: string;
  created_at: string;
  repo_path: string;
  mode: "full" | "diff";
  status: "pending" | "running" | "consolidating" | "complete" | "failed";
  candidate_files: number;
  triggered_agents: string[];
  agent_reports: ReviewAgentReport[];
  consolidated?: {
    overall_score: number;
    recommendation: "GO" | "NO_GO" | "GO_WITH_FIXES";
    summary: string;
  } | null;
  total_cost_usd: number;
  total_tokens: number;
  error?: string | null;
  backlog: BacklogItem[];
}

export const SAMPLE_REVIEWS: ReviewRunDetails[] = [
  {
    run_id: "run-forge-core-9a",
    created_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    repo_path: "/workspaces/forge-ai",
    mode: "full",
    status: "complete",
    candidate_files: 48,
    triggered_agents: [
      "security_agent",
      "performance_agent",
      "architecture_agent",
      "code_quality_agent",
    ],
    agent_reports: [
      {
        agent_id: "security_agent",
        name: "Security Sentinel",
        role: "OWASP vulnerability & secret auditor",
        status: "done",
        score: 98,
        issues: 0,
        cost_usd: 0.012,
        duration_sec: 4.2,
      },
      {
        agent_id: "performance_agent",
        name: "Performance Profiler",
        role: "Algorithmic complexity & memory checks",
        status: "done",
        score: 92,
        issues: 1,
        cost_usd: 0.011,
        duration_sec: 3.8,
      },
      {
        agent_id: "architecture_agent",
        name: "Architecture Analyst",
        role: "Coupling, cohesion & modularity",
        status: "done",
        score: 95,
        issues: 0,
        cost_usd: 0.014,
        duration_sec: 5.1,
      },
      {
        agent_id: "code_quality_agent",
        name: "Quality Linter",
        role: "Strict types, dead code & readability",
        status: "done",
        score: 91,
        issues: 1,
        cost_usd: 0.008,
        duration_sec: 2.9,
      },
    ],
    consolidated: {
      overall_score: 94,
      recommendation: "GO",
      summary:
        "Repository meets high engineering standards. No security flaws detected. 2 minor optimizations recommended prior to tagging release.",
    },
    total_cost_usd: 0.045,
    total_tokens: 42350,
    backlog: [
      {
        id: "item-9a-1",
        title: "Unmemoized array transform in workspace file explorer",
        description:
          "Sorting and filtering the file tree on every render cycle causes unnecessary re-renders when browsing folders > 500 files.",
        fix: "Wrap tree filtering in useMemo with [files, search, activeFilter] dependency array.",
        severity: "low",
        effort: "S",
        impact: 4,
        files: ["src/components/FileExplorer.tsx"],
      },
      {
        id: "item-9a-2",
        title: "Implicit any fallback in WebSocket heartbeat handler",
        description:
          "The ping payload parser lacks runtime validation when ping frame contains binary extension data.",
        fix: "Add zod schema validation to WebSocket message deserialization.",
        severity: "medium",
        effort: "S",
        impact: 5,
        files: ["src/lib/socketClient.ts"],
      },
    ],
  },
  {
    run_id: "run-auth-stripe-2c",
    created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    repo_path: "github.com/forge-ai/forge/services/auth",
    mode: "full",
    status: "complete",
    candidate_files: 16,
    triggered_agents: [
      "security_agent",
      "architecture_agent",
      "performance_agent",
      "code_quality_agent",
    ],
    agent_reports: [
      {
        agent_id: "security_agent",
        name: "Security Sentinel",
        role: "OWASP vulnerability & secret auditor",
        status: "done",
        score: 48,
        issues: 3,
        cost_usd: 0.025,
        duration_sec: 6.4,
      },
      {
        agent_id: "architecture_agent",
        name: "Architecture Analyst",
        role: "Coupling, cohesion & modularity",
        status: "done",
        score: 72,
        issues: 1,
        cost_usd: 0.018,
        duration_sec: 4.1,
      },
      {
        agent_id: "performance_agent",
        name: "Performance Profiler",
        role: "Algorithmic complexity & memory checks",
        status: "done",
        score: 84,
        issues: 1,
        cost_usd: 0.015,
        duration_sec: 3.5,
      },
      {
        agent_id: "code_quality_agent",
        name: "Quality Linter",
        role: "Strict types, dead code & readability",
        status: "done",
        score: 76,
        issues: 1,
        cost_usd: 0.012,
        duration_sec: 3.1,
      },
    ],
    consolidated: {
      overall_score: 62,
      recommendation: "NO_GO",
      summary:
        "CRITICAL: Potential token leak and permissive CORS configuration detected. Deployment gate blocked until security remediations are applied.",
    },
    total_cost_usd: 0.07,
    total_tokens: 68120,
    backlog: [
      {
        id: "item-2c-1",
        title: "Stripe webhook secret logged to standard out in production mode",
        description:
          "Logger middleware captures raw request headers including Stripe-Signature and webhook signing credentials when log level is set to DEBUG.",
        fix: "Sanitize request headers in LoggerMiddleware before outputting to stdout or telemetry stream.",
        severity: "critical",
        effort: "S",
        impact: 10,
        files: ["services/auth/middleware/logger.py", "services/auth/webhook.py"],
      },
      {
        id: "item-2c-2",
        title: "Overly permissive CORS origin wildcard on session exchange route",
        description:
          "Access-Control-Allow-Origin defaults to '*' if Origin header matches any staging subdomain, permitting unauthorized cross-origin credential sharing.",
        fix: "Enforce strict whitelist matching against verified domain registry without regex wildcarding.",
        severity: "high",
        effort: "M",
        impact: 8,
        files: ["services/auth/cors.py"],
      },
      {
        id: "item-2c-3",
        title: "Unsalted HMAC comparison vulnerable to timing attacks",
        description:
          "Signature comparison in verification routine uses standard string equality (===) instead of constant-time comparison.",
        fix: "Use crypto.timingSafeEqual or hmac.compare_digest to prevent micro-architectural timing side-channels.",
        severity: "high",
        effort: "S",
        impact: 7,
        files: ["services/auth/tokens.py"],
      },
      {
        id: "item-2c-4",
        title: "Session cache eviction lacks TTL jitter",
        description:
          "Simultaneous expiration of session keys causes cache stampedes against Postgres primary replica.",
        fix: "Apply 10% random jitter to Redis session key expirations.",
        severity: "medium",
        effort: "S",
        impact: 6,
        files: ["services/auth/sessionStore.py"],
      },
    ],
  },
  {
    run_id: "run-realtime-ws-8f",
    created_at: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
    repo_path: "src/gateway/websocketHub.ts",
    mode: "full",
    status: "running",
    candidate_files: 8,
    triggered_agents: [
      "security_agent",
      "performance_agent",
      "architecture_agent",
    ],
    agent_reports: [
      {
        agent_id: "security_agent",
        name: "Security Sentinel",
        role: "OWASP vulnerability & secret auditor",
        status: "done",
        score: 94,
        issues: 0,
        cost_usd: 0.009,
        duration_sec: 3.1,
      },
      {
        agent_id: "performance_agent",
        name: "Performance Profiler",
        role: "Algorithmic complexity & memory checks",
        status: "active",
        score: null,
        issues: 0,
        cost_usd: 0.008,
      },
      {
        agent_id: "architecture_agent",
        name: "Architecture Analyst",
        role: "Coupling, cohesion & modularity",
        status: "idle",
        score: null,
        issues: 0,
        cost_usd: 0,
      },
    ],
    consolidated: null,
    total_cost_usd: 0.017,
    total_tokens: 18400,
    backlog: [],
  },
  {
    run_id: "run-payment-diff-4b",
    created_at: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
    repo_path: "pr#142: stripe-checkout-upgrade",
    mode: "diff",
    status: "complete",
    candidate_files: 4,
    triggered_agents: [
      "security_agent",
      "performance_agent",
      "code_quality_agent",
    ],
    agent_reports: [
      {
        agent_id: "security_agent",
        name: "Security Sentinel",
        role: "OWASP vulnerability & secret auditor",
        status: "done",
        score: 90,
        issues: 1,
        cost_usd: 0.012,
        duration_sec: 2.8,
      },
      {
        agent_id: "performance_agent",
        name: "Performance Profiler",
        role: "Algorithmic complexity & memory checks",
        status: "done",
        score: 86,
        issues: 1,
        cost_usd: 0.009,
        duration_sec: 2.4,
      },
      {
        agent_id: "code_quality_agent",
        name: "Quality Linter",
        role: "Strict types, dead code & readability",
        status: "done",
        score: 88,
        issues: 1,
        cost_usd: 0.006,
        duration_sec: 2.0,
      },
    ],
    consolidated: {
      overall_score: 88,
      recommendation: "GO_WITH_FIXES",
      summary:
        "Diff passes security checks with 1 non-blocking warning regarding idempotency key retry propagation.",
    },
    total_cost_usd: 0.027,
    total_tokens: 24100,
    backlog: [
      {
        id: "item-4b-1",
        title: "Missing idempotency key on customer charge retry loop",
        description:
          "Network drops during charge confirmation can re-issue billing intent without passing the initial Idempotency-Key header.",
        fix: "Pass existing intent id in headers: { 'Idempotency-Key': charge.idempotencyToken }.",
        severity: "medium",
        effort: "S",
        impact: 6,
        files: ["src/services/billing/chargeCustomer.ts"],
      },
      {
        id: "item-4b-2",
        title: "Unhandled error state on 402 Card Declined webhook",
        description:
          "Webhook parser silently ignores declined card payloads instead of updating the subscription status to past_due.",
        fix: "Add explicit invoice.payment_failed case handler in webhook router.",
        severity: "low",
        effort: "S",
        impact: 4,
        files: ["src/services/billing/webhookReceiver.ts"],
      },
    ],
  },
  {
    run_id: "run-frontend-bundle-1e",
    created_at: new Date(Date.now() - 1000 * 60 * 480).toISOString(),
    repo_path: "/frontend/src/pages/WorkspacePage.tsx",
    mode: "full",
    status: "complete",
    candidate_files: 12,
    triggered_agents: [
      "performance_agent",
      "architecture_agent",
      "code_quality_agent",
    ],
    agent_reports: [
      {
        agent_id: "performance_agent",
        name: "Performance Profiler",
        role: "Algorithmic complexity & memory checks",
        status: "done",
        score: 95,
        issues: 0,
        cost_usd: 0.015,
        duration_sec: 3.9,
      },
      {
        agent_id: "architecture_agent",
        name: "Architecture Analyst",
        role: "Coupling, cohesion & modularity",
        status: "done",
        score: 90,
        issues: 1,
        cost_usd: 0.012,
        duration_sec: 4.0,
      },
      {
        agent_id: "code_quality_agent",
        name: "Quality Linter",
        role: "Strict types, dead code & readability",
        status: "done",
        score: 96,
        issues: 0,
        cost_usd: 0.008,
        duration_sec: 2.6,
      },
    ],
    consolidated: {
      overall_score: 93,
      recommendation: "GO",
      summary:
        "Clean architecture and bundle boundaries. React memoization applied properly across heavy editor canvas components.",
    },
    total_cost_usd: 0.035,
    total_tokens: 31200,
    backlog: [
      {
        id: "item-1e-1",
        title: "Heavy monaco-editor bundle loaded synchronously in initial chunk",
        description:
          "Initial page bundle weight increased by 1.8MB due to direct import of Monaco language workers.",
        fix: "Convert Monaco worker definitions to dynamic lazy import via React.lazy().",
        severity: "low",
        effort: "M",
        impact: 3,
        files: ["src/components/CodeEditor.tsx"],
      },
    ],
  },
];

const STORAGE_KEY = "forge_reviews_runs_v2";

export function getStoredReviews(): ReviewRunDetails[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return SAMPLE_REVIEWS;
}

export function saveStoredReviews(runs: ReviewRunDetails[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  } catch {
    // ignore
  }
}

export function findReviewById(runId: string): ReviewRunDetails | undefined {
  const list = getStoredReviews();
  return list.find((r) => r.run_id === runId);
}

export function addStoredReview(review: ReviewRunDetails): void {
  const list = getStoredReviews();
  const updated = [review, ...list.filter((r) => r.run_id !== review.run_id)];
  saveStoredReviews(updated);
}

export function removeStoredReview(runId: string): void {
  const list = getStoredReviews();
  const updated = list.filter((r) => r.run_id !== runId);
  saveStoredReviews(updated);
}
