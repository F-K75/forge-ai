import { useState } from "react";
import { Activity, Search, AlertTriangle, Zap } from "lucide-react";
import {
  ADMIN_STATS,
  AGENT_HEALTH,
  RECENT_BUILDS,
  type AdminStat,
  type AgentHealth,
  type AdminBuild,
} from "../lib/mockData";
import { agentById } from "../lib/agents";
import { getIcon } from "../lib/iconMap";
import { StatusPill } from "../components/StatusPill";

export default function AdminConsole() {
  const [query, setQuery] = useState("");

  const filteredBuilds = RECENT_BUILDS.filter(
    (b) =>
      b.user.includes(query.toLowerCase()) ||
      b.project.includes(query.toLowerCase())
  );

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between mb-7">
        <div className="flex items-center gap-2.5">
          <Activity size={18} className="text-accent" aria-hidden="true" />
          <h1 className="text-xl font-semibold text-ink">Admin console</h1>
        </div>
        <div className="relative">
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search users or builds…"
            className="bg-panel-alt border border-border rounded-lg pl-8 pr-4 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent w-56 transition motion-reduce:transition-none"
          />
        </div>
      </header>

      {/* Stat cards */}
      <section aria-label="Platform statistics" className="mb-7">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {ADMIN_STATS.map((stat) => (
            <StatCard key={stat.label} stat={stat} />
          ))}
        </div>
      </section>

      {/* Two-column: health + builds */}
      <div className="flex flex-col lg:flex-row gap-5">
        {/* Agent health — 1/3 width */}
        <section
          aria-label="Agent health"
          className="lg:w-1/3 bg-panel border border-border rounded-xl p-4"
        >
          <h2 className="text-xs font-medium text-faint uppercase tracking-wide mb-3">
            Agent health
          </h2>
          <div className="divide-y divide-border-soft">
            {AGENT_HEALTH.map((h) => (
              <HealthRow key={h.agent} health={h} />
            ))}
          </div>
        </section>

        {/* Recent builds — 2/3 width */}
        <section
          aria-label="Recent builds"
          className="flex-1 bg-panel border border-border rounded-xl overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-xs font-medium text-faint uppercase tracking-wide">
              Recent builds
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border-soft">
                  <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide">
                    User
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide">
                    Project
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide text-right">
                    QA
                  </th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide text-right">
                    Credits
                  </th>
                </tr>
              </thead>
              <tbody>
                {(query ? filteredBuilds : RECENT_BUILDS).map((b, i) => (
                  <BuildRow key={i} build={b} />
                ))}
                {query && filteredBuilds.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-6 text-center text-sm text-faint"
                    >
                      No builds match "{query}"
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ stat }: { stat: AdminStat }) {
  const Icon = getIcon(stat.iconName);
  return (
    <div className="bg-panel border border-border rounded-xl p-4">
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{
            backgroundColor: `${stat.hue}1F`,
            border: `1px solid ${stat.hue}40`,
          }}
        >
          <Icon size={16} style={{ color: stat.hue }} aria-hidden="true" />
        </div>
        <span className="text-xs font-semibold text-ok">{stat.delta}</span>
      </div>
      <p className="font-mono text-[1.4rem] font-bold text-ink leading-none mb-1">
        {stat.value}
      </p>
      <p className="text-xs text-faint">{stat.label}</p>
    </div>
  );
}

function HealthRow({ health }: { health: AgentHealth }) {
  const agent = agentById(health.agent);
  const Icon = agent.icon;
  const flagged = health.uptime < 99;

  return (
    <div className="flex items-center gap-3 py-2.5 first:pt-1">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{
          backgroundColor: `${agent.hue}1F`,
          border: `1px solid ${agent.hue}40`,
        }}
      >
        <Icon size={13} style={{ color: agent.hue }} aria-hidden="true" />
      </div>
      <span className="text-sm text-ink flex-1 truncate">{agent.label}</span>
      <span className="font-mono text-xs text-muted">{health.latency}</span>
      <div className="flex items-center gap-1 shrink-0">
        {flagged && (
          <AlertTriangle
            size={11}
            className="text-warn"
            aria-label="Below target uptime"
          />
        )}
        <span
          className={`font-mono text-xs ${flagged ? "text-warn" : "text-ink"}`}
        >
          {health.uptime}%
        </span>
      </div>
    </div>
  );
}

function BuildRow({ build }: { build: AdminBuild }) {
  return (
    <tr className="border-t border-border-soft hover:bg-panel-alt transition motion-reduce:transition-none">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
            style={{ background: "linear-gradient(135deg, #7C5CFF, #A855F7)" }}
            aria-hidden="true"
          >
            {build.user[0].toUpperCase()}
          </div>
          <span className="text-sm text-ink">{build.user}</span>
        </div>
      </td>
      <td className="px-4 py-2.5">
        <span className="font-mono text-xs text-muted">{build.project}</span>
      </td>
      <td className="px-4 py-2.5">
        <StatusPill status={build.status} />
      </td>
      <td className="px-4 py-2.5 text-right">
        <span className="font-mono text-xs text-ink">
          {build.qaScore !== null ? build.qaScore : "—"}
        </span>
      </td>
      <td className="px-4 py-2.5 text-right">
        <div className="flex items-center justify-end gap-1">
          <Zap size={10} className="text-faint" aria-hidden="true" />
          <span className="font-mono text-xs text-ink">{build.credits}</span>
        </div>
      </td>
    </tr>
  );
}
