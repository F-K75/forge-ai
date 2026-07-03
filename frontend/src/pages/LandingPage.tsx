import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles,
  ArrowRight,
  Play,
  Check,
  Github,
  RefreshCw,
  BarChart3,
  Workflow as WorkflowIcon,
  KeyRound,
  Server,
} from "lucide-react";
import { AGENTS, type Agent } from "../lib/agents";

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
    <div className="max-w-2xl mb-16">
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
    <section id={id} className={`py-32 border-t border-land-border ${className}`}>
      <div className="max-w-6xl mx-auto px-6">{children}</div>
    </section>
  );
}

// ─── Agent descriptions for the "specialists" section — kept separate from
// the terminal's short fragments since a grid card reads better with a full
// sentence.
const AGENT_DESCRIPTIONS: Record<Agent["id"], string> = {
  architect: "Designs system topology, data models, and service boundaries.",
  business_improver: "Sanity-checks the plan against real business constraints.",
  designer: "Generates a real design system and UI, not gray boxes.",
  developer: "Writes the full stack, streaming every file as it goes.",
  integration: "Wires up Stripe, GitHub, and the other services your app needs.",
  pm: "Validates the build against the plan and scores quality.",
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
  { n: "01", t: "Describe", d: "Prompt Forge with what you want to build." },
  { n: "02", t: "Plan", d: "Architect drafts a typed blueprint and service graph." },
  { n: "03", t: "Build", d: "Designer and Developer ship the UI and backend in parallel." },
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
    title: "QA score on every build",
    description: "Every build ships with a quality score, so you know what you're deploying.",
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
];

interface PricingPlan {
  name: string;
  price: string;
  credits: string;
  features: string[];
  cta: string;
  featured?: boolean;
}

const PRICING_PLANS: PricingPlan[] = [
  {
    name: "Free",
    price: "$0",
    credits: "50 credits",
    features: ["1 project", "Community templates", "Public builds"],
    cta: "Start free",
  },
  {
    name: "Standard",
    price: "$29",
    credits: "100 credits / month",
    features: ["Unlimited projects", "Private builds", "GitHub sync"],
    cta: "Choose Standard",
  },
  {
    name: "Pro",
    price: "$99",
    credits: "500 credits / month",
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
    <div className="min-h-screen bg-land-paper text-land-ink antialiased font-sans">
      <Nav />
      <main>
        <Hero activeIndex={activeIndex} />
        <Agents />
        <WorkflowSection />
        <FeaturesSection />
        <PricingSection />
        <FAQSection />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}

// ─── Nav ────────────────────────────────────────────────────────────────────

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-land-paper/80 backdrop-blur border-b border-land-border" : "border-b border-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-6">
        <nav aria-label="Primary" className="flex items-center justify-between h-16">
          <a href="#top" className="flex items-center gap-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-land-accent">
            <div className="w-6 h-6 border border-land-ink flex items-center justify-center">
              <Sparkles className="w-3 h-3" aria-hidden="true" />
            </div>
            <span className="font-display font-medium tracking-tight">Forge</span>
          </a>

          <div className="hidden md:flex items-center gap-8 text-sm text-land-muted">
            <a href="#agents" className="hover:text-land-ink transition">Agents</a>
            <a href="#workflow" className="hover:text-land-ink transition">Workflow</a>
            <a href="#features" className="hover:text-land-ink transition">Features</a>
            <a href="#pricing" className="hover:text-land-ink transition">Pricing</a>
          </div>

          <div className="flex items-center gap-4">
            <Link to="/login" className="hidden sm:block text-sm text-land-muted hover:text-land-ink transition">
              Sign in
            </Link>
            <Link
              to="/signup"
              className="inline-flex items-center px-3.5 py-2 rounded-md text-sm font-medium bg-land-ink text-land-paper hover:bg-land-ink/90 transition"
            >
              Build with Forge
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}

// ─── Hero ───────────────────────────────────────────────────────────────────

function Hero({ activeIndex }: { activeIndex: number }) {
  return (
    <section id="top" className="pt-24 pb-32">
      <div className="max-w-6xl mx-auto px-6">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 text-xs text-land-muted mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-land-accent" aria-hidden="true" />
            Multi-agent build pipeline — now live
          </div>

          <h1 className="font-display text-5xl md:text-7xl font-medium leading-[1.02] tracking-tight">
            Ship production software.
            <br />
            <span className="text-land-muted">Powered by AI agents.</span>
          </h1>

          <p className="mt-8 text-lg text-land-muted max-w-xl leading-relaxed">
            Forge sends your prompt to a team of specialist agents that plan, design, build, wire up
            integrations, and validate a working app — then ship it to GitHub and deploy it as a container.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-3">
            <Link
              to="/signup"
              className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-md bg-land-ink text-land-paper text-sm font-medium hover:bg-land-ink/90 transition"
            >
              Build with Forge AI <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
            <a
              href="#build-demo"
              className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-md text-sm font-medium text-land-muted hover:text-land-ink transition"
            >
              <Play className="w-4 h-4" aria-hidden="true" /> Watch demo
            </a>
          </div>
        </div>

        {/* Terminal-style build transcript */}
        <div id="build-demo" className="mt-20 border border-land-border rounded-lg overflow-hidden max-w-4xl">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-land-border bg-land-muted-bg/30">
            <div className="flex gap-1.5" aria-hidden="true">
              <span className="w-2.5 h-2.5 rounded-full bg-land-border" />
              <span className="w-2.5 h-2.5 rounded-full bg-land-border" />
              <span className="w-2.5 h-2.5 rounded-full bg-land-border" />
            </div>
            <span className="font-mono text-xs text-land-muted ml-2">forge · build session</span>
          </div>
          <div className="p-6 font-mono text-sm space-y-2 leading-relaxed" role="group" aria-label="Live build transcript">
            <div className="text-land-muted">
              $ forge build "Build a habit tracker with streaks and reminders."
            </div>
            {AGENTS.map((agent, i) => {
              const isDone = i < activeIndex;
              const isActive = i === activeIndex;
              const status = isDone ? "ok" : isActive ? "running" : "queued";
              const statusClass = isDone || isActive ? "text-land-accent" : "text-land-muted";
              return (
                <div key={agent.id}>
                  <span className="text-land-ink">{agent.id.replace("_", " ")}</span>{"  "}
                  <span className="text-land-muted">{AGENT_STATUS_LINES[agent.id]}</span>{"  "}
                  <span className={statusClass}>→ {status}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Agents ─────────────────────────────────────────────────────────────────

function Agents() {
  return (
    <Section id="agents">
      <SectionHead
        eyebrow="Multi-agent architecture"
        title={<>Six specialists. One team.</>}
        subtitle="Each Forge agent is tuned for one part of the build and hands off to the next."
      />
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-land-border">
        {AGENTS.map((agent) => {
          const Icon = agent.icon;
          return (
            <div key={agent.id} className="bg-land-paper p-8">
              <Icon className="w-5 h-5 mb-6 text-land-muted" strokeWidth={1.5} aria-hidden="true" />
              <h3 className="font-display font-medium mb-2 text-land-ink">{agent.label}</h3>
              <p className="text-sm text-land-muted leading-relaxed">{AGENT_DESCRIPTIONS[agent.id]}</p>
            </div>
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
      <SectionHead eyebrow="Workflow" title="From prompt to production." />
      <div className="grid grid-cols-1 md:grid-cols-5 gap-px bg-land-border">
        {WORKFLOW_STEPS.map((s) => (
          <div key={s.n} className="bg-land-paper p-6">
            <div className="font-mono text-xs text-land-muted mb-6">{s.n}</div>
            <div className="font-display font-medium mb-1.5 text-land-ink">{s.t}</div>
            <div className="text-sm text-land-muted leading-relaxed">{s.d}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── Features ───────────────────────────────────────────────────────────────

function FeaturesSection() {
  return (
    <Section id="features">
      <SectionHead eyebrow="Features" title="Built to be trusted with real work." />
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-land-border">
        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <div key={f.title} className="bg-land-paper p-8">
              <Icon className="w-5 h-5 mb-5 text-land-muted" strokeWidth={1.5} aria-hidden="true" />
              <h3 className="font-display font-medium mb-2 text-land-ink">{f.title}</h3>
              <p className="text-sm text-land-muted leading-relaxed">{f.description}</p>
            </div>
          );
        })}
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
          <div key={plan.name} className={`bg-land-paper p-8 flex flex-col ${plan.featured ? "relative" : ""}`}>
            {plan.featured && <div className="absolute top-0 left-0 right-0 h-px bg-land-accent" aria-hidden="true" />}
            <h3 className="font-display font-medium text-land-ink">{plan.name}</h3>
            <div className="mt-6 flex items-baseline gap-2">
              <span className="font-display text-4xl font-medium tracking-tight text-land-ink">{plan.price}</span>
              <span className="text-sm text-land-muted">/mo</span>
            </div>
            <p className="text-xs text-land-muted mt-1 mb-6">{plan.credits}</p>
            <Link
              to="/signup"
              className={`w-full text-center py-2.5 rounded-md text-sm font-medium transition ${
                plan.featured
                  ? "bg-land-ink text-land-paper hover:bg-land-ink/90"
                  : "border border-land-border text-land-ink hover:bg-land-muted-bg"
              }`}
            >
              {plan.cta}
            </Link>
            <ul className="mt-8 space-y-3 text-sm">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-land-muted mt-0.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                  <span className="text-land-muted">{f}</span>
                </li>
              ))}
            </ul>
          </div>
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
            <div key={f.q} className="border-b border-land-border py-5">
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
  return (
    <Section>
      <div className="max-w-3xl">
        <h2 className="font-display text-5xl md:text-7xl font-medium tracking-tight leading-[1.02] text-land-ink">
          Your next app is
          <br />
          <span className="text-land-muted">one prompt away.</span>
        </h2>
        <p className="mt-5 text-land-muted">Free to start. No card. No setup.</p>
        <div className="mt-10">
          <Link
            to="/signup"
            className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-md bg-land-ink text-land-paper text-sm font-medium hover:bg-land-ink/90 transition"
          >
            Start building free <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </Section>
  );
}

// ─── Footer ─────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-land-border py-16">
      <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 border border-land-ink flex items-center justify-center">
            <Sparkles className="w-3 h-3" aria-hidden="true" />
          </div>
          <span className="font-display font-medium text-land-ink">Forge</span>
        </div>

        <nav aria-label="Footer" className="flex items-center gap-6 text-sm text-land-muted">
          <a href="#" className="hover:text-land-ink transition">Docs</a>
          <a href="#" className="hover:text-land-ink transition">Privacy</a>
          <a href="#" className="hover:text-land-ink transition inline-flex items-center gap-1.5">
            <Github size={13} aria-hidden="true" /> GitHub
          </a>
        </nav>

        <p className="text-xs text-land-muted">© {new Date().getFullYear()} Forge</p>
      </div>
    </footer>
  );
}
