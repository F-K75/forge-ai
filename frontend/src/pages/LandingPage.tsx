import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Hammer,
  ArrowRight,
  Play,
  Check,
  Star,
  Github,
  Server,
  RefreshCw,
  BarChart3,
  Workflow,
  KeyRound,
  Compass,
  Palette,
  Code2,
  Plug,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

// ─── Agent data (single source of truth for this page) ────────────────────────

interface Agent {
  id: "architect" | "designer" | "developer" | "integration" | "pm";
  label: string;
  icon: LucideIcon;
  line: string;
}

const AGENTS: Agent[] = [
  { id: "architect", label: "Architect", icon: Compass, line: "Turns your prompt into a typed blueprint." },
  { id: "designer", label: "Designer", icon: Palette, line: "Generates a real design system, not gray boxes." },
  { id: "developer", label: "Developer", icon: Code2, line: "Writes the full stack, streaming every file." },
  { id: "integration", label: "Integration", icon: Plug, line: "Wires up Stripe, Slack, auth, and more." },
  { id: "pm", label: "PM", icon: ShieldCheck, line: "Validates the build and scores quality." },
];

// Per-agent Tailwind classes as whole literal strings — the JIT scanner
// reads source text directly, so a template literal like `bg-land-${id}`
// would never be picked up at build time.
interface AgentTokens {
  fill: string;
  tint: string;
  text: string;
}

const AGENT_TOKENS: Record<Agent["id"], AgentTokens> = {
  architect: { fill: "bg-land-architect", tint: "bg-land-architect-tint", text: "text-land-architect" },
  designer: { fill: "bg-land-designer", tint: "bg-land-designer-tint", text: "text-land-designer" },
  developer: { fill: "bg-land-developer", tint: "bg-land-developer-tint", text: "text-land-developer" },
  integration: { fill: "bg-land-integration", tint: "bg-land-integration-tint", text: "text-land-integration" },
  pm: { fill: "bg-land-pm", tint: "bg-land-pm-tint", text: "text-land-pm" },
};

const AGENT_CYCLE_MS = 1600;

// ─── Reduced motion + agent auto-cycle ─────────────────────────────────────────

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => setReduced(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

function useAgentCycle() {
  const reducedMotion = usePrefersReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (reducedMotion) {
      setActiveIndex(0);
      return;
    }
    const id = window.setInterval(() => {
      setActiveIndex((i) => (i + 1) % AGENTS.length);
    }, AGENT_CYCLE_MS);
    return () => window.clearInterval(id);
  }, [reducedMotion]);

  return { activeIndex, setActiveIndex };
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const { activeIndex, setActiveIndex } = useAgentCycle();

  return (
    <div className="min-h-screen bg-land-paper text-land-ink antialiased">
      <Nav />
      <main>
        <Hero activeIndex={activeIndex} setActiveIndex={setActiveIndex} />
        <Pipeline activeIndex={activeIndex} />
        <Features />
        <Testimonial />
        <Pricing />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}

// ─── Nav ────────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <nav
      aria-label="Primary"
      className="sticky top-0 z-50 backdrop-blur bg-land-paper/80 border-b border-land-border"
    >
      <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
        <a
          href="#top"
          className="flex items-center gap-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-land-accent"
        >
          <span className="w-8 h-8 rounded-lg bg-land-accent flex items-center justify-center shrink-0">
            <Hammer size={15} className="text-white" aria-hidden="true" />
          </span>
          <span className="font-semibold text-land-ink">Forge</span>
        </a>

        <div className="hidden md:flex items-center gap-8 text-sm text-land-muted">
          <a
            href="#pipeline"
            className="hover:text-land-ink transition motion-reduce:transition-none rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-land-accent"
          >
            How it works
          </a>
          <a
            href="#pricing"
            className="hover:text-land-ink transition motion-reduce:transition-none rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-land-accent"
          >
            Pricing
          </a>
          <a
            href="#"
            className="hover:text-land-ink transition motion-reduce:transition-none rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-land-accent"
          >
            Docs
          </a>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="px-3 py-2 rounded-lg text-sm text-land-ink hover:bg-land-border-soft transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-land-accent"
          >
            Sign in
          </Link>
          <Link
            to="/login"
            className="px-3.5 py-2 rounded-lg text-sm font-medium bg-land-accent text-white hover:opacity-90 transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-land-accent"
          >
            Start building
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ─── Hero ───────────────────────────────────────────────────────────────────────

function Hero({
  activeIndex,
  setActiveIndex,
}: {
  activeIndex: number;
  setActiveIndex: (i: number) => void;
}) {
  return (
    <section id="top" className="px-4 md:px-6 pt-16 pb-20 md:pt-24 md:pb-28">
      <div className="max-w-3xl mx-auto text-center">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-land-accent-soft text-land-accent text-xs font-medium mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-land-live" aria-hidden="true" />
          Five agents. One prompt. A full app.
        </span>

        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05] mb-5">
          Describe your app.
          <br />
          <span className="text-land-accent">Watch a team build it.</span>
        </h1>

        <p className="text-base md:text-lg text-land-muted max-w-xl mx-auto mb-8">
          Forge sends your prompt to five specialist agents that plan, design, build, wire up,
          and validate a working app — while you watch it happen.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-10">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-land-accent text-white text-sm font-medium hover:opacity-90 transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-land-accent"
          >
            Start building free
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
          <a
            href="#build-demo"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-land-border text-land-ink text-sm font-medium hover:bg-land-border-soft transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-land-accent"
          >
            <Play size={14} aria-hidden="true" />
            Watch a build
          </a>
        </div>
      </div>

      {/* Mock build window */}
      <div id="build-demo" className="max-w-2xl mx-auto">
        <div className="rounded-2xl border border-land-border bg-land-surface shadow-[0_8px_30px_rgba(20,20,30,0.06)] overflow-hidden">
          <div className="flex items-center gap-2 px-4 h-10 border-b border-land-border">
            <div className="flex items-center gap-1.5" aria-hidden="true">
              <span className="w-2 h-2 rounded-full bg-land-border" />
              <span className="w-2 h-2 rounded-full bg-land-border" />
              <span className="w-2 h-2 rounded-full bg-land-border" />
            </div>
            <span className="flex-1 text-center font-mono text-[11px] text-land-faint">forge.dev/build</span>
          </div>

          <div className="p-5">
            <div className="inline-block max-w-[85%] rounded-xl rounded-tl-sm bg-land-accent-soft text-land-ink text-sm px-3.5 py-2.5 mb-5">
              Build a habit tracker with streaks and reminders.
            </div>

            <div className="grid grid-cols-5 gap-2" role="group" aria-label="Pipeline agents">
              {AGENTS.map((agent, i) => {
                const tokens = AGENT_TOKENS[agent.id];
                const Icon = agent.icon;
                const isActive = i === activeIndex;
                const isDone = i < activeIndex;
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => setActiveIndex(i)}
                    aria-pressed={isActive}
                    aria-label={`${agent.label}${isActive ? " — active" : isDone ? " — done" : ""}`}
                    className={[
                      "flex flex-col items-center gap-1.5 rounded-lg py-2.5 px-1 transition-colors motion-reduce:transition-none",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-land-accent",
                      isActive ? tokens.tint : "",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "w-7 h-7 rounded-lg flex items-center justify-center",
                        isActive ? tokens.fill : isDone ? tokens.tint : "bg-land-border-soft",
                      ].join(" ")}
                    >
                      {isDone ? (
                        <Check size={13} className={tokens.text} aria-hidden="true" />
                      ) : (
                        <Icon size={13} className={isActive ? "text-white" : "text-land-faint"} aria-hidden="true" />
                      )}
                    </span>
                    <span
                      className={[
                        "text-[10px] font-medium",
                        isActive ? tokens.text : isDone ? "text-land-muted" : "text-land-faint",
                      ].join(" ")}
                    >
                      {agent.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <p className="flex flex-wrap items-center justify-center gap-1.5 text-center text-xs text-land-faint mt-5">
          <Github size={12} aria-hidden="true" />
          Syncs to GitHub
          <span aria-hidden="true">·</span>
          <Server size={12} aria-hidden="true" />
          Containerized deploy
          <span aria-hidden="true">·</span>
          No setup
        </p>
      </div>
    </section>
  );
}

// ─── Pipeline ───────────────────────────────────────────────────────────────────

function Pipeline({ activeIndex }: { activeIndex: number }) {
  return (
    <section id="pipeline" className="px-4 md:px-6 py-20 md:py-24">
      <div className="max-w-3xl mx-auto">
        <p className="text-xs font-semibold tracking-wider text-land-accent uppercase mb-3">The pipeline</p>
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-10">
          Five specialists, not one generalist
        </h2>

        <ol className="divide-y divide-land-border-soft">
          {AGENTS.map((agent, i) => {
            const tokens = AGENT_TOKENS[agent.id];
            const Icon = agent.icon;
            const isActive = i === activeIndex;
            return (
              <li
                key={agent.id}
                className={[
                  "flex items-center gap-4 rounded-xl px-4 py-4 transition-colors motion-reduce:transition-none",
                  isActive ? tokens.tint : "",
                ].join(" ")}
              >
                <span className="font-mono text-xs tabular-nums text-land-faint w-6 shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className={["w-9 h-9 rounded-lg flex items-center justify-center shrink-0", tokens.tint].join(" ")}
                >
                  <Icon size={16} className={tokens.text} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium text-land-ink">{agent.label}</p>
                    {isActive && (
                      <span
                        className={[
                          "text-[10px] font-medium px-2 py-0.5 rounded-full",
                          tokens.tint,
                          tokens.text,
                        ].join(" ")}
                      >
                        running
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-land-muted truncate">{agent.line}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

// ─── Features ───────────────────────────────────────────────────────────────────

interface Feature {
  title: string;
  description: string;
  icon: LucideIcon;
  tone: Agent["id"];
}

const FEATURES: Feature[] = [
  {
    title: "Self-correcting debug loop",
    description: "Reruns the responsible agent automatically, up to three times, until the build passes validation.",
    icon: RefreshCw,
    tone: "developer",
  },
  {
    title: "QA score on every build",
    description: "Every build ships with a quality score, so you know what you're deploying.",
    icon: BarChart3,
    tone: "pm",
  },
  {
    title: "Real stack, Docker deploy",
    description: "Production-grade code on a real stack, containerized and ready to deploy.",
    icon: Server,
    tone: "architect",
  },
  {
    title: "Playbook integrations",
    description: "Stripe, Slack, and other services get wired in automatically when your app needs them.",
    icon: Workflow,
    tone: "integration",
  },
  {
    title: "GitHub sync",
    description: "Every build pushes to a connected repo, so your code lives where your team already works.",
    icon: Github,
    tone: "designer",
  },
  {
    title: "Bring your own key",
    description: "Use your own model key on the Pro plan for full control over usage and cost.",
    icon: KeyRound,
    tone: "architect",
  },
];

function Features() {
  return (
    <section className="bg-land-surface border-y border-land-border px-4 md:px-6 py-20 md:py-24">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-center mb-12">
          Built to be trusted with real work.
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {FEATURES.map((f) => {
            const tokens = AGENT_TOKENS[f.tone];
            const Icon = f.icon;
            return (
              <div key={f.title} className="rounded-xl border border-land-border-soft p-5">
                <span
                  className={["w-9 h-9 rounded-lg flex items-center justify-center mb-4", tokens.tint].join(" ")}
                >
                  <Icon size={16} className={tokens.text} aria-hidden="true" />
                </span>
                <p className="text-sm font-medium text-land-ink mb-1.5">{f.title}</p>
                <p className="text-sm text-land-muted leading-relaxed">{f.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Testimonial ────────────────────────────────────────────────────────────────

function Testimonial() {
  return (
    <section className="px-4 md:px-6 py-20 md:py-24">
      <div className="max-w-2xl mx-auto text-center">
        <div className="flex items-center justify-center gap-1 mb-6" aria-label="5 out of 5 stars">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} size={16} className="fill-land-integration text-land-integration" aria-hidden="true" />
          ))}
        </div>

        <p className="text-xl md:text-2xl font-medium tracking-tight text-land-ink mb-8">
          "Forge took a Tuesday-afternoon idea and had a working app, tests included, by the time I'd finished my
          coffee."
        </p>

        <div className="flex items-center justify-center gap-3">
          <span className="w-9 h-9 rounded-full bg-land-accent flex items-center justify-center text-white text-xs font-semibold">
            R
          </span>
          <div className="text-left">
            <p className="text-sm font-medium text-land-ink">Renee Okafor</p>
            <p className="text-xs text-land-muted">Founder, Loop Habits</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Pricing ────────────────────────────────────────────────────────────────────

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
    credits: "10 credits",
    features: ["1 project", "Community templates", "Public builds"],
    cta: "Start free",
  },
  {
    name: "Pro",
    price: "$60",
    credits: "750 credits / month",
    features: ["1M context window", "Bring your own key", "GitHub sync", "Marketplace publishing"],
    cta: "Start building",
    featured: true,
  },
  {
    name: "Standard",
    price: "$20",
    credits: "100 credits / month",
    features: ["Unlimited projects", "Private builds", "GitHub sync"],
    cta: "Choose Standard",
  },
];

function Pricing() {
  return (
    <section id="pricing" className="px-4 md:px-6 py-20 md:py-24">
      <div className="max-w-5xl mx-auto text-center mb-12">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">Start free. Scale when it ships.</h2>
        <p className="text-sm text-land-muted">Credits cover agent work. A typical build runs about 13.</p>
      </div>

      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {PRICING_PLANS.map((plan) => (
          <PricingCard key={plan.name} plan={plan} />
        ))}
      </div>
    </section>
  );
}

function PricingCard({ plan }: { plan: PricingPlan }) {
  if (plan.featured) {
    return (
      <div className="rounded-2xl bg-land-accent text-white p-6 shadow-[0_12px_32px_rgba(79,70,229,0.25)] md:-translate-y-2">
        <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/15 mb-4">
          Most popular
        </span>
        <p className="text-base font-medium mb-1">{plan.name}</p>
        <p className="text-3xl font-semibold tracking-tight mb-0.5">
          {plan.price}
          <span className="text-sm font-normal text-white/70">/mo</span>
        </p>
        <p className="text-xs text-white/70 mb-5">{plan.credits}</p>
        <ul className="space-y-2.5 mb-6">
          {plan.features.map((f) => (
            <li key={f} className="flex items-center gap-2 text-sm">
              <Check size={14} className="shrink-0" aria-hidden="true" />
              {f}
            </li>
          ))}
        </ul>
        <Link
          to="/login"
          className="block text-center px-4 py-2.5 rounded-lg bg-white text-land-accent text-sm font-medium hover:bg-white/90 transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {plan.cta}
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-land-border bg-land-surface p-6">
      <p className="text-base font-medium text-land-ink mb-1">{plan.name}</p>
      <p className="text-3xl font-semibold tracking-tight text-land-ink mb-0.5">
        {plan.price}
        <span className="text-sm font-normal text-land-faint">/mo</span>
      </p>
      <p className="text-xs text-land-faint mb-5">{plan.credits}</p>
      <ul className="space-y-2.5 mb-6">
        {plan.features.map((f) => (
          <li key={f} className="flex items-center gap-2 text-sm text-land-muted">
            <Check size={14} className="shrink-0 text-land-accent" aria-hidden="true" />
            {f}
          </li>
        ))}
      </ul>
      <Link
        to="/login"
        className="block text-center px-4 py-2.5 rounded-lg border border-land-border text-land-ink text-sm font-medium hover:bg-land-border-soft transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-land-accent"
      >
        {plan.cta}
      </Link>
    </div>
  );
}

// ─── Closing CTA ────────────────────────────────────────────────────────────────

function Cta() {
  return (
    <section className="bg-land-accent-soft px-4 md:px-6 py-16 md:py-20">
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-land-ink mb-2">
          Your next app is one prompt away
        </h2>
        <p className="text-sm text-land-muted mb-7">Free to start. No card. No setup.</p>
        <Link
          to="/login"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-land-accent text-white text-sm font-medium hover:opacity-90 transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-land-accent"
        >
          Start building free
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

// ─── Footer ─────────────────────────────────────────────────────────────────────

function FooterLink({ children, href = "#" }: { children: ReactNode; href?: string }) {
  return (
    <a
      href={href}
      className="text-sm text-land-muted hover:text-land-ink transition motion-reduce:transition-none rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-land-accent"
    >
      {children}
    </a>
  );
}

function Footer() {
  return (
    <footer className="bg-land-paper border-t border-land-border px-4 md:px-6 py-10">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-land-accent flex items-center justify-center shrink-0">
            <Hammer size={11} className="text-white" aria-hidden="true" />
          </span>
          <span className="text-sm font-medium text-land-ink">Forge</span>
        </div>

        <nav aria-label="Footer" className="flex items-center gap-6">
          <FooterLink>Docs</FooterLink>
          <FooterLink>Privacy</FooterLink>
          <FooterLink>
            <span className="inline-flex items-center gap-1.5">
              <Github size={13} aria-hidden="true" />
              GitHub
            </span>
          </FooterLink>
        </nav>

        <p className="text-xs text-land-faint">© 2026 Forge</p>
      </div>
    </footer>
  );
}
