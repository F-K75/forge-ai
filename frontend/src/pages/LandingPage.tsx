import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Play,
  Check,
  X,
  Minus,
  Github,
  RefreshCw,
  BarChart3,
  Workflow as WorkflowIcon,
  KeyRound,
  Server,
  Layers,
  Network,
  Rocket,
  Briefcase,
  Users,
  Building2,
  Lock,
  ShieldCheck,
  Globe,
  Zap,
} from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { AGENTS, type Agent } from "../lib/agents";
import gsap from "gsap";
import { useStaggerIn, useSplitTextReveal } from "../lib/animations";
import { presets } from "../lib/animationPresets";

// ─── Primitives (ported from the Lovable design) ───────────────────────────

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-land-muted mb-6">
      <span className="w-6 h-px bg-land-muted/50" aria-hidden="true" />
      {children}
    </div>
  );
}

function SectionHead({ eyebrow, title, subtitle }: { eyebrow: string; title: ReactNode; subtitle?: string }) {
  return (
    <div className="max-w-2xl mb-16" data-reveal>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="font-display text-4xl md:text-5xl font-medium tracking-tight leading-[1.05] text-land-ink">
        {title}
      </h2>
      {subtitle && <p className="mt-5 text-land-muted text-base md:text-lg leading-relaxed">{subtitle}</p>}
    </div>
  );
}

function Section({ id, children, className = "" }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} data-reveal-section className={`py-32 border-t border-land-border ${className}`}>
      <div className="max-w-6xl mx-auto px-6">{children}</div>
    </section>
  );
}

// ─── Agent descriptions for the "team" section — kept separate from the
// terminal's short status fragments since a grid card reads better with a
// full sentence.
const AGENT_DESCRIPTIONS: Record<Agent["id"], string> = {
  architect: "Defines the system: data models, service boundaries, and how services communicate.",
  business_improver: "Validates the plan against real-world constraints and unit economics.",
  designer: "Produces a complete design system and UI — not wireframes, not placeholders.",
  developer: "Writes the full stack, streaming each file as it is created.",
  integration: "Connects Stripe, auth, and other services your app needs — automatically.",
  pm: "Evaluates the build against the plan and blocks anything below the quality bar.",
};

const AGENT_STATUS_LINES: Record<Agent["id"], string> = {
  architect: "designing service graph",
  business_improver: "checking unit economics",
  designer: "generating design tokens",
  developer: "scaffolding 32 files, 9 endpoints",
  integration: "wiring Stripe + auth",
  pm: "218 checks · quality gate",
};

const WORKFLOW_STEPS = [
  { n: "01", t: "Describe", d: "Tell Forge what you want to build, in plain English." },
  { n: "02", t: "Plan", d: "The architect drafts a typed blueprint and service graph." },
  { n: "03", t: "Build", d: "Designer and developer ship the UI and backend in parallel." },
  { n: "04", t: "Validate", d: "PM scores the build; a debug loop retries failures automatically." },
  { n: "05", t: "Ship", d: "Every build syncs to GitHub and deploys as a container." },
];

interface Feature {
  title: string;
  description: string;
  icon: typeof RefreshCw;
}

const FEATURES: Feature[] = [
  {
    title: "Self-correcting debug loop",
    description: "Reruns the responsible agent automatically, up to three times, until the build passes validation.",
    icon: RefreshCw,
  },
  {
    title: "Shared project memory",
    description: "Every agent reads and writes to the same project state, so context never gets lost between handoffs.",
    icon: Layers,
  },
  {
    title: "Quality score on every build",
    description: "Every build ships with a quality score, so you know what you are deploying.",
    icon: BarChart3,
  },
  {
    title: "Real stack, Docker deploy",
    description: "Production-grade code on a real stack, containerized and ready to deploy.",
    icon: Server,
  },
  {
    title: "Playbook integrations",
    description: "Stripe, Slack, and other services get wired in automatically when your app needs them.",
    icon: WorkflowIcon,
  },
  {
    title: "GitHub sync",
    description: "Every build pushes to a connected repo, so your code lives where your team already works.",
    icon: Github,
  },
  {
    title: "Bring your own key",
    description: "Use your own model key on the Pro plan for full control over usage and cost.",
    icon: KeyRound,
  },
  {
    title: "Provider-independent core",
    description: "Forge runs on a model-agnostic gateway, so your build is not tied to one AI provider.",
    icon: Network,
  },
];

const PROBLEM_POINTS = [
  { title: "Chat tools generate code.", body: "They do not reason about your product." },
  { title: "Autocomplete speeds up typing.", body: "It does not decide what to build." },
  { title: "Single-agent tools do it all alone.", body: "Architecture, UI, backend, tests — with nobody checking the work." },
];

const WHY_FORGE_LINES = [
  "Other tools generate code. Forge builds software.",
  "Other tools show you a demo. Forge ships you a deploy.",
  "Other tools guess what you meant. Forge's agents ask, plan, and validate.",
  "Other tools lock you into their sandbox. Forge hands you the repo.",
  "Other tools are one model pretending to be a team. Forge is a team.",
];

type CompareValue = "yes" | "no" | "partial";

interface CompareRow {
  capability: string;
  promptToApp: CompareValue;
  pairProgrammer: CompareValue;
  singleAgent: CompareValue;
}

const COMPARE_ROWS: CompareRow[] = [
  { capability: "Plans before building", promptToApp: "no", pairProgrammer: "no", singleAgent: "partial" },
  { capability: "Specialist roles (PM, architect, QA…)", promptToApp: "no", pairProgrammer: "no", singleAgent: "no" },
  { capability: "Shared project memory across steps", promptToApp: "no", pairProgrammer: "partial", singleAgent: "partial" },
  { capability: "Automatic quality scoring", promptToApp: "no", pairProgrammer: "no", singleAgent: "no" },
  { capability: "Self-correcting debug loop", promptToApp: "no", pairProgrammer: "no", singleAgent: "partial" },
  { capability: "Real stack + container deploy", promptToApp: "partial", pairProgrammer: "no", singleAgent: "partial" },
  { capability: "Own your code, no lock-in", promptToApp: "partial", pairProgrammer: "yes", singleAgent: "partial" },
];

interface Segment {
  icon: typeof Rocket;
  title: string;
  body: string;
}

const SEGMENTS: Segment[] = [
  { icon: Rocket, title: "Founders & indie hackers", body: "Go from idea to a live product without hiring a technical co-founder." },
  { icon: Briefcase, title: "Agencies", body: "Deliver client work faster without lowering your quality bar — every build is production-grade, not a demo you rebuild later." },
  { icon: Users, title: "Product teams", body: "Turn backlog items into working, tested features your engineers just have to review and merge." },
  { icon: Building2, title: "Enterprises & CTOs", body: "Give every team the output of a senior engineering org — reviewed, scored, and ready to merge." },
];

interface PricingPlan {
  name: string;
  price: string;
  credits: string;
  blurb: string;
  features: string[];
  cta: string;
  featured?: boolean;
}

const PRICING_PLANS: PricingPlan[] = [
  {
    name: "Free",
    price: "$0",
    credits: "10 credits",
    blurb: "Enough to ship your first real build.",
    features: ["1 project", "Community templates", "Public builds"],
    cta: "Get started",
  },
  {
    name: "Standard",
    price: "$29",
    credits: "100 credits / month",
    blurb: "For builders shipping regularly.",
    features: ["Unlimited projects", "Private builds", "GitHub sync"],
    cta: "Choose Standard",
  },
  {
    name: "Pro",
    price: "$99",
    credits: "750 credits / month",
    blurb: "Bring your own key, unlock the full team, publish to the marketplace.",
    features: ["1M context window", "Bring your own key", "GitHub sync", "Marketplace publishing", "Usage overages available"],
    cta: "Start building",
    featured: true,
  },
];

const FAQS = [
  {
    q: "How is Forge different from a code-completion tool?",
    a: "Autocomplete finishes a line. Forge's agents plan, build, and validate a full application from a single prompt.",
  },
  {
    q: "Is this just a chatbot with extra steps?",
    a: "No. Forge does not wait for you to prompt each step. Specialist agents plan, hand off, and validate the build on their own — you step in to review and ship.",
  },
  {
    q: "Do I own the code Forge writes?",
    a: "Yes. Every build can sync to a GitHub repository you control — no lock-in.",
  },
  {
    q: "What happens if a build fails validation?",
    a: "The debug loop automatically reruns the responsible agent, up to three times, before a build is marked failed.",
  },
  {
    q: "Can I use my own model key?",
    a: "Yes — on the Pro plan you can bring your own Anthropic key for full control over usage and cost.",
  },
  {
    q: "Can Forge work with an existing codebase?",
    a: "Today, Forge builds new projects from a prompt. Support for extending existing codebases is on the roadmap.",
  },
];

// ─── Page ───────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const id = window.setInterval(() => {
      setActiveIndex((i) => (i + 1) % AGENTS.length);
    }, 1600);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="launch-os w-full scroll-smooth text-ink">
      <div className="fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div className="launch-atmosphere absolute inset-0" />
        <div className="launch-name-veil absolute inset-0" />
      </div>

      <div className="relative z-10 bg-base">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-md focus:bg-land-ink focus:text-land-paper focus:text-sm focus:font-medium"
        >
          Skip to content
        </a>
        <Nav />
        <main id="main-content">
          <LandingPageBody />
        </main>
        <Footer />
      </div>
    </div>
  );
}

// Everything below the hero — split out so Launch.tsx (the "/" splash) can
// scroll straight from its globe into this same content instead of routing
// away to /home. Owns its own scroll-reveal IntersectionObserver so it works
// wherever it's mounted.
export function LandingPageBody() {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    const ctx = gsap.context(() => {
      const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal-section]"));
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const el = entry.target as HTMLElement;
            gsap.from(el.querySelectorAll("[data-reveal]"), {
              opacity: 0,
              y: 28,
              duration: 0.6,
              ease: "power3.out",
              stagger: 0.08,
            });
            io.unobserve(el);
          });
        },
        { threshold: 0.15 },
      );
      targets.forEach((el) => io.observe(el));
      return () => io.disconnect();
    });
    return () => ctx.revert();
  }, [reduceMotion]);

  return (
    <>
      <ProblemSection />
      <SolutionSection />
      <WorkflowSection />
      <Agents />
      <FeaturesSection />
      <WhyForgeSection />
      <ComparisonSection />
      <CustomerBenefitsSection />
      <TrustSection />
      <PricingSection />
      <FAQSection />
      <FinalCTA />
    </>
  );
}

// ─── Nav ────────────────────────────────────────────────────────────────────

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5">
      <div
        className={[
          "mx-auto max-w-content rounded-apple-lg px-4 transition-all duration-300 sm:px-5",
          scrolled ? "apple-glass-strong" : "apple-glass",
        ].join(" ")}
      >
        <nav aria-label="Primary" className="flex h-14 items-center justify-between md:h-16">
          <a
            href="#top"
            className="flex items-center gap-2.5 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <BrandLogo size="md" />
            <span className="font-brand text-[17px] font-semibold tracking-tight text-ink">
              Forge
            </span>
          </a>

          <div className="hidden items-center gap-8 text-[13px] font-medium text-muted md:flex">
            <a href="#agents" className="transition hover:text-ink">
              Agents
            </a>
            <a href="#workflow" className="transition hover:text-ink">
              Workflow
            </a>
            <a href="#features" className="transition hover:text-ink">
              Features
            </a>
            <a href="#pricing" className="transition hover:text-ink">
              Pricing
            </a>
          </div>

          <div className="flex items-center gap-3">
            <Link to="/login" className="text-[14px] font-medium text-muted transition hover:text-ink">
              Sign in
            </Link>
            <motion.div {...presets.button}>
              <Link
                to="/signup"
                className="inline-flex items-center rounded-full bg-accent px-4 py-2 text-[14px] font-medium text-white transition hover:brightness-110"
              >
                Start building
              </Link>
            </motion.div>
          </div>
        </nav>
      </div>
    </header>
  );
}

// ─── Hero ───────────────────────────────────────────────────────────────────

function Hero({ activeIndex }: { activeIndex: number }) {
  const reduceMotion = useReducedMotion();
  // anime.js staggered reveal of the simulated build transcript lines
  useStaggerIn("[data-hero-transcript] [data-line]", 70);
  // SplitType + GSAP word-by-word reveal of the headline
  const headlineRef = useRef<HTMLHeadingElement>(null);
  useSplitTextReveal(headlineRef, { by: "words", stagger: 0.025, delay: 0.15 });

  return (
    <section id="top" className="pt-28 pb-36">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          className="max-w-3xl"
          initial={reduceMotion ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="inline-flex items-center gap-2 text-xs text-land-muted mb-8" data-reveal>
            <span className="w-1.5 h-1.5 rounded-full bg-land-accent" aria-hidden="true" />
            The AI engineering organization — live now
          </div>

          <h1
            ref={headlineRef}
            data-reveal
            className="font-display text-5xl md:text-7xl font-medium leading-[1.02] tracking-tight"
          >
            Software, engineered.
            <br />
            <span className="text-land-muted">Not generated.</span>
          </h1>

          <motion.p
            data-reveal
            initial={reduceMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.14, ease: [0.16, 1, 0.3, 1] }}
            className="mt-8 text-lg text-land-muted max-w-xl leading-relaxed"
          >
            Forge sends your prompt to a team of specialist agents — architecture, design, engineering,
            integration, and review — that plan, build, and validate a working app, then ship it to GitHub
            and deploy it as a container.
          </motion.p>

          <div className="mt-10 flex flex-col sm:flex-row gap-3" data-reveal>
            <motion.div {...presets.button}>
              <Link
                to="/signup"
                className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-md bg-land-ink text-land-paper text-sm font-medium hover:bg-land-ink/90 transition"
              >
                Start building — free <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            </motion.div>
            <motion.div {...presets.button}>
              <a
                href="#build-demo"
                className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-md text-sm font-medium text-land-muted hover:text-land-ink transition"
              >
                <Play className="w-4 h-4" aria-hidden="true" /> Watch the team work
              </a>
            </motion.div>
          </div>
        </motion.div>

        {/* Terminal-style build transcript */}
        <motion.div
          id="build-demo"
          data-hero-transcript
          initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-24 border border-land-border rounded-lg overflow-hidden max-w-4xl"
        >
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-land-border bg-land-muted-bg/30">
            <div className="flex gap-1.5" aria-hidden="true">
              <span className="w-2.5 h-2.5 rounded-full bg-land-border" />
              <span className="w-2.5 h-2.5 rounded-full bg-land-border" />
              <span className="w-2.5 h-2.5 rounded-full bg-land-border" />
            </div>
            <span className="font-mono text-xs text-land-muted ml-2">forge · build session</span>
            <span className="ml-auto text-[10px] uppercase tracking-wide text-land-muted/70">Simulated example</span>
          </div>
          <div className="p-6 font-mono text-sm space-y-2 leading-relaxed" role="group" aria-label="Simulated build transcript example">
            <div className="text-land-muted" data-line>
              $ forge build "Build a habit tracker with streaks and reminders."
            </div>
            {AGENTS.map((agent, i) => {
              const isDone = i < activeIndex;
              const isActive = i === activeIndex;
              const status = isDone ? "ok" : isActive ? "running" : "queued";
              const statusClass = isDone || isActive ? "text-land-accent" : "text-land-muted";
              return (
                <div key={agent.id} data-line>
                  <span className="text-land-ink">{agent.id.replace("_", " ")}</span>{"  "}
                  <span className="text-land-muted">{AGENT_STATUS_LINES[agent.id]}</span>{"  "}
                  <span className={statusClass}>→ {status}</span>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Problem ────────────────────────────────────────────────────────────────

function ProblemSection() {
  return (
    <Section id="problem">
      <SectionHead
        eyebrow="The problem"
        title={<>AI made it easy to start.<br />It did not make it easy to ship.</>}
        subtitle="Prompt-to-app tools get you a demo in an afternoon. Then reality arrives: broken auth, no tests, a schema you cannot explain, and code your team does not want to touch."
      />
      <div className="grid md:grid-cols-3 gap-px bg-land-border">
        {PROBLEM_POINTS.map((p) => (
          <motion.div key={p.title} data-reveal {...presets.card}>
            <div className="bg-land-paper p-8 h-full">
              <h3 className="font-display font-medium mb-2 text-land-ink">{p.title}</h3>
              <p className="text-sm text-land-muted leading-relaxed">{p.body}</p>
            </div>
          </motion.div>
        ))}
      </div>
      <p className="mt-10 font-display text-xl md:text-2xl text-land-ink max-w-2xl" data-reveal>
        You do not need faster typing. You need a team that knows what production means.
      </p>
    </Section>
  );
}

// ─── Solution ───────────────────────────────────────────────────────────────

function SolutionSection() {
  return (
    <Section id="solution">
      <SectionHead
        eyebrow="The solution"
        title={<>Forge runs the org.<br />You run the vision.</>}
        subtitle="Every build goes through the same discipline a real engineering team uses — product thinking, architecture, design, implementation, integration, and review — orchestrated automatically."
      />
      <p className="max-w-2xl text-land-muted leading-relaxed" data-reveal>
        You describe what you want. Forge assembles the right specialists, gives them shared context and a
        single source of truth for your project, and does not stop until the build passes its own quality bar.
        What ships is code you can read, deploy, and own.
      </p>
          <div className="mt-10" data-reveal>
            <motion.div {...presets.button} className="inline-block">
              <Link
                to="/signup"
                className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-md bg-land-ink text-land-paper text-sm font-medium hover:bg-land-ink/90 active:scale-[0.98] transition"
              >
                Start your first build <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            </motion.div>
            <p className="mt-3 text-xs text-land-muted">Average build: under 15 minutes.</p>
          </div>
    </Section>
  );
}

// ─── Agents ─────────────────────────────────────────────────────────────────

function Agents() {
  return (
    <Section id="agents">
      <SectionHead
        eyebrow="Multi-agent architecture"
        title={<>Meet the team behind every build.</>}
        subtitle="Each agent reads the same project memory and hands off automatically — no prompting required between steps."
      />
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-land-border">
        {AGENTS.map((agent) => {
          const Icon = agent.icon;
          return (
            <motion.div key={agent.id} data-reveal {...presets.card}>
              <div className="bg-land-paper p-8 h-full">
                <Icon className="w-5 h-5 mb-6 text-land-muted" strokeWidth={1.5} aria-hidden="true" />
                <h3 className="font-display font-medium mb-2 text-land-ink">{agent.label}</h3>
                <p className="text-sm text-land-muted leading-relaxed">{AGENT_DESCRIPTIONS[agent.id]}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </Section>
  );
}

// ─── Workflow ───────────────────────────────────────────────────────────────

function WorkflowSection() {
  return (
    <Section id="workflow">
      <SectionHead eyebrow="How it works" title="From prompt to production, one handoff at a time." />
      <div className="grid grid-cols-1 md:grid-cols-5 gap-px bg-land-border">
        {WORKFLOW_STEPS.map((s) => (
          <motion.div key={s.n} data-reveal {...presets.card}>
            <div className="bg-land-paper p-6 h-full">
              <div className="font-mono text-xs text-land-muted mb-6">{s.n}</div>
              <div className="font-display font-medium mb-1.5 text-land-ink">{s.t}</div>
              <div className="text-sm text-land-muted leading-relaxed">{s.d}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}

// ─── Features ───────────────────────────────────────────────────────────────

function FeaturesSection() {
  return (
    <Section id="features">
      <SectionHead eyebrow="Features" title="Built for real work." />
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-land-border">
        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <motion.div key={f.title} data-reveal {...presets.card}>
              <div className="bg-land-paper p-8 h-full">
                <Icon className="w-5 h-5 mb-5 text-land-muted" strokeWidth={1.5} aria-hidden="true" />
                <h3 className="font-display font-medium mb-2 text-land-ink">{f.title}</h3>
                <p className="text-sm text-land-muted leading-relaxed">{f.description}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </Section>
  );
}

// ─── Why Forge ──────────────────────────────────────────────────────────────

function WhyForgeSection() {
  return (
    <Section id="why">
      <SectionHead eyebrow="Why Forge" title="Because shipping is the point." />
      <ul className="space-y-6">
        {WHY_FORGE_LINES.map((line, i) => (
          <li
            key={line}
            data-reveal
            className={`font-display text-2xl md:text-3xl leading-snug tracking-tight ${
              i % 2 === 0 ? "text-land-ink" : "text-land-muted"
            }`}
          >
            {line}
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ─── Comparison ─────────────────────────────────────────────────────────────

function CompareMark({ value }: { value: CompareValue }) {
  if (value === "yes") return <Check className="w-4 h-4 text-land-accent inline" strokeWidth={2} aria-label="Yes" />;
  if (value === "partial") return <Minus className="w-4 h-4 text-land-muted inline" strokeWidth={2} aria-label="Partial" />;
  return <X className="w-4 h-4 text-land-muted/40 inline" strokeWidth={2} aria-label="No" />;
}

function ComparisonSection() {
  return (
    <Section id="compare">
      <SectionHead
        eyebrow="Comparison"
        title="Not another way to generate code."
        subtitle="Here is what changes when a team plans, builds, and reviews your software — instead of one model guessing at all of it."
      />
      <div className="overflow-x-auto" data-reveal>
        <table className="w-full text-sm border-collapse min-w-[640px]">
          <thead>
            <tr className="border-b border-land-border text-left">
              <th className="py-3 pr-4 font-normal text-land-muted">Capability</th>
              <th className="py-3 px-4 font-normal text-land-muted text-center">Prompt-to-app tools</th>
              <th className="py-3 px-4 font-normal text-land-muted text-center">AI pair programmers</th>
              <th className="py-3 px-4 font-normal text-land-muted text-center">Autonomous single agents</th>
              <th className="py-3 pl-4 font-medium text-land-ink text-center">Forge AI</th>
            </tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map((row) => (
              <tr key={row.capability} className="border-b border-land-border">
                <td className="py-4 pr-4 text-land-ink">{row.capability}</td>
                <td className="py-4 px-4 text-center"><CompareMark value={row.promptToApp} /></td>
                <td className="py-4 px-4 text-center"><CompareMark value={row.pairProgrammer} /></td>
                <td className="py-4 px-4 text-center"><CompareMark value={row.singleAgent} /></td>
                <td className="py-3 pl-4 text-center bg-land-muted-bg/40">
                  <Check className="w-4 h-4 text-land-accent inline" strokeWidth={2} aria-label="Yes" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-6 text-xs text-land-muted" data-reveal>We built this table to be fair. Judge it yourself.</p>
    </Section>
  );
}

// ─── Customer Benefits ──────────────────────────────────────────────────────

function CustomerBenefitsSection() {
  return (
    <Section id="benefits">
      <SectionHead eyebrow="Who it is for" title="Built for whoever has to ship." />
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-px bg-land-border">
        {SEGMENTS.map((s) => {
          const Icon = s.icon;
          return (
            <motion.div key={s.title} data-reveal {...presets.card}>
              <div className="bg-land-paper p-8 h-full">
                <Icon className="w-5 h-5 mb-5 text-land-muted" strokeWidth={1.5} aria-hidden="true" />
                <h3 className="font-display font-medium mb-2 text-land-ink">{s.title}</h3>
                <p className="text-sm text-land-muted leading-relaxed">{s.body}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </Section>
  );
}

// ─── Trust ───────────────────────────────────────────────────────────────────

function TrustSection() {
  const items = [
    { icon: Lock, label: "Encrypted data" },
    { icon: ShieldCheck, label: "SOC 2 in progress" },
    { icon: Globe, label: "GDPR compliant" },
    { icon: Zap, label: "99.9% uptime SLA" },
  ];
  return (
    <Section id="trust">
      <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
        {items.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-2 text-land-muted">
            <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
            <span className="text-xs font-medium tracking-wide uppercase">{label}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── Pricing ────────────────────────────────────────────────────────────────

function PricingSection() {
  return (
    <Section id="pricing">
      <SectionHead eyebrow="Pricing" title="Start free. Scale when it ships." subtitle="Credits cover agent work. A typical build runs about 13." />
      <div className="grid md:grid-cols-3 gap-px bg-land-border border border-land-border">
        {PRICING_PLANS.map((plan) => (
          <motion.div
            key={plan.name}
            data-reveal
            whileHover={{ y: -4, scale: plan.featured ? 1.02 : 1.0, transition: { type: "spring", stiffness: 300, damping: 22 } }}
            className={`bg-land-paper p-8 flex flex-col ${plan.featured ? "relative" : ""}`}
          >
            {plan.featured && <div className="absolute top-0 left-0 right-0 h-px bg-land-accent" aria-hidden="true" />}
            <h3 className="font-display font-medium text-land-ink">{plan.name}</h3>
            <div className="mt-6 flex items-baseline gap-2">
              <span className="font-display text-4xl font-medium tracking-tight text-land-ink">{plan.price}</span>
              <span className="text-sm text-land-muted">/mo</span>
            </div>
            <p className="text-xs text-land-muted mt-1">{plan.credits}</p>
            <p className="text-xs text-land-muted/80 mt-0.5 mb-6">{plan.blurb}</p>
            <motion.div {...presets.button}>
              <Link
                to="/signup"
                className={`w-full text-center py-2.5 rounded-md text-sm font-medium block transition ${
                  plan.featured
                    ? "bg-land-ink text-land-paper hover:bg-land-ink/90"
                    : "border border-land-border text-land-ink hover:bg-land-muted-bg"
                }`}
              >
                {plan.cta}
              </Link>
            </motion.div>
            <ul className="mt-8 space-y-3 text-sm">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-land-muted mt-0.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                  <span className="text-land-muted">{f}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}

// ─── FAQ ────────────────────────────────────────────────────────────────────

function FAQSection() {
  return (
    <Section>
      <div className="grid lg:grid-cols-[1fr_2fr] gap-16">
        <div>
          <Eyebrow>FAQ</Eyebrow>
          <h2 className="font-display text-4xl md:text-5xl font-medium leading-[1.05] tracking-tight text-land-ink">
            Questions, answered.
          </h2>
        </div>
        <dl>
          {FAQS.map((f) => (
            <div key={f.q} data-reveal className="border-b border-land-border py-5">
              <dt className="font-medium text-land-ink">{f.q}</dt>
              <dd className="text-land-muted leading-relaxed mt-2">{f.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}

// ─── Final CTA ──────────────────────────────────────────────────────────────

function FinalCTA() {
  const reduceMotion = useReducedMotion();
  return (
    <Section>
      <motion.div
        className="max-w-3xl"
        initial={reduceMotion ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        data-reveal
      >
        <h2 className="font-display text-5xl md:text-7xl font-medium tracking-tight leading-[1.02] text-land-ink">
          Your next app is
          <br />
          <span className="text-land-muted">one prompt away.</span>
        </h2>
        <p className="mt-5 text-land-muted">Free to start. No card. No setup.</p>
        <div className="mt-10">
          <motion.div {...presets.button}>
            <Link
              to="/signup"
              className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-md bg-land-ink text-land-paper text-sm font-medium hover:bg-land-ink/90 transition"
            >
              Start building free <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </motion.div>
        </div>
      </motion.div>
    </Section>
  );
}

// ─── Footer ─────────────────────────────────────────────────────────────────

export function Footer() {
  return (
    <footer className="border-t border-land-border py-16">
      <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <BrandLogo size="sm" />
          <span className="font-display font-medium text-land-ink">Forge</span>
          <span className="hidden sm:inline text-xs text-land-muted">The AI engineering organization.</span>
        </div>

        <nav aria-label="Footer" className="flex items-center gap-6 text-sm text-land-muted">
          <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-land-ink transition">
            <Github size={13} aria-hidden="true" /> GitHub
          </a>
        </nav>

        <p className="text-xs text-land-muted">© {new Date().getFullYear()} Forge</p>
      </div>
    </footer>
  );
}
