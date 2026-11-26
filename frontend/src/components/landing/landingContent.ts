/**
 * Copy and product facts for the public landing page.
 *
 * Every number here is a product fact taken from the codebase, not a
 * marketing metric. Keep them in sync when the product changes:
 * - 40 skills / 9 domains: backend/skills/<skill>/SKILL.md and SkillDomain in
 *   backend/core/skill_engine.py
 * - 9 cloud providers: backend/core/llm (see docs/VISION_IMPLEMENTATION_AUDIT.md)
 * - 5 protocols with adapters, 13 on the roadmap: backend/core/protocol_gateway.py,
 *   backend/core/a2a_adapter.py and the audit's protocol table
 * - Plans: FALLBACK_PLANS in src/pages/BillingPage.tsx, which mirrors
 *   PLAN_DETAILS in backend/api/billing.py
 */

export const DOCS_URL = "https://github.com/F-K75/forge-ai/tree/main/docs";

export const PROTOCOLS_LIVE = ["MCP", "MCP Apps", "A2A", "AG-UI", "A2UI"] as const;

export const STATS = [
  { value: "40", label: "Skills in the engine", note: "SKILL.md, routed by task" },
  { value: "9", label: "Skill domains", note: "Engineering to design tools" },
  { value: "9", label: "Cloud model providers", note: "Plus self-hosted models" },
  { value: "5/13", label: "Protocols live / planned", note: "MCP, A2A, AG-UI and more" },
] as const;

export type StepId = "plan" | "build" | "verify" | "ship";

export const STEPS: {
  id: StepId;
  n: string;
  label: string;
  title: string;
  body: string;
}[] = [
  {
    id: "plan",
    n: "01",
    label: "Plan",
    title: "Turn an idea into an approved plan.",
    body: "The Product Lead and Architect turn a one-line brief into goals, an architecture and a task graph. You review the plan before a single line of code is written.",
  },
  {
    id: "build",
    n: "02",
    label: "Build",
    title: "Specialists build in parallel.",
    body: "Frontend, backend and AI engineers each work in their own sandboxed git worktree, pulling the skills they need from the engine. Progress streams back live.",
  },
  {
    id: "verify",
    n: "03",
    label: "Verify",
    title: "Nothing merges unverified.",
    body: "QA and Security agents run type checks, tests and reviews against every change. Failures loop back to the owning agent with the evidence attached.",
  },
  {
    id: "ship",
    n: "04",
    label: "Ship",
    title: "Ship behind an approval gate.",
    body: "Release and DevOps agents package the change, then wait at the gate. You approve, and the decision lands in the audit log and company memory.",
  },
];

export interface Plan {
  tier: string;
  name: string;
  monthly: number;
  yearly: number;
  credits: string;
  blurb: string;
  features: string[];
  featured?: boolean;
}

export const PLANS: Plan[] = [
  {
    tier: "free",
    name: "Free",
    monthly: 0,
    yearly: 0,
    credits: "10 credits at signup",
    blurb: "For trying Forge on a single project.",
    features: ["10 credits at signup", "First build free", "1 project", "Community support"],
  },
  {
    tier: "standard",
    name: "Standard",
    monthly: 20,
    yearly: 200,
    credits: "100 credits / month",
    blurb: "For builders shipping side projects and prototypes.",
    features: ["100 credits per month", "Unlimited projects", "All agents", "Email support"],
  },
  {
    tier: "pro",
    name: "Pro",
    monthly: 50,
    yearly: 500,
    credits: "750 credits / month",
    blurb: "For teams that run Forge every day, with their own model keys.",
    features: [
      "750 credits per month",
      "Unlimited projects",
      "All agents",
      "Bring your own LLM key (BYOK)",
      "Priority support",
    ],
    featured: true,
  },
];

export const FAQS: { q: string; a: string }[] = [
  {
    q: "What exactly do the agents do?",
    a: "Forge runs specialist agents (Product Lead, Architect, Designer, engineers, DevOps, Security, QA and Release) on an orchestration kernel. They plan the work as a task graph, build in parallel, verify each change and prepare releases. You see every step live in the Command Center.",
  },
  {
    q: "Can agents ship to production without me?",
    a: "Not unless you let them. Approval gates sit in front of consequential steps such as merging or deploying, and each decision is written to an audit log. Agents work in sandboxed git worktrees, so nothing touches your main branch until a change is approved.",
  },
  {
    q: "Which models does Forge use?",
    a: "The model gateway routes across nine cloud providers, including Anthropic, OpenAI, Azure, Gemini, Groq, Mistral, OpenRouter and Together, with budgets, rate limits and circuit breakers. Local models run through Ollama, and Pro plans can bring their own API keys.",
  },
  {
    q: "What happens to my code and data?",
    a: "Your repositories stay yours. Agents work on isolated copies, secrets are encrypted at rest, and you can export or delete project data at any time. Company memory, such as decisions and conventions, is scoped to your organisation.",
  },
  {
    q: "Can I self-host Forge?",
    a: "Yes. Forge ships with Docker Compose and Kubernetes manifests for running the full stack (API, workers, MongoDB, Redis) on your own infrastructure, alongside your own model endpoints.",
  },
  {
    q: "How do credits work?",
    a: "Agent runs consume credits. Every plan includes a monthly allowance, and you can buy credit packs at any time. Yearly billing costs ten months' worth of the monthly price. Enterprise plans get custom credit volume.",
  },
];
