import { useEffect, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Check,
  X,
  Github,
  Terminal,
  Sparkles,
  Cpu,
  ShieldCheck,
  GitBranch,
  CheckCircle2,
  Workflow,
  Boxes,
  Lock,
  Server,
  FileCode,
  Flame,
  FolderGit2,
} from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { ThemeToggle } from "../components/ThemeToggle";

// ─── Animation Wrapper ───────────────────────────────────────────────────────

function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 20 }}
      whileInView="visible"
      viewport={{ once: true, margin: "-40px" }}
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1], delay },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

// ─── Content Data ────────────────────────────────────────────────────────────

interface AgentDossier {
  id: string;
  roleId: string;
  name: string;
  color: string;
  badgeBg: string;
  description: string;
  deliverables: string[];
  systemMetric: string;
}

const AGENT_DOSSIERS: AgentDossier[] = [
  {
    id: "architect",
    roleId: "ARCH-01",
    name: "System Architect",
    color: "#FFE600",
    badgeBg: "bg-brutal-yellow text-black",
    description: "Defines system blueprints, database entity relationships, microservice boundaries, and strict API schemas before any code is generated.",
    deliverables: ["blueprint.json", "data-models", "api-endpoints"],
    systemMetric: "99.8% Schema Coherence",
  },
  {
    id: "designer",
    roleId: "DES-02",
    name: "UI / Design Engineer",
    color: "#FF5376",
    badgeBg: "bg-brutal-pink text-black",
    description: "Generates high-contrast, accessible design tokens, responsive layout hierarchies, and styled UI surfaces without generic placeholder wireframes.",
    deliverables: ["design-tokens.css", "AppShell.tsx", "tailwind.theme.ts"],
    systemMetric: "WCAG AA Guaranteed",
  },
  {
    id: "developer",
    roleId: "DEV-03",
    name: "Full-Stack Engineer",
    color: "#00F0FF",
    badgeBg: "bg-brutal-cyan text-black",
    description: "Writes the full stack from the architect's blueprint and the designer's tokens: a React + Vite + Tailwind frontend and a FastAPI + MongoDB backend.",
    deliverables: ["backend/main.py", "routes/*.py", "src/App.tsx"],
    systemMetric: "0 Lint / Syntax Errors",
  },
  {
    id: "business_improver",
    roleId: "BIZ-04",
    name: "Business Auditor",
    color: "#FBBF24",
    badgeBg: "bg-amber-400 text-black",
    description: "Drafts the business side of your app: target customers, value proposition, pricing tiers, and a go-to-market and validation plan.",
    deliverables: ["target-customers", "pricing-tiers", "go-to-market"],
    systemMetric: "3.4x Cost Optimization",
  },
  {
    id: "integration",
    roleId: "INT-05",
    name: "Integration Specialist",
    color: "#C084FC",
    badgeBg: "bg-purple-400 text-black",
    description: "Connects external service playbooks: Stripe webhook pipelines, OAuth providers, Supabase Postgres, and Slack notifications automatically.",
    deliverables: ["routes/billing.py", "env vars", "integration setup"],
    systemMetric: "Automated Handshake",
  },
  {
    id: "pm",
    roleId: "PM-06",
    name: "PM & Quality Lead",
    color: "#22C55E",
    badgeBg: "bg-brutal-green text-black",
    description: "Checks the build against your spec, scores it, and lists issues and missing features. Failing syntax or type checks trigger the self-correcting debug loop.",
    deliverables: ["quality score", "issues & fixes", "missing features"],
    systemMetric: "Self-Healing Debug Loop",
  },
];

const WORKFLOW_STEPS = [
  {
    step: "01",
    label: "DESCRIBE",
    tagline: "Natural Language Input",
    agent: "All Agents Synchronized",
    details: "Enter your product intent in plain English or paste a PRD. Forge decomposes the request into discrete engineering tasks.",
    output: "Input Intent Vector & Initial Spec",
  },
  {
    step: "02",
    label: "PLAN",
    tagline: "Architecture & Blueprinting",
    agent: "System Architect (ARCH-01)",
    details: "ARCH-01 drafts a typed data model, service boundaries, and state graph. Context is anchored in shared project memory.",
    output: "Typed Blueprints & Entity Schemas",
  },
  {
    step: "03",
    label: "BUILD",
    tagline: "Parallel Code Streaming",
    agent: "Designer (DES-02) + Developer (DEV-03)",
    details: "The designer sets up the UI system, then the developer writes components, API routes and state stores on top of the architect's blueprint.",
    output: "Full-Stack Source Code Tree",
  },
  {
    step: "04",
    label: "VALIDATE",
    tagline: "Autonomous Debug Loop",
    agent: "PM & Quality Lead (PM-06)",
    details: "Syntax, type and import checks run in an isolated sandbox. If anything fails, the debug loop fixes it and re-checks, up to 3 times.",
    output: "Passing Checks & Quality Score",
  },
  {
    step: "05",
    label: "SHIP",
    tagline: "Push to GitHub",
    agent: "Integration Lead (INT-05)",
    details: "Push the validated code to your own GitHub repo and run it wherever you like.",
    output: "Your Code in Your Repo",
  },
];

// Technologies Forge actually generates or integrates with: the generated
// stack (agents/developer.py) and the integration playbooks
// (agents/integration.py). Not partnerships.
const TECH_PARTNERS = [
  "GITHUB",
  "REACT",
  "TYPESCRIPT",
  "TAILWIND",
  "FASTAPI",
  "MONGODB",
  "STRIPE",
  "SUPABASE",
  "SLACK",
  "RESEND",
];

const FEATURES_BENTO = [
  {
    code: "FT-01",
    title: "Self-Correcting Debug Loop",
    badge: "AUTONOMOUS HEALING",
    badgeColor: "bg-brutal-green text-black",
    description: "When syntax or type checks fail, Forge doesn't stop and demand human debugging. A debug agent fixes the code using the error traces and re-checks it, up to 3 times.",
    icon: RefreshCwIcon,
    kpi: "3X AUTO-RETRY",
  },
  {
    code: "FT-02",
    title: "Shared Project Memory",
    badge: "ZERO CONTEXT DRIFT",
    badgeColor: "bg-brutal-yellow text-black",
    description: "Every agent shares a persistent, typed state vector. The designer knows the database models, the developer respects the design tokens, and the PM audits the exact original spec.",
    icon: Cpu,
    kpi: "100% SYNCHRONIZED",
  },
  {
    code: "FT-03",
    title: "Quality Score on Every Build",
    badge: "GATEKEEPER PM",
    badgeColor: "bg-brutal-cyan text-black",
    description: "Every build gets a quality score from the PM agent, with the issues it found, suggested fixes, and any features from your spec that are missing.",
    icon: ShieldCheck,
    kpi: "SCORED EVERY BUILD",
  },
  {
    code: "FT-04",
    title: "A Real, Standard Stack",
    badge: "NO SANDBOX TRAPS",
    badgeColor: "bg-amber-400 text-black",
    description: "No toy widgets or proprietary runtimes. Forge writes a standard React + TypeScript frontend and a Python (FastAPI) backend that you can host anywhere.",
    icon: Server,
    kpi: "HOST ANYWHERE",
  },
  {
    code: "FT-05",
    title: "Playbook Integrations",
    badge: "AUTOMATED WIRING",
    badgeColor: "bg-purple-400 text-black",
    description: "Need Stripe subscriptions, Supabase authentication, or Slack alerts? Agents select pre-validated integration playbooks and configure environment variables safely.",
    icon: Boxes,
    kpi: "PLUG & SHIP",
  },
  {
    code: "FT-06",
    title: "Push to GitHub",
    badge: "FULL CODE OWNERSHIP",
    badgeColor: "bg-brutal-pink text-black",
    description: "Push the generated code to your connected GitHub repository whenever you're ready. You own 100% of the code.",
    icon: GitBranch,
    kpi: "ZERO LOCK-IN",
  },
];

function RefreshCwIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <Workflow size={size} className={className} />;
}

const COMPARISON_ROWS = [
  {
    feature: "Upfront architecture & schema planning",
    chatbots: "No (hallucinates on the fly)",
    copilots: "No (line-by-line autocompletion)",
    forge: "Yes (Architect creates typed blueprints)",
  },
  {
    feature: "Specialized roles (PM, QA, Architect, UI)",
    chatbots: "No (single generalist model)",
    copilots: "No (autocomplete only)",
    forge: "Yes (6 autonomous specialist agents)",
  },
  {
    feature: "Shared project memory across handoffs",
    chatbots: "No (prompt context decays rapidly)",
    copilots: "Partial (local editor window)",
    forge: "Yes (shared project memory)",
  },
  {
    feature: "Automated compile & test debug loop",
    chatbots: "No (dumps errors back to user)",
    copilots: "No (developer must fix)",
    forge: "Yes (automatic 3-pass self-healing)",
  },
  {
    feature: "Syntax & type checks before you get the code",
    chatbots: "No (snippets only)",
    copilots: "No",
    forge: "Yes (sandboxed checks + debug loop)",
  },
  {
    feature: "Full code ownership & Git export",
    chatbots: "Partial (copy-paste nightmare)",
    copilots: "Yes",
    forge: "Yes (push to your GitHub repo)",
  },
];

// Must match PLAN_DETAILS in backend/api/billing.py (pinned by
// backend/tests/test_plan_details.py). Enterprise is shown below the cards.
const PRICING_PLANS = [
  {
    name: "FREE",
    price: "$0",
    frequency: "/forever",
    badge: "FREE STARTER",
    badgeBg: "bg-white text-black",
    description: "Try the full agent team on a real project before you pay anything.",
    credits: "10 credits at signup + first build free",
    features: [
      "1 project",
      "All agents",
      "Community support",
    ],
    cta: "Start Free",
    ctaPath: "/signup",
    featured: false,
  },
  {
    name: "STANDARD",
    price: "$20",
    frequency: "/month",
    badge: "MOST POPULAR",
    badgeBg: "bg-black text-white dark:bg-white dark:text-black",
    description: "For founders and engineers building and iterating on apps every month.",
    credits: "100 credits / month",
    features: [
      "Unlimited projects",
      "All agents",
      "Email support",
    ],
    cta: "Start Standard",
    ctaPath: "/signup?plan=standard",
    featured: true,
  },
  {
    name: "PRO",
    price: "$50",
    frequency: "/month",
    badge: "HIGH VOLUME",
    badgeBg: "bg-brutal-cyan text-black",
    description: "For agencies and teams shipping many apps, or bringing their own model keys.",
    credits: "750 credits / month",
    features: [
      "Unlimited projects",
      "All agents",
      "Bring your own LLM key (BYOK)",
      "Priority support",
    ],
    cta: "Start Pro",
    ctaPath: "/signup?plan=pro",
    featured: false,
  },
];

const FAQS = [
  {
    q: "How does Forge AI differ from Copilot or ChatGPT?",
    a: "ChatGPT is a general chatbot; Copilot is an autocomplete assistant inside your editor. Forge is a team of 6 specialized agents: they plan a blueprint, write the full stack, check it in a sandbox and fix what fails, without you prompting every step.",
  },
  {
    q: "What is the self-correcting debug loop?",
    a: "After the agents write the code, Forge runs syntax, type and import checks on it in an isolated sandbox. If anything fails, a debug agent gets the error traces, fixes the code and re-checks it, up to 3 times, before handing it back to you.",
  },
  {
    q: "Do I actually own the generated code?",
    a: "Yes, 100%. Push any build to your personal or organization's GitHub repository. There's no proprietary runtime: it's a standard React and FastAPI codebase you can run anywhere.",
  },
  {
    q: "Can I use my own AI model API keys?",
    a: "Yes. On Pro and Enterprise you can add your own Anthropic key, or any OpenAI-compatible endpoint (OpenAI, Groq, OpenRouter and others). Your builds then run on your key instead of using credits.",
  },
  {
    q: "How fast is a full build cycle?",
    a: "It depends on the size of the app: the agents run one after another, and the debug loop can add passes. You can watch every agent's progress live while it builds.",
  },
];

// ─── Main Landing Page Component ─────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="w-full bg-[#FAF8F5] dark:bg-[#101014] text-black dark:text-[#F5F5F7] min-h-screen selection:bg-brutal-yellow selection:text-black font-sans">
      <Nav />
      <main id="main-content">
        <HeroSection />
        <LandingPageBody />
      </main>
      <Footer />
    </div>
  );
}

// Exported body for embeddability
export function LandingPageBody() {
  return (
    <>
      <TechTicker />
      <InferenceSection />
      <AgentsSection />
      <WorkflowSection />
      <FeaturesSection />
      <WhyForgeSection />
      <ComparisonSection />
      <PricingSection />
      <FAQSection />
      <FinalCTA />
    </>
  );
}

// ─── 1. Neo-Brutalist Navbar ─────────────────────────────────────────────────

export function Nav() {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 border-b-3 border-black dark:border-white/80 bg-[#FAF8F5] dark:bg-[#18181C] shadow-[0_4px_0_#000] dark:shadow-[0_4px_0_#fff]">
      <nav
        aria-label="Primary"
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4 font-mono text-xs font-black"
      >
        {/* Brand Badge */}
        <div className="flex items-center gap-3">
          <Link
            to="/home"
            className="flex items-center gap-2 border-2 border-black dark:border-white/80 bg-white dark:bg-[#252530] px-3 py-1.5 shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff] hover:bg-brutal-yellow hover:text-black transition active:translate-x-[1px] active:translate-y-[1px]"
          >
            <BrandLogo size="xs" />
            <span className="tracking-wider uppercase">FORGE AI</span>
            <span className="px-1.5 py-0.2 bg-brutal-yellow text-black border border-black text-[10px]">
              v2.4
            </span>
          </Link>

          <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 border-2 border-black dark:border-white/80 bg-white dark:bg-[#252530] shadow-[2px_2px_0px_#000] text-[11px]">
            <span className="w-2 h-2 rounded-none bg-brutal-green border border-black animate-pulse" />
            <span className="uppercase text-muted">SYSTEM: ONLINE</span>
          </div>
        </div>

        {/* Center Links */}
        <div className="hidden md:flex items-center gap-5 uppercase tracking-wider text-ink font-mono font-bold text-xs">
          <a
            href="#solution"
            className="hover:text-amber-500 hover:underline decoration-2 underline-offset-4 transition"
          >
            PARADIGM
          </a>
          <a
            href="#agents"
            className="hover:text-amber-500 hover:underline decoration-2 underline-offset-4 transition"
          >
            AGENTS
          </a>
          <a
            href="#workflow"
            className="hover:text-amber-500 hover:underline decoration-2 underline-offset-4 transition"
          >
            WORKFLOW
          </a>
          <a
            href="#features"
            className="hover:text-amber-500 hover:underline decoration-2 underline-offset-4 transition"
          >
            FEATURES
          </a>
          <a
            href="#pricing"
            className="hover:text-amber-500 hover:underline decoration-2 underline-offset-4 transition"
          >
            PRICING
          </a>
          <a
            href="#faq"
            className="hover:text-amber-500 hover:underline decoration-2 underline-offset-4 transition"
          >
            FAQ
          </a>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => navigate("/launch")}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 border-2 border-black dark:border-white/80 bg-white dark:bg-[#252530] text-ink font-mono font-black text-xs uppercase shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff] hover:bg-brutal-yellow hover:text-black transition active:translate-x-[1px] active:translate-y-[1px] cursor-pointer"
            title="Launch CLI ($ build)"
          >
            <Terminal size={13} strokeWidth={2.5} />
            <span>LAUNCHPAD</span>
          </button>

          <Link
            to="/login"
            className="px-3 py-1.5 border-2 border-black dark:border-white/80 bg-white dark:bg-[#252530] text-ink font-mono font-black text-xs uppercase shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff] hover:bg-neutral-100 dark:hover:bg-[#2F2F3D] transition active:translate-x-[1px] active:translate-y-[1px]"
          >
            SIGN IN
          </Link>

          <Link
            to="/signup"
            className="flex items-center gap-1.5 px-3.5 py-1.5 border-2 border-black bg-brutal-yellow text-black font-mono font-black text-xs uppercase shadow-[3px_3px_0px_#000] hover:bg-[#2DD4BF] transition active:translate-x-[1px] active:translate-y-[1px] cursor-pointer"
          >
            <span>BUILD FREE</span>
            <ArrowRight size={13} strokeWidth={2.5} />
          </Link>

          <ThemeToggle compact />
        </div>
      </nav>
    </header>
  );
}

// ─── 2. Neo-Brutalist Hero Section ───────────────────────────────────────────

function HeroSection() {
  const [activeTab, setActiveTab] = useState<"terminal" | "tree" | "spec">("terminal");
  const [activeStepIndex, setActiveStepIndex] = useState(2);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStepIndex((prev) => (prev >= 4 ? 0 : prev + 1));
    }, 2800);
    return () => clearInterval(timer);
  }, []);

  const terminalSteps = [
    { tag: "[ARCH-01]", color: "bg-brutal-yellow text-black", text: "Architecting data models & API contracts -> blueprint.json" },
    { tag: "[DES-02]", color: "bg-brutal-pink text-black", text: "Building the design system & responsive layouts" },
    { tag: "[DEV-03]", color: "bg-brutal-cyan text-black", text: "Writing React components & FastAPI routes (MongoDB)" },
    { tag: "[QA-04]", color: "bg-brutal-green text-black", text: "Running syntax & type checks in the sandbox (Score: 92/100)" },
    { tag: "[SHIP-05]", color: "bg-purple-400 text-black", text: "Build validated: ready to push to GitHub" },
  ];

  return (
    <section className="relative pt-12 pb-16 md:pt-20 md:pb-24 px-4 sm:px-6 lg:px-8 border-b-3 border-black dark:border-white/80 overflow-hidden">
      {/* Background Dot Grid */}
      <div className="absolute inset-0 bg-[radial-gradient(#000000_1px,transparent_1px)] dark:bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px] opacity-10 pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Top Tag Pill */}
        <Reveal>
          <div className="inline-flex items-center gap-2 border-2 border-black bg-brutal-yellow text-black px-3 py-1 font-mono font-black text-xs uppercase shadow-[3px_3px_0px_#000] mb-6">
            <Sparkles size={14} strokeWidth={2.5} />
            <span>AI SOFTWARE ENGINEERING PLATFORM // MULTI-AGENT ARCHITECTURE</span>
            <span className="w-2 h-2 rounded-none bg-black animate-ping" />
          </div>
        </Reveal>

        {/* Main Headline */}
        <Reveal delay={0.06}>
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-mono font-black uppercase tracking-tight leading-[1.02] text-ink max-w-5xl mb-6">
            SOFTWARE,{" "}
            <span className="inline-block bg-brutal-yellow text-black px-3 py-0.5 border-3 border-black shadow-[4px_4px_0px_#000] dark:shadow-[4px_4px_0px_#fff]">
              ENGINEERED.
            </span>
            <br />
            NOT JUST GENERATED.
          </h1>
        </Reveal>

        {/* Sub-headline */}
        <Reveal delay={0.12}>
          <p className="text-base sm:text-xl font-mono text-muted max-w-3xl leading-relaxed mb-8">
            Describe what you want to build. A synchronized team of 6 specialist AI agents designs
            the architecture, writes the full stack, checks it and fixes what fails, and hands you code you push to your own GitHub.
          </p>
        </Reveal>

        {/* CTA Buttons */}
        <Reveal delay={0.18}>
          <div className="flex flex-wrap items-center gap-4 mb-12">
            <Link
              to="/signup"
              className="inline-flex items-center justify-center gap-2 h-14 px-8 border-3 border-black bg-brutal-yellow text-black font-mono font-black text-sm uppercase shadow-[5px_5px_0px_#000] hover:bg-[#2DD4BF] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[7px_7px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0px_#000] transition-all cursor-pointer"
            >
              <span>START BUILDING FREE</span>
              <ArrowRight size={16} strokeWidth={2.5} />
            </Link>

            <Link
              to="/launch"
              className="inline-flex items-center justify-center gap-2 h-14 px-7 border-3 border-black dark:border-white/80 bg-white dark:bg-[#18181C] text-ink font-mono font-black text-sm uppercase shadow-[5px_5px_0px_#000] dark:shadow-[5px_5px_0px_#fff] hover:bg-neutral-100 dark:hover:bg-[#252530] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] transition-all cursor-pointer"
            >
              <Terminal size={16} strokeWidth={2.5} />
              <span>QUICK LAUNCH ($ build)</span>
            </Link>

            <Link
              to="/build/demo-project"
              className="inline-flex items-center justify-center gap-2 h-14 px-6 border-3 border-black dark:border-white/80 bg-brutal-cyan text-black font-mono font-black text-sm uppercase shadow-[5px_5px_0px_#000] hover:bg-[#54A0FF] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] transition-all cursor-pointer"
            >
              <FolderGit2 size={16} strokeWidth={2.5} />
              <span>EXPLORE WORKSPACE IDE</span>
            </Link>
          </div>
        </Reveal>

        {/* Hero Interactive Terminal & System Inspector */}
        <Reveal delay={0.24}>
          <div className="border-3 border-black dark:border-white/80 bg-white dark:bg-[#18181C] shadow-[8px_8px_0px_#000] dark:shadow-[8px_8px_0px_#fff] overflow-hidden">
            {/* Window Title Bar */}
            <div className="h-10 bg-[#EFECE6] dark:bg-[#252530] border-b-3 border-black dark:border-white/80 px-4 flex items-center justify-between font-mono text-xs font-black">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 border border-black bg-red-400" />
                  <div className="w-3 h-3 border border-black bg-yellow-400" />
                  <div className="w-3 h-3 border border-black bg-green-400" />
                </div>
                <span className="tracking-wider uppercase text-ink">
                  FORGE_PIPELINE.SH // STATUS: COMPILED
                </span>
              </div>

              {/* Surface Tabs */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("terminal")}
                  className={`px-3 py-1 border border-black text-[11px] font-mono font-bold uppercase transition ${
                    activeTab === "terminal"
                      ? "bg-brutal-yellow text-black shadow-[1px_1px_0px_#000]"
                      : "bg-white dark:bg-[#18181C] text-muted hover:text-ink"
                  }`}
                >
                  CONSOLE
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("tree")}
                  className={`px-3 py-1 border border-black text-[11px] font-mono font-bold uppercase transition ${
                    activeTab === "tree"
                      ? "bg-brutal-yellow text-black shadow-[1px_1px_0px_#000]"
                      : "bg-white dark:bg-[#18181C] text-muted hover:text-ink"
                  }`}
                >
                  ARTIFACTS
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("spec")}
                  className={`px-3 py-1 border border-black text-[11px] font-mono font-bold uppercase transition ${
                    activeTab === "spec"
                      ? "bg-brutal-yellow text-black shadow-[1px_1px_0px_#000]"
                      : "bg-white dark:bg-[#18181C] text-muted hover:text-ink"
                  }`}
                >
                  TELEMETRY
                </button>
              </div>
            </div>

            {/* Window Content */}
            <div className="p-4 sm:p-6 font-mono text-xs sm:text-sm">
              {activeTab === "terminal" && (
                <div className="space-y-3">
                  <div className="text-muted pb-2 border-b border-black/20 dark:border-white/20 flex items-center justify-between">
                    <span>$ forge build --intent="SaaS CRM with Stripe & Auth"</span>
                    <span className="text-brutal-green font-bold">● LIVE STREAM</span>
                  </div>

                  <div className="space-y-2.5 pt-1">
                    {terminalSteps.map((step, idx) => (
                      <div
                        key={step.tag}
                        className={`p-2.5 border-2 border-black dark:border-white/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                          idx <= activeStepIndex
                            ? "bg-white dark:bg-[#202028] shadow-[3px_3px_0px_#000] dark:shadow-[3px_3px_0px_#fff]"
                            : "opacity-40 border-dashed bg-neutral-50 dark:bg-[#15151A]"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={`px-2 py-0.5 border border-black font-black text-[11px] uppercase ${step.color}`}>
                            {step.tag}
                          </span>
                          <span className="font-bold text-ink">{step.text}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          {idx <= activeStepIndex ? (
                            <span className="font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 size={13} strokeWidth={2.5} /> DONE
                            </span>
                          ) : (
                            <span className="text-muted uppercase">QUEUED</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "tree" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { file: "backend/models.py", size: "3.2 KB", type: "MongoDB Data Models" },
                    { file: "backend/main.py", size: "8.4 KB", type: "FastAPI Application" },
                    { file: "backend/routes/billing.py", size: "4.1 KB", type: "Stripe Webhook Handlers" },
                    { file: "frontend/src/App.tsx", size: "12.8 KB", type: "React 18 + Tailwind Client" },
                    { file: "frontend/src/theme.ts", size: "1.1 KB", type: "Design System Tokens" },
                    { file: "backend/requirements.txt", size: "0.4 KB", type: "Python Dependencies" },
                  ].map((f) => (
                    <div
                      key={f.file}
                      className="p-3 border-2 border-black dark:border-white/80 bg-white dark:bg-[#202028] shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff] flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <FileCode size={16} className="text-amber-500" />
                        <div>
                          <div className="font-bold text-ink">{f.file}</div>
                          <div className="text-[11px] text-muted">{f.type}</div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 border border-black bg-neutral-100 dark:bg-neutral-800 text-[10px] font-bold">
                        {f.size}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "spec" && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "FLEET AGENTS", val: "6 SYNCHRONIZED", color: "bg-brutal-yellow" },
                    { label: "CREDITS PER BUILD", val: "~15-17", color: "bg-brutal-cyan" },
                    { label: "DEBUG PASSES", val: "UP TO 3", color: "bg-brutal-green" },
                    { label: "OUTPUT", val: "REACT + FASTAPI", color: "bg-brutal-pink" },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="p-3 border-2 border-black dark:border-white/80 bg-white dark:bg-[#202028] shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff]"
                    >
                      <div className="text-[10px] font-bold text-muted uppercase">{stat.label}</div>
                      <div className="text-sm sm:text-base font-black text-ink mt-1">{stat.val}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Window Footer Strip */}
            <div className="h-8 bg-[#FAF8F5] dark:bg-[#121216] border-t-2 border-black dark:border-white/80 px-4 flex items-center justify-between text-[11px] font-mono text-muted font-bold">
              <span>SHARED PROJECT STATE: 0 CONFLICTS</span>
              <span className="text-ink font-black">PORT 3000 [ONLINE]</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ─── 3. Tech Ticker Marquee ──────────────────────────────────────────────────

function TechTicker() {
  return (
    <div className="border-b-3 border-black dark:border-white/80 bg-brutal-yellow dark:bg-amber-400 text-black py-3 overflow-hidden select-none">
      <div className="flex items-center gap-8 font-mono font-black text-xs uppercase tracking-widest whitespace-nowrap animate-marquee">
        {[...TECH_PARTNERS, ...TECH_PARTNERS].map((tech, i) => (
          <div key={`${tech}-${i}`} className="flex items-center gap-3 shrink-0">
            <span className="px-2 py-0.5 border-2 border-black bg-white text-black shadow-[2px_2px_0px_#000]">
              {tech}
            </span>
            <span className="text-black font-black">✦</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 4. Inference & Paradigm Section ─────────────────────────────────────────

function InferenceSection() {
  return (
    <section id="solution" className="py-20 md:py-28 px-4 sm:px-6 lg:px-8 border-b-3 border-black dark:border-white/80 bg-[#FAF8F5] dark:bg-[#121216]">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <div className="inline-block px-3 py-1 border-2 border-black bg-brutal-cyan text-black font-mono font-black text-xs uppercase shadow-[3px_3px_0px_#000] mb-4">
            PARADIGM SHIFT // THE MULTI-AGENT ARCHITECTURE
          </div>
          <h2 className="text-3xl sm:text-5xl font-mono font-black uppercase tracking-tight text-ink max-w-4xl leading-[1.05] mb-6">
            CHATBOTS GUESS CODE.
            <br />
            <span className="bg-brutal-yellow text-black px-2 border-2 border-black inline-block mt-1">
              FORGE ENGINEERS COMPLETE SYSTEMS.
            </span>
          </h2>
        </Reveal>

        <Reveal delay={0.08}>
          <p className="text-base sm:text-lg font-mono text-muted max-w-3xl leading-relaxed mb-12">
            Single-prompt chatbots fail when building serious applications: context decays, hallucinated APIs cause silent errors, and no test verification happens. Forge coordinates dedicated specialist agents with shared project memory, automated validation loops, and direct GitHub synchronization.
          </p>
        </Reveal>

        {/* Contrast Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Reveal delay={0.12}>
            <div className="border-3 border-black dark:border-white/80 bg-white dark:bg-[#18181C] p-6 shadow-[5px_5px_0px_#000] dark:shadow-[5px_5px_0px_#fff]">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 border-2 border-black bg-red-400 text-black font-mono font-black text-xs uppercase shadow-[2px_2px_0px_#000] mb-4">
                <X size={14} strokeWidth={3} />
                <span>TRADITIONAL CHATBOT CODER</span>
              </div>
              <ul className="space-y-3 font-mono text-xs sm:text-sm">
                <li className="flex items-start gap-2.5 text-muted">
                  <span className="text-red-500 font-bold">✕</span>
                  <span>Single generalist model attempts to write CSS, SQL, business logic, and security in one prompt.</span>
                </li>
                <li className="flex items-start gap-2.5 text-muted">
                  <span className="text-red-500 font-bold">✕</span>
                  <span>Generates hundreds of unverified lines that fail compilation silently.</span>
                </li>
                <li className="flex items-start gap-2.5 text-muted">
                  <span className="text-red-500 font-bold">✕</span>
                  <span>Forces you into a locked sandbox where you can't access standard Git repos or Docker runtimes.</span>
                </li>
              </ul>
            </div>
          </Reveal>

          <Reveal delay={0.16}>
            <div className="border-3 border-black dark:border-white/80 bg-white dark:bg-[#18181C] p-6 shadow-[5px_5px_0px_#000] dark:shadow-[5px_5px_0px_#fff]">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 border-2 border-black bg-brutal-green text-black font-mono font-black text-xs uppercase shadow-[2px_2px_0px_#000] mb-4">
                <Check size={14} strokeWidth={3} />
                <span>FORGE AUTONOMOUS FLEET</span>
              </div>
              <ul className="space-y-3 font-mono text-xs sm:text-sm">
                <li className="flex items-start gap-2.5 text-ink font-bold">
                  <span className="text-emerald-500 font-black">✓</span>
                  <span>Architect blueprints the schema, Designer styles, Developer codes, and PM checks the build against your spec.</span>
                </li>
                <li className="flex items-start gap-2.5 text-ink font-bold">
                  <span className="text-emerald-500 font-black">✓</span>
                  <span>Automatic 3-pass self-correcting debug loop heals compiler errors before code ships.</span>
                </li>
                <li className="flex items-start gap-2.5 text-ink font-bold">
                  <span className="text-emerald-500 font-black">✓</span>
                  <span>Pushes to your own GitHub repository, with no proprietary runtime.</span>
                </li>
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ─── 5. The 6 Autonomous Agents Section ──────────────────────────────────────

function AgentsSection() {
  return (
    <section id="agents" className="py-20 md:py-28 px-4 sm:px-6 lg:px-8 border-b-3 border-black dark:border-white/80 bg-[#F4F0EA] dark:bg-[#18181C]">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <div className="inline-block px-3 py-1 border-2 border-black bg-brutal-yellow text-black font-mono font-black text-xs uppercase shadow-[3px_3px_0px_#000] mb-4">
            [ 01 // AGENT FLEET ]
          </div>
          <h2 className="text-3xl sm:text-5xl font-mono font-black uppercase tracking-tight text-ink max-w-3xl leading-[1.05] mb-4">
            THE SPECIALIST SQUAD BEHIND EVERY COMPILE.
          </h2>
          <p className="text-base sm:text-lg font-mono text-muted max-w-2xl leading-relaxed mb-12">
            No single model can master every layer of modern software. Forge coordinates 6 autonomous agents,
            each specialized for a dedicated engineering discipline.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {AGENT_DOSSIERS.map((agent, i) => (
            <Reveal key={agent.id} delay={0.05 * i}>
              <div className="border-3 border-black dark:border-white/80 bg-white dark:bg-[#202028] p-6 shadow-[5px_5px_0px_#000] dark:shadow-[5px_5px_0px_#fff] flex flex-col justify-between h-full group hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all">
                <div>
                  {/* Card Header */}
                  <div className="flex items-center justify-between pb-4 border-b-2 border-black dark:border-white/80 mb-4">
                    <span className={`px-2.5 py-1 border-2 border-black font-mono font-black text-xs uppercase shadow-[2px_2px_0px_#000] ${agent.badgeBg}`}>
                      {agent.roleId}
                    </span>
                    <span className="font-mono text-[11px] font-bold text-muted uppercase">
                      STATUS: ONLINE
                    </span>
                  </div>

                  <h3 className="text-xl font-mono font-black uppercase text-ink mb-2">
                    {agent.name}
                  </h3>

                  <p className="font-mono text-xs sm:text-sm text-muted leading-relaxed mb-6">
                    {agent.description}
                  </p>
                </div>

                <div>
                  {/* Deliverables List */}
                  <div className="p-3 border-2 border-black dark:border-white/80 bg-neutral-50 dark:bg-[#18181C] font-mono text-xs space-y-1.5 mb-4">
                    <div className="text-[10px] font-black uppercase tracking-wider text-muted">
                      PRODUCES:
                    </div>
                    {agent.deliverables.map((del) => (
                      <div key={del} className="flex items-center gap-1.5 font-bold text-ink">
                        <span className="text-amber-500">↳</span>
                        <span>{del}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-3 border-t-2 border-black dark:border-white/80 flex items-center justify-between font-mono text-[11px] font-bold text-ink">
                    <span className="text-muted">IN SHORT:</span>
                    <span className="text-amber-600 dark:text-amber-400 font-black">{agent.systemMetric}</span>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── 6. Interactive 5-Step Workflow Pipeline ─────────────────────────────────

function WorkflowSection() {
  const [selectedStep, setSelectedStep] = useState(0);

  return (
    <section id="workflow" className="py-20 md:py-28 px-4 sm:px-6 lg:px-8 border-b-3 border-black dark:border-white/80 bg-[#FAF8F5] dark:bg-[#121216]">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <div className="inline-block px-3 py-1 border-2 border-black bg-brutal-green text-black font-mono font-black text-xs uppercase shadow-[3px_3px_0px_#000] mb-4">
            [ 02 // PIPELINE ]
          </div>
          <h2 className="text-3xl sm:text-5xl font-mono font-black uppercase tracking-tight text-ink max-w-3xl leading-[1.05] mb-4">
            FROM PROMPT TO YOUR GITHUB REPO. 5 STEPS.
          </h2>
          <p className="text-base sm:text-lg font-mono text-muted max-w-2xl leading-relaxed mb-12">
            Every build traverses an immutable assembly line. Click any step to inspect the agent operations
            and emitted artifacts.
          </p>
        </Reveal>

        {/* Step Selector Chips */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
          {WORKFLOW_STEPS.map((s, idx) => (
            <button
              key={s.step}
              type="button"
              onClick={() => setSelectedStep(idx)}
              className={`p-3.5 border-3 border-black dark:border-white/80 font-mono text-left transition-all cursor-pointer ${
                selectedStep === idx
                  ? "bg-brutal-yellow text-black shadow-[4px_4px_0px_#000] dark:shadow-[4px_4px_0px_#fff] -translate-y-1"
                  : "bg-white dark:bg-[#202028] text-ink hover:bg-neutral-100 dark:hover:bg-[#2A2A35] shadow-[2px_2px_0px_#000]"
              }`}
            >
              <div className="font-mono text-xs font-black mb-1">{s.step}</div>
              <div className="font-mono font-black text-sm uppercase">{s.label}</div>
            </button>
          ))}
        </div>

        {/* Selected Step Detail Panel */}
        <Reveal key={selectedStep}>
          <div className="border-3 border-black dark:border-white/80 bg-white dark:bg-[#18181C] p-6 sm:p-8 shadow-[6px_6px_0px_#000] dark:shadow-[6px_6px_0px_#fff]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b-2 border-black dark:border-white/80 mb-6">
              <div>
                <div className="font-mono text-xs font-bold text-muted uppercase">
                  PHASE {WORKFLOW_STEPS[selectedStep].step}
                </div>
                <div className="text-2xl sm:text-3xl font-mono font-black uppercase text-ink">
                  {WORKFLOW_STEPS[selectedStep].tagline}
                </div>
              </div>

              <div className="px-3 py-1.5 border-2 border-black bg-brutal-cyan text-black font-mono font-black text-xs uppercase shadow-[2px_2px_0px_#000]">
                DISPATCHED: {WORKFLOW_STEPS[selectedStep].agent}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 font-mono">
              <div className="space-y-4">
                <div className="text-xs font-black uppercase text-muted">OPERATIONAL PROTOCOL:</div>
                <p className="text-sm sm:text-base text-ink leading-relaxed font-medium">
                  {WORKFLOW_STEPS[selectedStep].details}
                </p>
              </div>

              <div className="p-4 border-2 border-black dark:border-white/80 bg-[#FAF8F5] dark:bg-[#202028] shadow-[3px_3px_0px_#000]">
                <div className="text-xs font-black uppercase text-muted mb-2">OUTPUT ARTIFACT:</div>
                <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 size={16} strokeWidth={2.5} />
                  <span>{WORKFLOW_STEPS[selectedStep].output}</span>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ─── 7. Features Bento Grid ──────────────────────────────────────────────────

function FeaturesSection() {
  return (
    <section id="features" className="py-20 md:py-28 px-4 sm:px-6 lg:px-8 border-b-3 border-black dark:border-white/80 bg-[#F4F0EA] dark:bg-[#18181C]">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <div className="inline-block px-3 py-1 border-2 border-black bg-brutal-pink text-black font-mono font-black text-xs uppercase shadow-[3px_3px_0px_#000] mb-4">
            [ 03 // CAPABILITIES ]
          </div>
          <h2 className="text-3xl sm:text-5xl font-mono font-black uppercase tracking-tight text-ink max-w-3xl leading-[1.05] mb-4">
            BUILT FOR REAL PRODUCTION ENGINEERING.
          </h2>
          <p className="text-base sm:text-lg font-mono text-muted max-w-2xl leading-relaxed mb-12">
            Every step is built to catch hallucinated APIs and broken code before you see it,
            and to hand you a standard codebase in your own repo.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES_BENTO.map((feat, i) => {
            const FeatIcon = feat.icon;
            return (
              <Reveal key={feat.code} delay={0.04 * i}>
                <div className="border-3 border-black dark:border-white/80 bg-white dark:bg-[#202028] p-6 shadow-[5px_5px_0px_#000] dark:shadow-[5px_5px_0px_#fff] flex flex-col justify-between h-full group hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all">
                  <div>
                    <div className="flex items-center justify-between pb-4 border-b-2 border-black dark:border-white/80 mb-4">
                      <span className={`px-2.5 py-1 border-2 border-black font-mono font-black text-xs uppercase shadow-[2px_2px_0px_#000] ${feat.badgeColor}`}>
                        {feat.badge}
                      </span>
                      <span className="font-mono text-xs font-black text-muted">{feat.code}</span>
                    </div>

                    <div className="w-10 h-10 border-2 border-black bg-brutal-yellow text-black flex items-center justify-center shadow-[2px_2px_0px_#000] mb-4">
                      <FeatIcon size={18} strokeWidth={2.5} />
                    </div>

                    <h3 className="text-lg font-mono font-black uppercase text-ink mb-3">
                      {feat.title}
                    </h3>

                    <p className="font-mono text-xs sm:text-sm text-muted leading-relaxed mb-6">
                      {feat.description}
                    </p>
                  </div>

                  <div className="pt-4 border-t-2 border-black dark:border-white/80 flex items-center justify-between font-mono text-xs font-black text-ink">
                    <span className="text-muted">IN SHORT:</span>
                    <span className="px-2 py-0.5 border border-black bg-neutral-100 dark:bg-neutral-800 text-ink">
                      {feat.kpi}
                    </span>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── 8. Why Forge Section ────────────────────────────────────────────────────

function WhyForgeSection() {
  const points = [
    { old: "Other tools generate isolated code snippets.", forge: "Forge plans, builds and checks full applications." },
    { old: "Other tools show you a preview and hope it works.", forge: "Forge checks the code and runs a self-correcting debug loop." },
    { old: "Other tools guess blindly what your schema should look like.", forge: "Forge architects plan, audit, and validate typed contracts." },
    { old: "Other tools trap your code in a proprietary web sandbox.", forge: "Forge pushes the code to your own GitHub repository." },
    { old: "Other tools are one model pretending to be a team.", forge: "Forge is a genuine synchronized multi-agent engineering fleet." },
  ];

  return (
    <section className="py-20 md:py-28 px-4 sm:px-6 lg:px-8 border-b-3 border-black dark:border-white/80 bg-[#FAF8F5] dark:bg-[#121216]">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <div className="inline-block px-3 py-1 border-2 border-black bg-brutal-yellow text-black font-mono font-black text-xs uppercase shadow-[3px_3px_0px_#000] mb-4">
            [ 04 // THE ADVANTAGE ]
          </div>
          <h2 className="text-3xl sm:text-5xl font-mono font-black uppercase tracking-tight text-ink max-w-3xl leading-[1.05] mb-12">
            BECAUSE SHIPPING IS THE ONLY METRIC THAT MATTERS.
          </h2>
        </Reveal>

        <div className="space-y-4">
          {points.map((pt, idx) => (
            <Reveal key={idx} delay={0.04 * idx}>
              <div className="border-3 border-black dark:border-white/80 bg-white dark:bg-[#18181C] p-4 sm:p-6 shadow-[4px_4px_0px_#000] dark:shadow-[4px_4px_0px_#fff] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 font-mono">
                <div className="flex items-center gap-3 text-muted text-xs sm:text-sm md:w-1/2">
                  <span className="w-6 h-6 shrink-0 border-2 border-black bg-red-400 text-black flex items-center justify-center font-black text-xs shadow-[1.5px_1.5px_0px_#000]">
                    ✕
                  </span>
                  <span>{pt.old}</span>
                </div>

                <div className="hidden md:block w-px h-8 bg-black/20 dark:bg-white/20" />

                <div className="flex items-center gap-3 text-ink font-bold text-xs sm:text-sm md:w-1/2">
                  <span className="w-6 h-6 shrink-0 border-2 border-black bg-brutal-green text-black flex items-center justify-center font-black text-xs shadow-[1.5px_1.5px_0px_#000]">
                    ✓
                  </span>
                  <span>{pt.forge}</span>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── 9. Comparison Matrix ────────────────────────────────────────────────────

function ComparisonSection() {
  return (
    <section id="compare" className="py-20 md:py-28 px-4 sm:px-6 lg:px-8 border-b-3 border-black dark:border-white/80 bg-[#F4F0EA] dark:bg-[#18181C]">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <div className="inline-block px-3 py-1 border-2 border-black bg-brutal-cyan text-black font-mono font-black text-xs uppercase shadow-[3px_3px_0px_#000] mb-4">
            [ 05 // COMPARISON ]
          </div>
          <h2 className="text-3xl sm:text-5xl font-mono font-black uppercase tracking-tight text-ink max-w-3xl leading-[1.05] mb-4">
            COMPARE AGAINST EVERY GENERATION TOOL.
          </h2>
          <p className="text-base sm:text-lg font-mono text-muted max-w-2xl leading-relaxed mb-12">
            Here is what happens when real specialist agents coordinate over shared project memory
            versus a single prompt generator.
          </p>
        </Reveal>

        <div className="overflow-x-auto border-3 border-black dark:border-white/80 bg-white dark:bg-[#202028] shadow-[6px_6px_0px_#000] dark:shadow-[6px_6px_0px_#fff]">
          <table className="w-full font-mono text-xs sm:text-sm text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b-3 border-black dark:border-white/80 bg-[#EFECE6] dark:bg-[#252530] text-black dark:text-white font-black uppercase">
                <th className="p-4 border-r-2 border-black dark:border-white/80">CAPABILITY</th>
                <th className="p-4 text-center border-r-2 border-black dark:border-white/80">CHATBOTS</th>
                <th className="p-4 text-center border-r-2 border-black dark:border-white/80">AI COPILOTS</th>
                <th className="p-4 text-center bg-brutal-yellow text-black border-l-2 border-black">
                  FORGE AI v2.4
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr
                  key={row.feature}
                  className="border-b-2 border-black/20 dark:border-white/20 hover:bg-neutral-50 dark:hover:bg-[#2A2A35]"
                >
                  <td className="p-4 font-bold text-ink border-r-2 border-black dark:border-white/80">
                    {row.feature}
                  </td>
                  <td className="p-4 text-center text-muted border-r-2 border-black dark:border-white/80">
                    {row.chatbots}
                  </td>
                  <td className="p-4 text-center text-muted border-r-2 border-black dark:border-white/80">
                    {row.copilots}
                  </td>
                  <td className="p-4 text-center font-black bg-brutal-yellow/20 text-ink border-l-2 border-black">
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <Check size={14} strokeWidth={3} />
                      {row.forge}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ─── 10. Pricing Section ─────────────────────────────────────────────────────

function PricingSection() {
  return (
    <section id="pricing" className="py-20 md:py-28 px-4 sm:px-6 lg:px-8 border-b-3 border-black dark:border-white/80 bg-[#FAF8F5] dark:bg-[#121216]">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <div className="inline-block px-3 py-1 border-2 border-black bg-brutal-green text-black font-mono font-black text-xs uppercase shadow-[3px_3px_0px_#000] mb-4">
            [ 06 // PLANS & PRICING ]
          </div>
          <h2 className="text-3xl sm:text-5xl font-mono font-black uppercase tracking-tight text-ink max-w-3xl leading-[1.05] mb-4">
            START FREE. SCALE WHEN YOU SHIP.
          </h2>
          <p className="text-base sm:text-lg font-mono text-muted max-w-2xl leading-relaxed mb-12">
            Each agent step uses credits; a typical full-stack build uses about 15 to 17. Your first build is free, so you can see a finished app before paying anything.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PRICING_PLANS.map((plan, i) => (
            <Reveal key={plan.name} delay={0.06 * i}>
              <div
                className={`border-3 border-black dark:border-white/80 p-6 sm:p-8 flex flex-col justify-between h-full relative transition-all ${
                  plan.featured
                    ? "bg-brutal-yellow text-black shadow-[8px_8px_0px_#000] dark:shadow-[8px_8px_0px_#fff] -translate-y-2"
                    : "bg-white dark:bg-[#202028] text-ink shadow-[5px_5px_0px_#000] dark:shadow-[5px_5px_0px_#fff]"
                }`}
              >
                {/* Badge */}
                <div>
                  <div className="flex items-center justify-between pb-4 border-b-2 border-black mb-6">
                    <span className="font-mono font-black text-xs uppercase tracking-wider">
                      {plan.name}
                    </span>
                    <span className={`px-2 py-0.5 border border-black font-mono font-black text-[10px] uppercase shadow-[1.5px_1.5px_0px_#000] ${plan.badgeBg}`}>
                      {plan.badge}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-1 font-mono mb-2">
                    <span className="text-4xl sm:text-5xl font-black">{plan.price}</span>
                    <span className="font-bold text-xs uppercase opacity-80">{plan.frequency}</span>
                  </div>

                  <p className="font-mono font-black text-xs uppercase mb-4 text-emerald-700 dark:text-emerald-400">
                    {plan.credits}
                  </p>

                  <p className="font-mono text-xs leading-relaxed mb-8 opacity-90">
                    {plan.description}
                  </p>

                  {/* Features List */}
                  <div className="space-y-3 font-mono text-xs mb-8">
                    {plan.features.map((feat) => (
                      <div key={feat} className="flex items-start gap-2">
                        <span className="font-black mt-0.5">✓</span>
                        <span className="font-bold">{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <Link
                  to={plan.ctaPath}
                  className={`w-full py-3.5 border-2 border-black font-mono font-black text-xs uppercase text-center block transition shadow-[3px_3px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] ${
                    plan.featured
                      ? "bg-black text-white hover:bg-[#2DD4BF] hover:text-black"
                      : "bg-brutal-yellow text-black hover:bg-[#2DD4BF]"
                  }`}
                >
                  {plan.cta} ↵
                </Link>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="mt-6 p-5 border-2 border-black dark:border-white/80 bg-white dark:bg-[#1A1A22] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="font-mono font-black uppercase text-ink">Enterprise: custom pricing</p>
            <p className="text-sm font-mono text-muted mt-1">
              Custom credit volume, unlimited projects, bring your own LLM keys, and dedicated support.
            </p>
          </div>
          <Link
            to="/signup?plan=enterprise"
            className="shrink-0 px-5 py-2.5 border-2 border-black dark:border-white font-mono font-black text-xs uppercase text-ink hover:bg-neutral-100 dark:hover:bg-white/10"
          >
            Talk to us ↵
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── 11. FAQ Section ─────────────────────────────────────────────────────────

function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="py-20 md:py-28 px-4 sm:px-6 lg:px-8 border-b-3 border-black dark:border-white/80 bg-[#F4F0EA] dark:bg-[#18181C]">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <div className="inline-block px-3 py-1 border-2 border-black bg-brutal-yellow text-black font-mono font-black text-xs uppercase shadow-[3px_3px_0px_#000] mb-4">
            [ 07 // FREQUENTLY ASKED QUESTIONS ]
          </div>
          <h2 className="text-3xl sm:text-5xl font-mono font-black uppercase tracking-tight text-ink max-w-3xl leading-[1.05] mb-12">
            ANSWERS TO HARD ENGINEERING QUESTIONS.
          </h2>
        </Reveal>

        <div className="space-y-4 max-w-4xl">
          {FAQS.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <Reveal key={faq.q} delay={0.03 * idx}>
                <div className="border-3 border-black dark:border-white/80 bg-white dark:bg-[#202028] shadow-[4px_4px_0px_#000] dark:shadow-[4px_4px_0px_#fff]">
                  <button
                    type="button"
                    onClick={() => setOpenIndex(isOpen ? null : idx)}
                    className="w-full p-5 sm:p-6 text-left flex items-center justify-between gap-4 font-mono font-black text-sm sm:text-base text-ink uppercase cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    <span className="w-7 h-7 shrink-0 border-2 border-black bg-brutal-yellow text-black flex items-center justify-center font-black text-sm shadow-[1.5px_1.5px_0px_#000]">
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="p-5 sm:p-6 pt-0 font-mono text-xs sm:text-sm text-muted leading-relaxed border-t-2 border-black/10 dark:border-white/10 mt-2">
                      {faq.a}
                    </div>
                  )}
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── 12. Giant Final CTA Billboard ───────────────────────────────────────────

function FinalCTA() {
  return (
    <section className="py-20 md:py-32 px-4 sm:px-6 lg:px-8 bg-[#FAF8F5] dark:bg-[#101014] border-b-3 border-black dark:border-white/80">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <div className="border-4 border-black bg-brutal-yellow text-black p-8 sm:p-14 shadow-[8px_8px_0px_#000] dark:shadow-[8px_8px_0px_#fff]">
            <div className="font-mono font-black text-xs uppercase tracking-widest mb-4 flex items-center gap-2">
              <Flame size={16} strokeWidth={2.5} />
              <span>READY TO SHIP REAL SOFTWARE?</span>
            </div>

            <h2 className="text-3xl sm:text-6xl font-mono font-black uppercase tracking-tight leading-[1.02] mb-6">
              YOUR NEXT APPLICATION IS ONE PROMPT AWAY.
            </h2>

            <p className="font-mono text-sm sm:text-lg font-bold max-w-2xl leading-relaxed mb-8">
              No credit card required. 10 free credits, and your first build is free. Push the code to your own GitHub repo.
            </p>

            <div className="flex flex-wrap items-center gap-4">
              <Link
                to="/signup"
                className="inline-flex items-center justify-center gap-2 h-14 px-8 border-3 border-black bg-black text-white font-mono font-black text-sm uppercase shadow-[4px_4px_0px_#000] hover:bg-[#2DD4BF] hover:text-black transition cursor-pointer"
              >
                <span>CLAIM FREE CREDITS</span>
                <ArrowRight size={16} strokeWidth={2.5} />
              </Link>

              <Link
                to="/launch"
                className="inline-flex items-center justify-center gap-2 h-14 px-7 border-3 border-black bg-white text-black font-mono font-black text-sm uppercase shadow-[4px_4px_0px_#000] hover:bg-neutral-100 transition cursor-pointer"
              >
                <Terminal size={16} strokeWidth={2.5} />
                <span>OPEN CLI LAUNCHPAD</span>
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ─── 13. Neo-Brutalist Footer ────────────────────────────────────────────────

export function Footer() {
  return (
    <footer className="bg-[#EFECE6] dark:bg-[#18181C] text-ink font-mono py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 pb-8 border-b-2 border-black dark:border-white/80">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <BrandLogo size="xs" />
              <span className="font-black text-sm uppercase tracking-wider">FORGE AI OS</span>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              A team of AI agents that turns a product description into a planned, built and checked full-stack app.
            </p>
          </div>

          <div>
            <div className="font-black text-xs uppercase tracking-wider mb-3">SURFACES</div>
            <ul className="space-y-2 text-xs text-muted font-bold">
              <li><Link to="/launch" className="hover:text-ink">CLI Launchpad ($ build)</Link></li>
              <li><Link to="/build/demo-project" className="hover:text-ink">Workspace IDE</Link></li>
              <li><Link to="/projects" className="hover:text-ink">Projects Library</Link></li>
              <li><Link to="/flow" className="hover:text-ink">Living Agent Fleet</Link></li>
              <li><Link to="/marketplace" className="hover:text-ink">Playbook Marketplace</Link></li>
            </ul>
          </div>

          <div>
            <div className="font-black text-xs uppercase tracking-wider mb-3">DOCUMENTATION</div>
            <ul className="space-y-2 text-xs text-muted font-bold">
              <li><a href="#solution" className="hover:text-ink">Agent Fleet Spec</a></li>
              <li><a href="#workflow" className="hover:text-ink">5-Step Pipeline</a></li>
              <li><a href="#compare" className="hover:text-ink">Compiler Benchmarks</a></li>
              <li><a href="#pricing" className="hover:text-ink">Credit Allocations</a></li>
            </ul>
          </div>

          <div>
            <div className="font-black text-xs uppercase tracking-wider mb-3">SECURITY & TRUST</div>
            <ul className="space-y-2 text-xs text-muted font-bold">
              <li><span className="flex items-center gap-1.5"><Lock size={12} /> BYOK Encryption</span></li>
              <li><span className="flex items-center gap-1.5"><Server size={12} /> Ephemeral Sandboxes</span></li>
              <li><span className="flex items-center gap-1.5"><ShieldCheck size={12} /> SOC2 Ready Architecture</span></li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-bold text-muted">
          <div>
            © {new Date().getFullYear()} FORGE AI OS v2.4. NEUBRUTAL SYSTEM ARCHITECTURE.
          </div>
          <div className="flex items-center gap-4">
            <Link to="/login" className="hover:text-ink">SIGN IN</Link>
            <Link to="/signup" className="hover:text-ink">SIGN UP</Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-ink flex items-center gap-1"
            >
              <Github size={14} />
              <span>GITHUB</span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
