import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  Bot,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Plug,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Reveal, TwoTone } from "./Reveal";
import { GRAIN, atmosphere, type Hue } from "./atmosphere";

/* ---------- Mini UI vignettes (illustrative sample data) ---------- */

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-[248px] rounded-lg border border-border bg-base/85 p-3 text-left shadow-[0_20px_40px_-20px_rgb(0_0_0/0.7)] backdrop-blur-sm">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[11px] font-medium text-ink">{title}</span>
        <span className="flex gap-1" aria-hidden="true">
          <span className="h-1.5 w-1.5 rounded-full bg-ink/20" />
          <span className="h-1.5 w-1.5 rounded-full bg-ink/20" />
        </span>
      </div>
      {children}
    </div>
  );
}

const Dot = ({ cls }: { cls: string }) => <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cls}`} />;

function AgentsVignette() {
  const rows = [
    ["Product Lead", "Scoping brief", "bg-accent"],
    ["Architect", "Task graph · 14 nodes", "bg-info"],
    ["Frontend Eng.", "Building /checkout", "bg-ok"],
    ["QA", "Waiting on build", "bg-ink/30"],
  ];
  return (
    <Frame title="Team · Billing portal">
      <ul className="space-y-1.5">
        {rows.map(([name, task, dot]) => (
          <li key={name} className="flex items-center gap-2 rounded-md bg-ink/[0.03] px-2 py-1.5">
            <Dot cls={dot} />
            <span className="text-[10px] text-ink">{name}</span>
            <span className="ml-auto truncate text-[9px] text-muted">{task}</span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

function SkillsVignette() {
  const chips = ["api-hardening", "ci-pipeline", "authn-authz", "agent-memory", "k8s-delivery", "qa-verification", "data-viz", "design-systems"];
  return (
    <Frame title="Skill router">
      <div className="mb-2 rounded-md bg-ink/[0.03] px-2 py-1.5 font-mono text-[9px] text-muted">
        task: "add SSO to admin" → <span className="text-accent">authn-authz-design</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {chips.map((c, i) => (
          <span
            key={c}
            className={`rounded-pill border px-1.5 py-0.5 font-mono text-[8.5px] ${
              i === 2 ? "border-accent/40 bg-accent/[0.12] text-accent" : "border-border-soft text-muted"
            }`}
          >
            {c}
          </span>
        ))}
      </div>
    </Frame>
  );
}

function ProtocolsVignette() {
  const rows = [
    ["MCP", "github · 24 tools", "Live"],
    ["A2A", "agent card published", "Live"],
    ["AG-UI", "event stream · 3 clients", "Live"],
    ["ACP", "on the roadmap", "Planned"],
  ];
  return (
    <Frame title="Protocol gateway">
      <ul className="space-y-1.5">
        {rows.map(([p, d, s]) => (
          <li key={p} className="flex items-center gap-2 rounded-md bg-ink/[0.03] px-2 py-1.5">
            <span className="w-10 font-mono text-[10px] text-ink">{p}</span>
            <span className="truncate text-[9px] text-muted">{d}</span>
            <span
              className={`ml-auto rounded-pill px-1.5 text-[8.5px] ${s === "Live" ? "bg-ok/10 text-ok" : "bg-ink/[0.06] text-muted"}`}
            >
              {s}
            </span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

function GovernanceVignette() {
  return (
    <Frame title="Approval gate">
      <div className="rounded-md border border-warn/25 bg-warn/[0.06] p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-warn">
          <ShieldCheck className="h-3 w-3" aria-hidden="true" /> Deploy to production
        </div>
        <p className="mt-1 text-[9px] leading-snug text-muted">Release 2.4 · 6 files · tests 312/312 · security review passed</p>
        <div className="mt-2 flex gap-1.5">
          <span className="rounded-pill bg-ink px-2 py-0.5 text-[9px] font-medium text-[rgb(var(--bg))]">Approve</span>
          <span className="rounded-pill border border-border px-2 py-0.5 text-[9px] text-ink">Request changes</span>
        </div>
      </div>
      <div className="mt-2 font-mono text-[8.5px] leading-relaxed text-muted">
        09:41 audit · gate.opened release-2.4
        <br />
        09:41 sandbox · worktree/release-2.4 clean
      </div>
    </Frame>
  );
}

function ModelsVignette() {
  const rows: [string, number, string][] = [
    ["Anthropic", 82, "1.2s"],
    ["OpenAI", 64, "1.6s"],
    ["Gemini", 48, "1.9s"],
    ["Ollama (local)", 30, "2.4s"],
  ];
  return (
    <Frame title="Model gateway · routing">
      <ul className="space-y-2">
        {rows.map(([name, w, lat]) => (
          <li key={name} className="text-[9.5px]">
            <div className="flex justify-between">
              <span className="text-ink">{name}</span>
              <span className="font-mono tabular-nums text-muted">p50 {lat}</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-ink/[0.08]">
              <div className="h-full rounded-full bg-ink/60" style={{ width: `${w}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-2.5 flex justify-between font-mono text-[9px] text-muted">
        <span>budget $38.20 / $100</span>
        <span className="text-ok">breakers ok</span>
      </div>
    </Frame>
  );
}

function MemoryVignette() {
  const items = [
    ["ADR-012", "Use Postgres row-level security for tenants"],
    ["Convention", "API errors return problem+json"],
    ["Decision", "Defer P3 protocols until a use case"],
  ];
  return (
    <Frame title="Company memory">
      <ul className="space-y-1.5">
        {items.map(([k, v]) => (
          <li key={k} className="rounded-md bg-ink/[0.03] px-2 py-1.5">
            <span className="font-mono text-[8.5px] text-accent">{k}</span>
            <p className="mt-0.5 text-[9.5px] leading-snug text-ink">{v}</p>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

const FEATURES: { icon: LucideIcon; title: string; body: string; hue: Hue; at: string; Vignette: ComponentType }[] = [
  {
    icon: Bot,
    title: "Agents",
    body: "A full engineering organisation: Product Lead, Architect, Designer, engineers, DevOps, Security, QA and Release.",
    hue: "olive",
    at: "50% 100%",
    Vignette: AgentsVignette,
  },
  {
    icon: Sparkles,
    title: "Skills",
    body: "40 skills across 9 domains. The engine routes each task to the skills it needs, with permissions checked.",
    hue: "teal",
    at: "30% 100%",
    Vignette: SkillsVignette,
  },
  {
    icon: Plug,
    title: "Protocols",
    body: "A gateway for MCP, MCP Apps, A2A, AG-UI and A2UI, so agents use your tools and talk to other agents.",
    hue: "rust",
    at: "70% 100%",
    Vignette: ProtocolsVignette,
  },
  {
    icon: ShieldCheck,
    title: "Governance",
    body: "Approval gates, a full audit trail and sandboxed worktrees. Autonomy with a human hand on the switch.",
    hue: "olive",
    at: "20% 100%",
    Vignette: GovernanceVignette,
  },
  {
    icon: Cpu,
    title: "Model gateway",
    body: "Route across nine cloud providers or your own local models, with budgets, rate limits and circuit breakers.",
    hue: "teal",
    at: "80% 100%",
    Vignette: ModelsVignette,
  },
  {
    icon: BrainCircuit,
    title: "Memory",
    body: "Decisions, conventions and architecture persist as company memory, so every run starts where the last left off.",
    hue: "rust",
    at: "50% 100%",
    Vignette: MemoryVignette,
  },
];

export function FeatureCarousel() {
  const track = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  const update = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  }, []);

  useEffect(() => {
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [update]);

  const scrollBy = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const card = el.querySelector("li");
    const step = card ? card.getBoundingClientRect().width + 16 : el.clientWidth * 0.8;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy?.({ left: dir * step, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <section id="platform" aria-labelledby="platform-title" className="scroll-mt-20 py-28 sm:py-36">
      <Reveal className="px-5 sm:px-8">
        <TwoTone id="platform-title" lead="Everything an engineering org needs." rest="Nothing it doesn't." />
      </Reveal>

      <Reveal delay={0.1} className="mt-14">
        <ul
          ref={track}
          onScroll={update}
          aria-label="Platform capabilities"
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-5 pb-4 [scrollbar-width:none] motion-reduce:scroll-auto sm:px-8 scroll-px-5 sm:scroll-px-8 xl:px-[max(2rem,calc((100vw_-_1120px)/2))] xl:scroll-px-[max(2rem,calc((100vw_-_1120px)/2))] [&::-webkit-scrollbar]:hidden"
        >
          {FEATURES.map(({ icon: Icon, title, body, hue, at, Vignette }) => (
            <li
              key={title}
              className="group relative flex h-[460px] w-[82vw] max-w-[340px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-border sm:w-[340px]"
            >
              <div className="absolute inset-0" aria-hidden="true" style={{ background: atmosphere(hue, at) }} />
              <div className="absolute inset-0 opacity-[0.08] mix-blend-overlay" aria-hidden="true" style={{ backgroundImage: GRAIN }} />
              <div className="absolute inset-0 bg-base/10" aria-hidden="true" />
              <div
                className="relative px-5 pt-5 transition-transform duration-slow ease-spring group-hover:-translate-y-1 motion-reduce:transition-none"
                aria-hidden="true"
                style={{ maskImage: "linear-gradient(180deg, black 62%, transparent 100%)", WebkitMaskImage: "linear-gradient(180deg, black 62%, transparent 100%)" }}
              >
                <Vignette />
              </div>
              <div className="relative mt-auto p-5 pt-0">
                <h3 className="flex items-center gap-2 text-[19px] font-medium tracking-[-0.02em] text-ink">
                  <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                  {title}
                </h3>
                <p className="mt-2 text-[14.5px] leading-[1.5] text-ink">{body}</p>
              </div>
            </li>
          ))}
          <li aria-hidden="true" className="w-px shrink-0" />
        </ul>

        <div className="mx-auto mt-6 flex max-w-[1120px] justify-center gap-2 px-5 sm:justify-end sm:px-8">
          <button
            type="button"
            aria-label="Previous capabilities"
            disabled={edge.start}
            onClick={() => scrollBy(-1)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-pill border border-glass-border bg-glass text-ink transition-colors hover:bg-ink/10 disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next capabilities"
            disabled={edge.end}
            onClick={() => scrollBy(1)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-pill border border-glass-border bg-glass text-ink transition-colors hover:bg-ink/10 disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </Reveal>
    </section>
  );
}
