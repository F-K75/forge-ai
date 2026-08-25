import { useEffect, useState, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Check,
  X,
  Minus,
  Github,
  ArrowUpRight,
} from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { AGENTS, type Agent } from "../lib/agents";
import { presets } from "../lib/animationPresets";

// ─── Animation wrapper ─────────────────────────────────────────────────────

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
      initial={reduceMotion ? false : { opacity: 0, y: 32 }}
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={{
        hidden: { opacity: 0, y: 32 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1], delay },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

// ─── Layout primitives ──────────────────────────────────────────────────────

function Section({
  id,
  children,
  className = "",
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`px-6 md:px-12 lg:px-20 ${className}`}
    >
      <div className="max-w-[1200px] mx-auto">{children}</div>
    </section>
  );
}

// ─── Content data ───────────────────────────────────────────────────────────

const AGENT_DESCRIPTIONS: Record<Agent["id"], string> = {
  architect:
    "Defines the system: data models, service boundaries, and how services communicate.",
  business_improver:
    "Validates the plan against real-world constraints and unit economics.",
  designer:
    "Produces a complete design system and UI — not wireframes, not placeholders.",
  developer:
    "Writes the full stack, streaming each file as it is created.",
  integration:
    "Connects Stripe, auth, and other services your app needs — automatically.",
  pm: "Evaluates the build against the plan and blocks anything below the quality bar.",
};

const WORKFLOW_STEPS = [
  {
    n: "01",
    t: "Describe",
    d: "Tell Forge what you want to build, in plain English.",
  },
  {
    n: "02",
    t: "Plan",
    d: "The architect drafts a typed blueprint and service graph.",
  },
  {
    n: "03",
    t: "Build",
    d: "Designer and developer ship the UI and backend in parallel.",
  },
  {
    n: "04",
    t: "Validate",
    d: "PM scores the build; a debug loop retries failures automatically.",
  },
  {
    n: "05",
    t: "Ship",
    d: "Every build syncs to GitHub and deploys as a container.",
  },
];

const FEATURES = [
  {
    title: "Self-correcting debug loop",
    description:
      "Reruns the responsible agent automatically, up to three times, until the build passes validation.",
  },
  {
    title: "Shared project memory",
    description:
      "Every agent reads and writes to the same project state, so context never gets lost between handoffs.",
  },
  {
    title: "Quality score on every build",
    description:
      "Every build ships with a quality score, so you know what you are deploying.",
  },
  {
    title: "Real stack, Docker deploy",
    description:
      "Production-grade code on a real stack, containerized and ready to deploy.",
  },
  {
    title: "Playbook integrations",
    description:
      "Stripe, Slack, and other services get wired in automatically when your app needs them.",
  },
  {
    title: "GitHub sync",
    description:
      "Every build pushes to a connected repo, so your code lives where your team already works.",
  },
];

const WHY_FORGE_LINES = [
  "Other tools generate code.",
  "Forge builds software.",
  "",
  "Other tools show you a demo.",
  "Forge ships you a deploy.",
  "",
  "Other tools guess what you meant.",
  "Forge's agents ask, plan, and validate.",
  "",
  "Other tools lock you into their sandbox.",
  "Forge hands you the repo.",
  "",
  "Other tools are one model pretending to be a team.",
  "Forge is a team.",
];

type CompareValue = "yes" | "no" | "partial";

interface CompareRow {
  capability: string;
  promptToApp: CompareValue;
  pairProgrammer: CompareValue;
  singleAgent: CompareValue;
}

const COMPARE_ROWS: CompareRow[] = [
  {
    capability: "Plans before building",
    promptToApp: "no",
    pairProgrammer: "no",
    singleAgent: "partial",
  },
  {
    capability: "Specialist roles (PM, architect, QA…)",
    promptToApp: "no",
    pairProgrammer: "no",
    singleAgent: "no",
  },
  {
    capability: "Shared project memory across steps",
    promptToApp: "no",
    pairProgrammer: "partial",
    singleAgent: "partial",
  },
  {
    capability: "Automatic quality scoring",
    promptToApp: "no",
    pairProgrammer: "no",
    singleAgent: "no",
  },
  {
    capability: "Self-correcting debug loop",
    promptToApp: "no",
    pairProgrammer: "no",
    singleAgent: "partial",
  },
  {
    capability: "Real stack + container deploy",
    promptToApp: "partial",
    pairProgrammer: "no",
    singleAgent: "partial",
  },
  {
    capability: "Own your code, no lock-in",
    promptToApp: "partial",
    pairProgrammer: "yes",
    singleAgent: "partial",
  },
];

const PRICING_PLANS = [
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
    features: [
      "Unlimited projects",
      "Private builds",
      "GitHub sync",
    ],
    cta: "Choose Standard",
    featured: true,
  },
  {
    name: "Pro",
    price: "$99",
    credits: "750 credits / month",
    blurb:
      "Bring your own key, unlock the full team, publish to the marketplace.",
    features: [
      "1M context window",
      "Bring your own key",
      "GitHub sync",
      "Marketplace publishing",
      "Usage overages available",
    ],
    cta: "Start building",
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
  return (
    <div className="w-full scroll-smooth bg-base text-ink min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-md focus:bg-ink focus:text-base focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>
      <Nav />
      <main id="main-content">
        <HeroSection />
        <LandingPageBody />
      </main>
      <Footer />
    </div>
  );
}

// Everything below the hero — split out so Launch.tsx can embed it.
export function LandingPageBody() {
  return (
    <>
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

// ─── Nav ────────────────────────────────────────────────────────────────────

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div
        className={[
          "mx-auto transition-all duration-500",
          scrolled
            ? "apple-glass-strong border-b border-border-soft"
            : "bg-transparent",
        ].join(" ")}
      >
        <nav
          aria-label="Primary"
          className="max-w-[1200px] mx-auto flex h-16 md:h-[72px] items-center justify-between px-6 md:px-12 lg:px-20"
        >
          <a
            href="#top"
            className="flex items-center gap-2.5 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
          >
            <BrandLogo size="md" />
            <span className="font-brand text-[17px] font-semibold tracking-tight text-ink">
              Forge
            </span>
          </a>

          <div className="hidden items-center gap-10 text-[14px] font-medium text-muted md:flex">
            {[
              { label: "Platform", href: "#solution" },
              { label: "Agents", href: "#agents" },
              { label: "Workflow", href: "#workflow" },
              { label: "Pricing", href: "#pricing" },
            ].map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="relative py-1 transition-colors duration-200 hover:text-ink group"
              >
                {link.label}
                <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-ink transition-all duration-300 group-hover:w-full" />
              </a>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <Link
              to="/login"
              className="hidden sm:inline-flex text-[14px] font-medium text-muted transition-colors duration-200 hover:text-ink"
            >
              Sign in
            </Link>
            <motion.div {...presets.button}>
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[14px] font-medium text-base transition-all duration-200 hover:bg-ink/85"
              >
                Start building
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </motion.div>
          </div>
        </nav>
      </div>
    </header>
  );
}

// ─── Hero ───────────────────────────────────────────────────────────────────

function HeroSection() {
  const { scrollY } = useScroll();
  const heroOpacity = useTransform(scrollY, [0, 600], [1, 0]);
  const heroY = useTransform(scrollY, [0, 600], [0, -60]);

  return (
    <section
      id="top"
      className="relative min-h-[100dvh] flex flex-col justify-end pb-20 md:pb-28 pt-32"
    >
      <motion.div
        style={{ opacity: heroOpacity, y: heroY }}
        className="px-6 md:px-12 lg:px-20"
      >
        <div className="max-w-[1200px] mx-auto">
          <Reveal>
            <p className="text-[13px] font-medium tracking-[0.06em] uppercase text-muted mb-8">
              The AI engineering organization
            </p>
          </Reveal>

          <Reveal delay={0.08}>
            <h1 className="font-display text-[clamp(3rem,8vw,6.5rem)] font-medium leading-[1.02] tracking-[-0.04em] max-w-[900px]">
              Software,
              <br />
              engineered.
            </h1>
          </Reveal>

          <Reveal delay={0.16}>
            <p className="mt-8 text-[19px] md:text-[21px] text-muted max-w-[560px] leading-relaxed">
              Turn ideas into production-ready software. Describe what you want,
              and a team of specialist agents plans, builds, and ships it.
            </p>
          </Reveal>

          <Reveal delay={0.24}>
            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <motion.div {...presets.button}>
                <Link
                  to="/signup"
                  className="inline-flex items-center justify-center gap-2 h-12 px-7 rounded-full bg-ink text-base text-[15px] font-medium transition-all duration-200 hover:bg-ink/85"
                >
                  Start building — free
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
              </motion.div>
              <motion.div {...presets.button}>
                <a
                  href="#solution"
                  className="inline-flex items-center justify-center gap-2 h-12 px-7 rounded-full border border-border text-[15px] font-medium text-ink transition-all duration-200 hover:bg-inlay-hover"
                >
                  See how it works
                </a>
              </motion.div>
            </div>
          </Reveal>
        </div>
      </motion.div>

      <Reveal className="absolute bottom-8 left-1/2 -translate-x-1/2" delay={0.5}>
        <div className="flex flex-col items-center gap-2 text-muted/50">
          <span className="text-[11px] tracking-widest uppercase">Scroll</span>
          <div className="w-px h-8 bg-gradient-to-b from-muted/30 to-transparent" />
        </div>
      </Reveal>
    </section>
  );
}

// ─── Inference / Problem + Solution combined ─────────────────────────────────

function InferenceSection() {
  return (
    <Section id="solution" className="py-32 md:py-44">
      <Reveal>
        <p className="text-[13px] font-medium tracking-[0.06em] uppercase text-muted mb-8">
          Every customer served.
        </p>
      </Reveal>

      <Reveal delay={0.06}>
        <h2 className="font-display text-[clamp(2.5rem,5vw,4.5rem)] font-medium leading-[1.06] tracking-[-0.035em] max-w-[900px]">
          Every product sold.
          <br />
          Every commit merged.
          <br />
          Every agent task completed.
        </h2>
      </Reveal>

      <Reveal delay={0.12}>
        <p className="mt-12 text-[19px] md:text-[21px] text-muted max-w-[600px] leading-relaxed">
          Training creates the possibility.
          <br />
          Inference creates the value.
        </p>
      </Reveal>

      <Reveal delay={0.18}>
        <p className="mt-8 text-[19px] md:text-[21px] text-muted max-w-[600px] leading-relaxed">
          The more we ask of AI, the more inference it takes. And inference is
          becoming the bottleneck.
        </p>
      </Reveal>

      <Reveal delay={0.24}>
        <p className="mt-8 text-[19px] md:text-[21px] text-ink max-w-[600px] leading-relaxed font-medium">
          Forge was built for this.
        </p>
      </Reveal>

      <Reveal delay={0.3}>
        <p className="mt-8 text-[19px] md:text-[21px] text-muted max-w-[700px] leading-relaxed">
          We pioneered the multi-agent architecture. Specialist agents —
          architect, designer, developer, integration, and review — work together
          with shared context to plan, build, and validate production-grade
          software, reliably, affordably, at scale.
        </p>
      </Reveal>

      <Reveal delay={0.36}>
        <p className="mt-8 text-[19px] md:text-[21px] text-muted max-w-[700px] leading-relaxed">
          Fast or affordable is no longer a tradeoff.
        </p>
      </Reveal>

      <Reveal delay={0.42}>
        <p className="mt-8 text-[19px] md:text-[21px] text-ink max-w-[700px] leading-relaxed font-medium">
          Forge makes software engineering work at scale.
        </p>
      </Reveal>
    </Section>
  );
}

// ─── Agents ─────────────────────────────────────────────────────────────────

function AgentsSection() {
  return (
    <Section id="agents" className="py-32 md:py-44 border-t border-border-soft">
      <Reveal>
        <p className="text-[13px] font-medium tracking-[0.06em] uppercase text-muted mb-8">
          Multi-agent architecture
        </p>
      </Reveal>

      <Reveal delay={0.06}>
        <h2 className="font-display text-[clamp(2.5rem,5vw,4.5rem)] font-medium leading-[1.06] tracking-[-0.035em] max-w-[900px]">
          The team behind every build.
        </h2>
      </Reveal>

      <Reveal delay={0.12}>
        <p className="mt-8 text-[19px] md:text-[21px] text-muted max-w-[600px] leading-relaxed">
          Each agent reads the same project memory and hands off automatically —
          no prompting required between steps.
        </p>
      </Reveal>

      <div className="mt-20 grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-border-soft">
        {AGENTS.map((agent, i) => (
          <Reveal key={agent.id} delay={0.05 * i}>
            <motion.div
              className="bg-base p-10 h-full"
              whileHover={{
                backgroundColor: "rgb(var(--inlay-hover))",
                transition: { duration: 0.3 },
              }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center mb-8"
                style={{ background: `${agent.hue}10` }}
              >
                <agent.icon
                  size={18}
                  strokeWidth={1.5}
                  style={{ color: agent.hue }}
                  aria-hidden="true"
                />
              </div>
              <h3 className="font-display text-[17px] font-medium mb-3 text-ink">
                {agent.label}
              </h3>
              <p className="text-[15px] text-muted leading-relaxed">
                {AGENT_DESCRIPTIONS[agent.id]}
              </p>
            </motion.div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

// ─── Workflow ───────────────────────────────────────────────────────────────

function WorkflowSection() {
  return (
    <Section id="workflow" className="py-32 md:py-44 border-t border-border-soft">
      <Reveal>
        <p className="text-[13px] font-medium tracking-[0.06em] uppercase text-muted mb-8">
          How it works
        </p>
      </Reveal>

      <Reveal delay={0.06}>
        <h2 className="font-display text-[clamp(2.5rem,5vw,4.5rem)] font-medium leading-[1.06] tracking-[-0.035em] max-w-[900px]">
          From prompt to production.
          <br />
          One handoff at a time.
        </h2>
      </Reveal>

      <div className="mt-20 grid grid-cols-1 md:grid-cols-5 gap-px bg-border-soft">
        {WORKFLOW_STEPS.map((s, i) => (
          <Reveal key={s.n} delay={0.06 * i}>
            <div className="bg-base p-8 md:p-10 h-full">
              <div className="font-mono text-[12px] text-muted/60 mb-8">
                {s.n}
              </div>
              <div className="font-display text-[17px] font-medium mb-3 text-ink">
                {s.t}
              </div>
              <div className="text-[15px] text-muted leading-relaxed">
                {s.d}
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

// ─── Features ───────────────────────────────────────────────────────────────

function FeaturesSection() {
  return (
    <Section id="features" className="py-32 md:py-44 border-t border-border-soft">
      <Reveal>
        <p className="text-[13px] font-medium tracking-[0.06em] uppercase text-muted mb-8">
          Features
        </p>
      </Reveal>

      <Reveal delay={0.06}>
        <h2 className="font-display text-[clamp(2.5rem,5vw,4.5rem)] font-medium leading-[1.06] tracking-[-0.035em] max-w-[900px]">
          Built for real work.
        </h2>
      </Reveal>

      <div className="mt-20 grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-border-soft">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} delay={0.04 * i}>
            <motion.div
              className="bg-base p-10 h-full"
              whileHover={{
                backgroundColor: "rgb(var(--inlay-hover))",
                transition: { duration: 0.3 },
              }}
            >
              <h3 className="font-display text-[17px] font-medium mb-3 text-ink">
                {f.title}
              </h3>
              <p className="text-[15px] text-muted leading-relaxed">
                {f.description}
              </p>
            </motion.div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

// ─── Why Forge ──────────────────────────────────────────────────────────────

function WhyForgeSection() {
  return (
    <Section id="why" className="py-32 md:py-44 border-t border-border-soft">
      <Reveal>
        <p className="text-[13px] font-medium tracking-[0.06em] uppercase text-muted mb-8">
          Why Forge
        </p>
      </Reveal>

      <Reveal delay={0.06}>
        <h2 className="font-display text-[clamp(2.5rem,5vw,4.5rem)] font-medium leading-[1.06] tracking-[-0.035em] max-w-[900px]">
          Because shipping is the point.
        </h2>
      </Reveal>

      <div className="mt-20 max-w-[800px]">
        {WHY_FORGE_LINES.map((line, i) => {
          if (line === "") return <div key={i} className="h-6" />;
          const isEmphasis = i % 4 === 1 || i % 4 === 3;
          return (
            <Reveal key={i} delay={0.02 * i}>
              <p
                className={`text-[clamp(1.5rem,3vw,2.5rem)] leading-[1.2] tracking-[-0.025em] font-medium ${
                  isEmphasis ? "text-ink" : "text-muted"
                }`}
              >
                {line}
              </p>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}

// ─── Comparison ─────────────────────────────────────────────────────────────

function CompareMark({ value }: { value: CompareValue }) {
  if (value === "yes")
    return (
      <Check
        className="w-4 h-4 text-ink inline"
        strokeWidth={2}
        aria-label="Yes"
      />
    );
  if (value === "partial")
    return (
      <Minus
        className="w-4 h-4 text-muted inline"
        strokeWidth={2}
        aria-label="Partial"
      />
    );
  return (
    <X
      className="w-4 h-4 text-muted/30 inline"
      strokeWidth={2}
      aria-label="No"
    />
  );
}

function ComparisonSection() {
  return (
    <Section id="compare" className="py-32 md:py-44 border-t border-border-soft">
      <Reveal>
        <p className="text-[13px] font-medium tracking-[0.06em] uppercase text-muted mb-8">
          Comparison
        </p>
      </Reveal>

      <Reveal delay={0.06}>
        <h2 className="font-display text-[clamp(2.5rem,5vw,4.5rem)] font-medium leading-[1.06] tracking-[-0.035em] max-w-[900px]">
          Not another way to generate code.
        </h2>
      </Reveal>

      <Reveal delay={0.12}>
        <p className="mt-8 text-[19px] text-muted max-w-[600px] leading-relaxed">
          Here is what changes when a team plans, builds, and reviews your
          software — instead of one model guessing at all of it.
        </p>
      </Reveal>

      <Reveal delay={0.18}>
        <div className="mt-16 overflow-x-auto">
          <table className="w-full text-[14px] border-collapse min-w-[640px]">
            <thead>
              <tr className="border-b border-border-soft text-left">
                <th className="py-4 pr-4 font-normal text-muted">Capability</th>
                <th className="py-4 px-4 font-normal text-muted text-center">
                  Prompt-to-app tools
                </th>
                <th className="py-4 px-4 font-normal text-muted text-center">
                  AI pair programmers
                </th>
                <th className="py-4 px-4 font-normal text-muted text-center">
                  Autonomous single agents
                </th>
                <th className="py-3 pl-4 font-medium text-ink text-center">
                  Forge AI
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((row) => (
                <tr
                  key={row.capability}
                  className="border-b border-border-soft"
                >
                  <td className="py-5 pr-4 text-ink">{row.capability}</td>
                  <td className="py-5 px-4 text-center">
                    <CompareMark value={row.promptToApp} />
                  </td>
                  <td className="py-5 px-4 text-center">
                    <CompareMark value={row.pairProgrammer} />
                  </td>
                  <td className="py-5 px-4 text-center">
                    <CompareMark value={row.singleAgent} />
                  </td>
                  <td className="py-5 pl-4 text-center bg-inlay-subtle">
                    <Check
                      className="w-4 h-4 text-ink inline"
                      strokeWidth={2}
                      aria-label="Yes"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Reveal>
    </Section>
  );
}

// ─── Pricing ────────────────────────────────────────────────────────────────

function PricingSection() {
  return (
    <Section id="pricing" className="py-32 md:py-44 border-t border-border-soft">
      <Reveal>
        <p className="text-[13px] font-medium tracking-[0.06em] uppercase text-muted mb-8">
          Pricing
        </p>
      </Reveal>

      <Reveal delay={0.06}>
        <h2 className="font-display text-[clamp(2.5rem,5vw,4.5rem)] font-medium leading-[1.06] tracking-[-0.035em] max-w-[900px]">
          Start free. Scale when it ships.
        </h2>
      </Reveal>

      <Reveal delay={0.12}>
        <p className="mt-8 text-[19px] text-muted max-w-[500px] leading-relaxed">
          Credits cover agent work. A typical build runs about 13.
        </p>
      </Reveal>

      <div className="mt-20 grid md:grid-cols-3 gap-px bg-border-soft border border-border-soft">
        {PRICING_PLANS.map((plan, i) => (
          <Reveal key={plan.name} delay={0.06 * i}>
            <motion.div
              className="bg-base p-10 flex flex-col relative"
              whileHover={{
                y: -4,
                transition: {
                  type: "spring",
                  stiffness: 300,
                  damping: 22,
                },
              }}
            >
              {plan.featured && (
                <div
                  className="absolute top-0 left-0 right-0 h-px bg-ink"
                  aria-hidden="true"
                />
              )}
              <h3 className="font-display text-[17px] font-medium text-ink">
                {plan.name}
              </h3>
              <div className="mt-8 flex items-baseline gap-2">
                <span className="font-display text-[40px] font-medium tracking-[-0.03em] text-ink">
                  {plan.price}
                </span>
                <span className="text-[14px] text-muted">/mo</span>
              </div>
              <p className="text-[13px] text-muted mt-1">{plan.credits}</p>
              <p className="text-[13px] text-muted/70 mt-0.5 mb-8">
                {plan.blurb}
              </p>
              <motion.div {...presets.button}>
                <Link
                  to="/signup"
                  className={`w-full text-center py-3 rounded-full text-[14px] font-medium block transition-all duration-200 ${
                    plan.featured
                      ? "bg-ink text-base hover:bg-ink/85"
                      : "border border-border text-ink hover:bg-inlay-hover"
                  }`}
                >
                  {plan.cta}
                </Link>
              </motion.div>
              <ul className="mt-10 space-y-4 text-[14px]">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <Check
                      className="w-4 h-4 text-muted mt-0.5 shrink-0"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    <span className="text-muted">{f}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

// ─── FAQ ────────────────────────────────────────────────────────────────────

function FAQSection() {
  return (
    <Section className="py-32 md:py-44 border-t border-border-soft">
      <div className="grid lg:grid-cols-[1fr_2fr] gap-16 lg:gap-24">
        <div>
          <Reveal>
            <p className="text-[13px] font-medium tracking-[0.06em] uppercase text-muted mb-8">
              FAQ
            </p>
          </Reveal>
          <Reveal delay={0.06}>
            <h2 className="font-display text-[clamp(2.5rem,4vw,3.5rem)] font-medium leading-[1.08] tracking-[-0.035em] text-ink">
              Questions,
              <br />
              answered.
            </h2>
          </Reveal>
        </div>
        <dl>
          {FAQS.map((f, i) => (
            <Reveal key={f.q} delay={0.03 * i}>
              <div className="border-b border-border-soft py-6">
                <dt className="font-medium text-[16px] text-ink">{f.q}</dt>
                <dd className="text-[15px] text-muted leading-relaxed mt-3">
                  {f.a}
                </dd>
              </div>
            </Reveal>
          ))}
        </dl>
      </div>
    </Section>
  );
}

// ─── Final CTA ──────────────────────────────────────────────────────────────

function FinalCTA() {
  return (
    <Section className="py-32 md:py-44 border-t border-border-soft">
      <Reveal>
        <h2 className="font-display text-[clamp(3rem,7vw,5.5rem)] font-medium tracking-[-0.04em] leading-[1.02]">
          Your next app is
          <br />
          one prompt away.
        </h2>
        <p className="mt-6 text-[19px] text-muted">
          Free to start. No card. No setup.
        </p>
        <div className="mt-12">
          <motion.div {...presets.button}>
            <Link
              to="/signup"
              className="inline-flex items-center justify-center gap-2 h-12 px-7 rounded-full bg-ink text-base text-[15px] font-medium transition-all duration-200 hover:bg-ink/85"
            >
              Start building free
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </motion.div>
        </div>
      </Reveal>
    </Section>
  );
}

// ─── Footer ─────────────────────────────────────────────────────────────────

export function Footer() {
  return (
    <footer className="border-t border-border-soft">
      <div className="max-w-[1200px] mx-auto px-6 md:px-12 lg:px-20 py-16 md:py-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <BrandLogo size="sm" />
              <span className="font-brand text-[16px] font-semibold tracking-tight text-ink">
                Forge
              </span>
            </div>
            <p className="text-[14px] text-muted leading-relaxed max-w-[280px]">
              The AI engineering organization. Turn ideas into production-ready
              software.
            </p>
          </div>

          <div>
            <h4 className="text-[13px] font-medium tracking-[0.06em] uppercase text-muted mb-5">
              Product
            </h4>
            <ul className="space-y-3">
              {["Platform", "Agents", "Workflow", "Pricing"].map((item) => (
                <li key={item}>
                  <a
                    href={`#${item.toLowerCase()}`}
                    className="text-[14px] text-muted hover:text-ink transition-colors duration-200"
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-[13px] font-medium tracking-[0.06em] uppercase text-muted mb-5">
              Company
            </h4>
            <ul className="space-y-3">
              {[
                { label: "GitHub", href: "https://github.com" },
                { label: "Blog", href: "#" },
                { label: "Contact", href: "#" },
              ].map((item) => (
                <li key={item.label}>
                  <a
                    href={item.href}
                    target={item.href.startsWith("http") ? "_blank" : undefined}
                    rel={
                      item.href.startsWith("http")
                        ? "noopener noreferrer"
                        : undefined
                    }
                    className="text-[14px] text-muted hover:text-ink transition-colors duration-200 inline-flex items-center gap-1"
                  >
                    {item.label}
                    {item.href.startsWith("http") && (
                      <ArrowUpRight
                        className="w-3 h-3 opacity-40"
                        aria-hidden="true"
                      />
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-[13px] font-medium tracking-[0.06em] uppercase text-muted mb-5">
              Legal
            </h4>
            <ul className="space-y-3">
              {["Terms", "Privacy", "Security"].map((item) => (
                <li key={item}>
                  <span
                    className="text-[14px] text-muted transition-colors duration-200 cursor-default"
                    role="link"
                    aria-disabled="true"
                  >
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-border-soft flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[13px] text-muted/60">
            © {new Date().getFullYear()} Forge AI. All rights reserved.
          </p>
          <div className="flex items-center gap-5">
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted/60 hover:text-ink transition-colors duration-200"
              aria-label="GitHub"
            >
              <Github size={16} aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
