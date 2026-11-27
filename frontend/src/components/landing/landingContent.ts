/**
 * Copy and product facts for the public landing page.
 *
 * Every number here is a product fact taken from the codebase, not a
 * marketing metric. Keep them in sync when the product changes:
 * - 40 skills / 9 domains: backend/skills/<skill>/SKILL.md and SkillDomain in
 *   backend/core/skill_engine.py
 * - 8 cloud providers: _register_default_providers in backend/core/llm/router.py
 *   (Anthropic, OpenAI, Azure OpenAI, Gemini, Groq, Mistral, OpenRouter,
 *   Together). Ollama, vLLM and LiteLLM are self-hosted, not counted here.
 * - 6 protocols with adapters, 13 in scope: backend/api/protocols.py (MCP,
 *   MCP Apps, A2A, AG-UI, A2UI, AI SDK UI stream) and the audit's protocol table
 * - Plans: FALLBACK_PLANS in src/pages/BillingPage.tsx, which mirrors
 *   PLAN_DETAILS in backend/api/billing.py
 *
 * Every claim is checked in docs/marketing/LANDING_CLAIMS_VERIFICATION.md.
 */

export const DOCS_URL = "https://github.com/F-K75/forge-ai/tree/main/docs";

export const PROTOCOLS_LIVE = ["MCP", "MCP Apps", "A2A", "AG-UI", "A2UI", "AI SDK UI"] as const;

export const STATS = [
  { value: "40", label: "Skills in the engine", note: "SKILL.md, routed by task" },
  { value: "9", label: "Skill domains", note: "Engineering to design tools" },
  { value: "8", label: "Cloud model providers", note: "Plus Ollama, vLLM and LiteLLM" },
  { value: "6/13", label: "Protocols with adapters / in scope", note: "MCP, A2A, AG-UI and more" },
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
    body: "The Product Lead and Architect turn a one-line brief into goals, an architecture and a task graph. You can review and approve the plan before any code is written.",
  },
  {
    id: "build",
    n: "02",
    label: "Build",
    title: "Specialists build in parallel.",
    body: "Frontend, backend and AI engineers each work in their own isolated workspace, pulling the skills they need from the engine. Progress streams back live.",
  },
  {
    id: "verify",
    n: "03",
    label: "Verify",
    title: "Every change gets checked.",
    body: "QA and Security agents review each change, and sandboxed checks (syntax, tests and a security scan) run against the files it touches. Failures loop back to the owning agent for a repair round.",
  },
  {
    id: "ship",
    n: "04",
    label: "Ship",
    title: "Ship behind an optional approval gate.",
    body: "Release and DevOps agents package the change. Turn on the delivery gate and they wait for your sign-off; your decision is written to the audit log and the run is recorded in the project's decision log.",
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
    a: "No. Agents never push to your repository on their own: code reaches GitHub only when you push it. You can also turn on an approval gate that pauses a run before its delivery and release step, and each approval or rejection is written to the audit log. Each agent task works in its own isolated workspace.",
  },
  {
    q: "Which models does Forge use?",
    a: "The model gateway routes across eight cloud providers (Anthropic, OpenAI, Azure OpenAI, Gemini, Groq, Mistral, OpenRouter and Together) with budgets, rate limits and circuit breakers. Self-hosted models run through Ollama, vLLM or a LiteLLM proxy. On Pro and Enterprise plans you can bring your own Anthropic or OpenAI-compatible API key.",
  },
  {
    q: "What happens to my code and data?",
    a: "Your repositories stay yours. Agents work in isolated workspaces, and stored credentials (your GitHub token, your own LLM API key and your 2FA secret) are encrypted at rest; Forge API keys are stored only as hashes. You can export your account data, or delete your account with its projects and builds, at any time. Memory, such as decisions and lessons from earlier runs, is scoped to each project.",
  },
  {
    q: "Can I self-host Forge?",
    a: "Yes. Forge ships with Docker Compose and Kubernetes manifests for running the full stack (API, workers, MongoDB, Redis) on your own infrastructure, alongside your own model endpoints.",
  },
  {
    q: "How do credits work?",
    a: "Agent runs consume credits. Free accounts get 10 credits at signup and their first build free; paid plans include a monthly allowance, and you can buy credit packs at any time. Yearly billing costs ten months' worth of the monthly price. Enterprise plans get custom credit volume.",
  },
];
