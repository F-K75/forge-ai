import { AGENTS } from "../lib/agents";
import { GATEWAY_AGENTS } from "../lib/gatewayAgents";
import { SKILL_VISUALS, coverageStats, ORG_ROLE_COUNT, PLAYBOOK_COUNT } from "../lib/skillVisuals";

const stats = coverageStats();

/**
 * Maximalist agent fleet strip — densifies the OS desktop with every
 * build + gateway skill tile and a coverage readout.
 */
export function AgentFleetStrip({ compact = false }: { compact?: boolean }) {
  const build = AGENTS;
  const gateway = GATEWAY_AGENTS;

  return (
    <section
      aria-label="Agent fleet"
      className={[
        "os-fleet border-y border-ember/25 bg-gradient-to-r from-ember/[0.12] via-black/40 to-ember/[0.08]",
        compact ? "px-3 py-2" : "px-4 py-3 md:px-6",
      ].join(" ")}
    >
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ember">
            Agent fleet · {stats.total} skill visuals catalogued
          </p>
          {!compact && (
            <p className="mt-0.5 text-xs text-muted">
              {stats.full} full · {stats.partial} partial · {stats.minimal} minimal · +{ORG_ROLE_COUNT} org roles · +{PLAYBOOK_COUNT} playbooks
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-faint">
          <span className="rounded-sm border border-ok/40 bg-ok/10 px-1.5 py-0.5 text-ok">{stats.full} live</span>
          <span className="rounded-sm border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-warn">{stats.partial} partial</span>
          <span className="rounded-sm border border-white/15 bg-white/5 px-1.5 py-0.5">{stats.minimal} thin</span>
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {build.map((agent) => {
          const Icon = agent.icon;
          return (
            <div
              key={`build-${agent.id}`}
              title={`${agent.label} · build pipeline`}
              className="group relative flex min-w-[4.5rem] flex-col items-center gap-1 rounded-lg border border-white/10 bg-black/35 px-2 py-2 transition-transform hover:-translate-y-0.5"
              style={{ boxShadow: `inset 0 -2px 0 ${agent.hue}` }}
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-md"
                style={{ background: `${agent.hue}22`, color: agent.hue }}
              >
                <Icon size={16} aria-hidden="true" />
              </span>
              <span className="max-w-[4.25rem] truncate text-center text-[10px] font-medium text-ink/90">
                {agent.label}
              </span>
              <span className="font-mono text-[8px] uppercase tracking-wider text-faint">build</span>
            </div>
          );
        })}

        <div className="mx-1 w-px shrink-0 self-stretch bg-white/10" aria-hidden="true" />

        {gateway.map((agent) => {
          const Icon = agent.icon;
          const meta = SKILL_VISUALS.find(
            (s) => s.id === agent.id || s.id === `gateway_${agent.id}`
          );
          const thin = meta?.coverage === "minimal" || meta?.coverage === "partial";
          return (
            <div
              key={`gw-${agent.id}`}
              title={`${agent.label} · ${agent.stage}${thin ? ` · ${meta?.coverage}` : ""}`}
              className={[
                "group relative flex min-w-[4.5rem] flex-col items-center gap-1 rounded-lg border bg-black/35 px-2 py-2 transition-transform hover:-translate-y-0.5",
                thin ? "border-dashed border-white/20 opacity-80" : "border-white/10",
              ].join(" ")}
              style={{ boxShadow: `inset 0 -2px 0 ${agent.hue}` }}
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-md"
                style={{ background: `${agent.hue}22`, color: agent.hue }}
              >
                <Icon size={16} aria-hidden="true" />
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
