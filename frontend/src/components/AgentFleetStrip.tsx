import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useReducedMotion } from "motion/react";
import { AGENTS } from "../lib/agents";
import { GATEWAY_AGENTS } from "../lib/gatewayAgents";
import { SKILL_VISUALS, coverageStats, ORG_ROLE_COUNT, PLAYBOOK_COUNT } from "../lib/skillVisuals";

const stats = coverageStats();

const BUILD_SHORT: Record<(typeof AGENTS)[number]["id"], string> = {
  architect: "ARCH",
  business_improver: "BIZ",
  designer: "DES",
  developer: "DEV",
  integration: "INT",
  pm: "PM",
};

export function AgentFleetStrip({ compact = false, onOpenGraph }: { compact?: boolean; onOpenGraph?: () => void }) {
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);
  const build = AGENTS;
  const gateway = GATEWAY_AGENTS;

  useEffect(() => {
    if (reduceMotion) return;
    const id = window.setInterval(() => setActive((i) => (i + 1) % build.length), 2600);
    return () => window.clearInterval(id);
  }, [reduceMotion, build.length]);

  useEffect(() => {
    if (reduceMotion || !railRef.current) return;
    const nodes = railRef.current.querySelectorAll("[data-fleet-tile]");
    const ctx = gsap.context(() => {
      gsap.from(nodes, {
        opacity: 0,
        y: 8,
        stagger: 0.03,
        duration: 0.35,
        ease: "power2.out",
      });
    }, railRef);
    return () => ctx.revert();
  }, [reduceMotion]);

  return (
    <section
      aria-label="Agent fleet"
      className={[
        "rounded-apple-xl border border-outline bg-panel shadow-m3",
        compact ? "px-3 py-3" : "px-4 py-4 md:px-5",
      ].join(" ")}
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[12px] font-medium text-muted">
            Agent fleet · <span className="text-ink">{build[active].label}</span> live
          </p>
          {!compact && (
            <p className="mt-0.5 text-[13px] text-faint">
              {stats.full} full · {stats.partial} partial · {stats.minimal} minimal · +{ORG_ROLE_COUNT} roles · +
              {PLAYBOOK_COUNT} playbooks
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-medium">
          <span className="bb-chip !bg-[rgb(var(--success)/0.15)] !text-ok">{stats.full} live</span>
          <span className="bb-chip !bg-[rgb(var(--warning)/0.15)] !text-warn">{stats.partial} partial</span>
          <span className="bb-chip">{stats.minimal} thin</span>
        </div>
      </div>

      <div
        ref={railRef}
        className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {build.map((agent, i) => {
          const Icon = agent.icon;
          const isActive = i === active;
          return (
            <button
              key={`build-${agent.id}`}
              type="button"
              data-fleet-tile
              title={`${agent.label} · build pipeline`}
              aria-current={isActive ? "true" : undefined}
              onClick={() => {
                setActive(i);
                onOpenGraph?.();
              }}
              className={[
                "group flex min-w-[4.5rem] flex-col items-center gap-1.5 rounded-2xl px-2 py-2 outline-none transition focus-visible:ring-2 focus-visible:ring-accent/40",
                isActive ? "bg-accent-soft" : "hover:bg-white/[0.05]",
              ].join(" ")}
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-2xl"
                style={{ background: `${agent.hue}18`, color: agent.hue }}
              >
                <Icon size={15} aria-hidden="true" />
              </span>
              <span className="text-[10px] font-semibold tracking-wide text-faint">
                {BUILD_SHORT[agent.id]}
              </span>
              {!compact && (
                <span className="max-w-[4.25rem] truncate text-center text-[12px] font-medium text-ink">
                  {agent.label}
                </span>
              )}
            </button>
          );
        })}

        <div className="mx-1 w-px shrink-0 self-stretch bg-border" aria-hidden="true" />

        {gateway.map((agent) => {
          const Icon = agent.icon;
          const meta = SKILL_VISUALS.find((s) => s.id === agent.id || s.id === `gateway_${agent.id}`);
          const thin = meta?.coverage === "minimal" || meta?.coverage === "partial";
          return (
            <div
              key={`gw-${agent.id}`}
              data-fleet-tile
              title={`${agent.label} · ${agent.stage}${thin ? ` · ${meta?.coverage}` : ""}`}
              onClick={onOpenGraph}
              className={["flex min-w-[4rem] cursor-pointer flex-col items-center gap-1 rounded-2xl px-2 py-2", thin ? "opacity-70" : ""].join(" ")}
            >
              <span
                className="flex h-8 w-8 items-center justify-center rounded-xl"
                style={{ background: `${agent.hue}14`, color: agent.hue }}
              >
                <Icon size={13} aria-hidden="true" />
              </span>
              <span className="max-w-[3.75rem] truncate text-center text-[11px] font-medium text-ink">
                {agent.label}
              </span>
              <span className="text-[10px] text-faint">{agent.stage.slice(0, 4)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
