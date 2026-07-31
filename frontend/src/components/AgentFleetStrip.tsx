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

/**
 * Maximalist agent fleet strip — densifies the OS desktop with every
 * build + gateway skill tile and a coverage readout.
 */
export function AgentFleetStrip({ compact = false }: { compact?: boolean }) {
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);
  const build = AGENTS;
  const gateway = GATEWAY_AGENTS;

  useEffect(() => {
    if (reduceMotion) return;
    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % build.length);
    }, 2400);
    return () => window.clearInterval(id);
  }, [reduceMotion, build.length]);

  useEffect(() => {
    if (reduceMotion || !railRef.current) return;
    const nodes = railRef.current.querySelectorAll("[data-fleet-tile]");
    const ctx = gsap.context(() => {
      gsap.from(nodes, {
        opacity: 0,
        y: 10,
        stagger: 0.04,
        duration: 0.4,
        ease: "power2.out",
      });
    }, railRef);
    return () => ctx.revert();
  }, [reduceMotion]);

  return (
    <section
      aria-label="Agent fleet"
      className={[
        "os-fleet border-y border-white/15 bg-gradient-to-r from-white/[0.06] via-black/40 to-white/[0.03]",
        compact ? "px-3 py-2" : "px-4 py-3 md:px-6",
      ].join(" ")}
    >
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink/80">
            <span className="launch-fleet-live relative flex h-1.5 w-1.5 rounded-full bg-ink" aria-hidden="true" />
            Agent fleet · {build[active].label} live
          </p>
          {!compact && (
            <p className="mt-0.5 text-xs text-muted">
              {stats.full} full · {stats.partial} partial · {stats.minimal} minimal · +{ORG_ROLE_COUNT} org roles · +
              {PLAYBOOK_COUNT} playbooks
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-faint">
          <span className="rounded-sm border border-ok/40 bg-ok/10 px-1.5 py-0.5 text-ok">{stats.full} live</span>
          <span className="rounded-sm border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-warn">{stats.partial} partial</span>
          <span className="rounded-sm border border-white/15 bg-white/5 px-1.5 py-0.5">{stats.minimal} thin</span>
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
              onClick={() => setActive(i)}
              className={[
                "group relative flex min-w-[4.75rem] flex-col items-center gap-1 px-2 py-2 outline-none transition-transform focus-visible:ring-1 focus-visible:ring-ink/50",
                isActive ? "-translate-y-0.5" : "hover:-translate-y-0.5",
              ].join(" ")}
            >
              <span
                className={["launch-fleet-glyph relative flex h-10 w-10 items-center justify-center", isActive ? "is-active" : ""].join(" ")}
                style={{ ["--fleet-hue" as string]: agent.hue }}
              >
                {isActive && !reduceMotion && <span className="launch-fleet-ring" aria-hidden="true" />}
                <Icon
                  size={15}
                  className="relative z-[1]"
                  style={{ color: isActive ? "#09090B" : agent.hue }}
                  aria-hidden="true"
                />
              </span>
              <span className="font-mono text-[8px] font-bold uppercase tracking-[0.16em] text-faint">
                {BUILD_SHORT[agent.id]}
              </span>
              <span className="max-w-[4.25rem] truncate text-center text-[10px] font-medium text-ink/90">
                {agent.label}
              </span>
            </button>
          );
        })}

        <div className="mx-1 w-px shrink-0 self-stretch bg-white/10" aria-hidden="true" />

        {gateway.map((agent) => {
          const Icon = agent.icon;
          const meta = SKILL_VISUALS.find((s) => s.id === agent.id || s.id === `gateway_${agent.id}`);
          const thin = meta?.coverage === "minimal" || meta?.coverage === "partial";
          return (
            <div
              key={`gw-${agent.id}`}
              data-fleet-tile
              title={`${agent.label} · ${agent.stage}${thin ? ` · ${meta?.coverage}` : ""}`}
              className={[
                "group relative flex min-w-[4.5rem] flex-col items-center gap-1 px-2 py-2 transition-transform hover:-translate-y-0.5",
                thin ? "opacity-75" : "",
              ].join(" ")}
            >
              <span
                className="launch-fleet-glyph relative flex h-9 w-9 items-center justify-center"
                style={{ ["--fleet-hue" as string]: agent.hue }}
              >
                <Icon size={14} className="relative z-[1]" style={{ color: agent.hue }} aria-hidden="true" />
              </span>
              <span className="max-w-[4.25rem] truncate text-center text-[10px] font-medium text-ink/90">
                {agent.label}
              </span>
              <span className="font-mono text-[8px] uppercase tracking-wider text-faint">
                {agent.stage.slice(0, 4)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
