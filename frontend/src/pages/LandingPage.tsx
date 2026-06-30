import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Hammer,
  ArrowRight,
  Play,
  Check,
  Star,
  Github,
  RefreshCw,
  BarChart3,
  Server,
  Workflow,
  KeyRound,
} from "lucide-react";
import { AGENTS, type Agent } from "../lib/agents";

// ─── Local light palette (this page only — independent of the app's dark tokens) ──

const L = {
  paper: "#FBFBFA",
  surface: "#FFFFFF",
  border: "#E7E7E2",
  borderSoft: "#F1F1ED",
  ink: "#1B1B1F",
  muted: "#71717A",
  faint: "#A8A8AD",
  accent: "#4F46E5",
  accentSoft: "#EEEDFB",
  live: "#3F6212",
  ochre: "#C08A3E",
};

const AGENT_TINT: Record<Agent["id"], { color: string; tint: string }> = {
  architect: { color: "#5B6CB8", tint: "#EEF0F8" },
  designer: { color: "#9A6BAE", tint: "#F4EEF6" },
  developer: { color: "#3E8C9B", tint: "#EAF3F4" },
  integration: { color: "#C08A3E", tint: "#F7F0E6" },
  pm: { color: "#5E8C57", tint: "#EDF3EB" },
};

const AGENT_COPY: Record<Agent["id"], string> = {
  architect: "Maps your prompt into a project plan — pages, data model, and the agents needed to build it.",
  designer: "Lays out the UI: layout, type scale, and a component system that matches your brief.",
  developer: "Writes the application code — components, routes, and business logic, file by file.",
  integration: "Wires up the stack: APIs, auth, and any third-party services your app needs.",
  pm: "Validates the build, scores it for quality, and reports back what shipped.",
};

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
    }, 1600);
    return () => window.clearInterval(id);
  }, [reducedMotion]);

  return { activeIndex, setActiveIndex, reducedMotion };
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const { activeIndex, setActiveIndex } = useAgentCycle();

  return (
    <div className="min-h-screen bg-[#FBFBFA] text-[#1B1B1F] antialiased">
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
      className="sticky top-0 z-50 backdrop-blur bg-[#FBFBFA]/80 border-b border-[#E7E7E2]"
    >
      <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
        <a href="#top" className="flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5] rounded-lg">
          <span className="w-8 h-8 rounded-lg bg-[#4F46E5] flex items-center justify-center shrink-0">
            <Hammer size={15} className="text-white" aria-hidden="true" />
          </span>
          <span className="font-semibold text-[#1B1B1F]">Forge</span>
        </a>

        <div className="hidden md:flex items-center gap-8 text-sm text-[#71717A]">
          <a href="#pipeline" className="hover:text-[#1B1B1F] transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5] rounded">
            How it works
          </a>
          <a href="#pricing" className="hover:text-[#1B1B1F] transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5] rounded">
            Pricing
          </a>
          <a href="#" className="hover:text-[#1B1B1F] transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5] rounded">
            Docs
          </a>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="px-3 py-2 rounded-lg text-sm text-[#1B1B1F] hover:bg-[#F1F1ED] transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]"
          >
            Sign in
          </Link>
          <Link
            to="/signup"
            className="px-3.5 py-2 rounded-lg text-sm font-medium bg-[#4F46E5] text-white hover:bg-[#4338CA] transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]"
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
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EEEDFB] text-[#4F46E5] text-xs font-medium mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-[#3F6212]" aria-hidden="true" />
          Five agents. One prompt. A full app.
        </span>

        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.1] mb-5">
          Describe your app.
          <br />
          <span className="text-[#4F46E5]">Watch a team build it.</span>
        </h1>

        <p className="text-base md:text-lg text-[#71717A] max-w-xl mx-auto mb-8">
          Forge sends your prompt to five specialist agents that plan, design, build, wire up,
          and validate a working app — while you watch it happen.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-10">
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#4F46E5] text-white text-sm font-medium hover:bg-[#4338CA] transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]"
          >
            Start building free
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
          <a
            href="#build-demo"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-[#E7E7E2] text-[#1B1B1F] text-sm font-medium hover:bg-[#F1F1ED] transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]"
          >
            <Play size={14} aria-hidden="true" />
            Watch a build
          </a>
        </div>
      </div>

      {/* Mock build window */}
      <div id="build-demo" className="max-w-2xl mx-auto">
        <div className="rounded-2xl border border-[#E7E7E2] bg-white shadow-[0_8px_30px_rgba(20,20,30,0.06)] overflow-hidden">
          <div className="flex items-center gap-2 px-4 h-10 border-b border-[#E7E7E2]">
            <div className="flex items-center gap-1.5" aria-hidden="true">
              <span className="w-2 h-2 rounded-full bg-[#E7E7E2]" />
              <span className="w-2 h-2 rounded-full bg-[#E7E7E2]" />
              <span className="w-2 h-2 rounded-full bg-[#E7E7E2]" />
            </div>
            <span className="flex-1 text-center font-mono text-[11px] text-[#A8A8AD]">forge.dev/build</span>
          </div>

          <div className="p-5">
            <div className="inline-block max-w-[85%] rounded-xl rounded-tl-sm bg-[#EEEDFB] text-[#1B1B1F] text-sm px-3.5 py-2.5 mb-5">
              Build a habit tracker with streaks and reminders.
            </div>

            <div className="grid grid-cols-5 gap-2" role="group" aria-label="Pipeline agents">
              {AGENTS.map((agent, i) => {
                const tone = AGENT_TINT[agent.id];
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
                    className="flex flex-col items-center gap-1.5 rounded-lg py-2.5 px-1 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]"
                    style={{
                      backgroundColor: isActive ? tone.tint : "transparent",
                    }}
                  >
                    <span
                      className="w-7 h-7 rounded-lg flex items-center justify-center"
                      style={{
                        backgroundColor: isActive || isDone ? tone.tint : L.borderSoft,
                      }}
                    >
                      {isDone ? (
                        <Check size={13} style={{ color: tone.color }} aria-hidden="true" />
                      ) : (
                        <Icon size={13} style={{ color: isActive ? tone.color : L.faint }} aria-hidden="true" />
                      )}
                    </span>
                    <span
                      className="text-[10px] font-medium"
                      style={{ color: isActive ? tone.color : isDone ? L.muted : L.faint }}
                    >
                      {agent.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-[#A8A8AD] mt-5">
          Syncs to GitHub · Containerized deploy · No setup
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
        <p className="text-xs font-semibold tracking-wider text-[#4F46E5] uppercase mb-3">
          The pipeline
        </p>
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-10">
          Five specialists, not one generalist
        </h2>

        <ol className="space-y-2">
          {AGENTS.map((agent, i) => {
            const tone = AGENT_TINT[agent.id];
            const Icon = agent.icon;
            const isActive = i === activeIndex;
            return (
              <li
                key={agent.id}
                className="flex items-center gap-4 rounded-xl px-4 py-4 transition-colors motion-reduce:transition-none"
                style={{ backgroundColor: isActive ? tone.tint : "transparent" }}
              >
                <span className="font-mono text-xs text-[#A8A8AD] w-6 shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: tone.tint }}
                >
                  <Icon size={16} style={{ color: tone.color }} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium text-[#1B1B1F]">{agent.label}</p>
                    {isActive && (
                      <span
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: tone.tint, color: tone.color }}
                      >
                        running
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[#71717A] truncate">{AGENT_COPY[agent.id]}</p>
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
  icon: typeof RefreshCw;
  tone: Agent["id"];
}

const FEATURES: Feature[] = [
  {
    title: "Self-correcting debug loop",
    description: "Failed builds retry automatically, up to three times, until validation passes.",
    icon: RefreshCw,
    tone: "developer",
  },
  {
    title: "QA score per build",
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
    description: "Stripe, Slack, and other common services get wired in automatically when your app needs them.",
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
    <section className="bg-white border-y border-[#E7E7E2] px-4 md:px-6 py-20 md:py-24">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-center mb-12">
          Built to be trusted with real work.
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {FEATURES.map((f) => {
            const tone = AGENT_TINT[f.tone];
            const Icon = f.icon;
            return (
              <div key={f.title} className="rounded-xl border border-[#F1F1ED] p-5">
                <span
                  className="w-9 h-9 rounded-lg flex items-center justify-center mb-4"
                  style={{ backgroundColor: tone.tint }}
                >
                  <Icon size={16} style={{ color: tone.color }} aria-hidden="true" />
                </span>
                <p className="text-sm font-medium text-[#1B1B1F] mb-1.5">{f.title}</p>
                <p className="text-sm text-[#71717A] leading-relaxed">{f.description}</p>
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
            <Star key={i} size={16} fill={L.ochre} className="text-transparent" style={{ color: L.ochre }} aria-hidden="true" />
          ))}
        </div>

        <p className="text-xl md:text-2xl font-medium tracking-tight text-[#1B1B1F] mb-8">
          "Forge took a Tuesday-afternoon idea and had a working app, tests included, by the time
          I'd finished my coffee."
        </p>

        <div className="flex items-center justify-center gap-3">
          <span className="w-9 h-9 rounded-full bg-[#4F46E5] flex items-center justify-center text-white text-xs font-semibold">
            R
          </span>
          <div className="text-left">
            <p className="text-sm font-medium text-[#1B1B1F]">Renee Okafor</p>
            <p className="text-xs text-[#71717A]">Founder, Loop Habits</p>
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
    features: ["1M context window", "Bring your own key", "Priority builds", "Marketplace publishing"],
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
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3">
          Start free. Scale when it ships.
        </h2>
        <p className="text-sm text-[#71717A]">
          Credits cover agent work. A typical build runs about 13.
        </p>
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
      <div className="rounded-2xl bg-[#4F46E5] text-white p-6 shadow-[0_12px_32px_rgba(79,70,229,0.25)] md:-translate-y-2">
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
          to="/signup"
          className="block text-center px-4 py-2.5 rounded-lg bg-white text-[#4F46E5] text-sm font-medium hover:bg-white/90 transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {plan.cta}
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#E7E7E2] bg-white p-6">
      <p className="text-base font-medium text-[#1B1B1F] mb-1">{plan.name}</p>
      <p className="text-3xl font-semibold tracking-tight text-[#1B1B1F] mb-0.5">
        {plan.price}
        <span className="text-sm font-normal text-[#A8A8AD]">/mo</span>
      </p>
      <p className="text-xs text-[#A8A8AD] mb-5">{plan.credits}</p>
      <ul className="space-y-2.5 mb-6">
        {plan.features.map((f) => (
          <li key={f} className="flex items-center gap-2 text-sm text-[#71717A]">
            <Check size={14} className="shrink-0 text-[#4F46E5]" aria-hidden="true" />
            {f}
          </li>
        ))}
      </ul>
      <Link
        to="/signup"
        className="block text-center px-4 py-2.5 rounded-lg border border-[#E7E7E2] text-[#1B1B1F] text-sm font-medium hover:bg-[#F1F1ED] transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]"
      >
        {plan.cta}
      </Link>
    </div>
  );
}

// ─── Closing CTA ────────────────────────────────────────────────────────────────

function Cta() {
  return (
    <section className="bg-[#EEEDFB] px-4 md:px-6 py-16 md:py-20">
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-[#1B1B1F] mb-2">
          Your next app is one prompt away
        </h2>
        <p className="text-sm text-[#71717A] mb-7">Free to start. No card. No setup.</p>
        <Link
          to="/signup"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#4F46E5] text-white text-sm font-medium hover:bg-[#4338CA] transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]"
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
      className="text-sm text-[#71717A] hover:text-[#1B1B1F] transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5] rounded"
    >
      {children}
    </a>
  );
}

function Footer() {
  return (
    <footer className="bg-[#FBFBFA] border-t border-[#E7E7E2] px-4 md:px-6 py-10">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-[#4F46E5] flex items-center justify-center shrink-0">
            <Hammer size={11} className="text-white" aria-hidden="true" />
          </span>
          <span className="text-sm font-medium text-[#1B1B1F]">Forge</span>
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

        <p className="text-xs text-[#A8A8AD]">© 2026 Forge</p>
      </div>
    </footer>
  );
}
