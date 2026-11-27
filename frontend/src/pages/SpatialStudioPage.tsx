import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Layers, ShieldCheck, Cpu } from "lucide-react";
import ForgeScene3D from "../components/three/ForgeScene3D";
import {
  FORGE_AGENT_SPECS,
  type AgentNodeSpec,
  type StudioFinish,
} from "../components/three/proceduralModels";

export default function SpatialStudioPage() {
  const navigate = useNavigate();
  const [selectedAgent, setSelectedAgent] = useState<AgentNodeSpec | null>(null);
  const [finish, setFinish] = useState<StudioFinish>("obsidian");

  return (
    <div className="relative flex flex-1 flex-col bg-panel-alt text-ink">
      {/* Full-bleed interactive Three.js 3D Architecture Viewport */}
      <div className="relative flex-1 min-h-[calc(100dvh-56px)] w-full">
        <ForgeScene3D
          mode="fullscreen"
          initialFinish={finish}
          activeAgentId={selectedAgent?.id ?? null}
          onSelectAgent={setSelectedAgent}
          showControls
        />

        {/* Compact Left Specialist Selector Rail (solid/rgba surface — zero backdrop-filter over WebGL) */}
        <aside
          aria-label="Specialist Agent Nodes"
          className="hidden md:flex absolute left-4 top-16 z-10 w-60 flex-col gap-2 rounded-lg border border-border bg-base/95 p-3 shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="font-display text-xs font-semibold text-ink">
              Specialist Topology
            </span>
            <span className="font-mono text-[10px] text-faint tabular-nums">
              {FORGE_AGENT_SPECS.length} nodes
            </span>
          </div>

          <div className="space-y-1">
            {FORGE_AGENT_SPECS.map((agent) => {
              const isSelected = selectedAgent?.id === agent.id;
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() =>
                    setSelectedAgent(isSelected ? null : agent)
                  }
                  className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
                    isSelected
                      ? "bg-info/20 text-ink border border-info/40"
                      : "border border-transparent text-muted hover:bg-base/80 hover:text-ink"
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className="h-2 w-2 shrink-0 rounded-sm"
                      style={{ backgroundColor: agent.colorHex }}
                    />
                    <span className="truncate font-medium">{agent.name}</span>
                  </span>
                  <span className="font-mono text-[10px] text-faint tabular-nums">
                    {agent.latencyMs}ms
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-1 border-t border-border pt-2.5 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-faint">
              <span className="inline-flex items-center gap-1">
                <Cpu className="h-3 w-3 text-accent" />
                Chassis Finish
              </span>
              <span className="font-mono text-[10px] uppercase text-muted">
                {finish}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {(["obsidian", "titanium", "blueprint"] as StudioFinish[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFinish(f)}
                  className={`rounded px-2 py-1 text-[10px] font-medium capitalize transition-colors ${
                    finish === f
                      ? "bg-ink text-on-ink"
                      : "bg-panel-alt text-muted hover:bg-surface-high"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-border pt-2.5 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => navigate("/p/demo-project/flow")}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-base/90 px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-ink/90 hover:text-ink"
            >
              <Layers className="h-3.5 w-3.5 text-accent" />
              <span>2D Flow</span>
            </button>
            <button
              type="button"
              onClick={() => navigate("/p/demo-project/workspace")}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-panel-alt px-2.5 py-1.5 text-xs font-medium text-on-ink transition-colors hover:bg-panel-alt"
            >
              <span>Workspace</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </aside>

        {/* Bottom-right architectural telemetry summary (solid surface, compact) */}
        <div className="pointer-events-none hidden xl:flex absolute bottom-4 right-4 z-10 items-center gap-3 rounded-md border border-border bg-base/90 px-3 py-1.5 text-[11px] text-muted">
          <ShieldCheck className="h-3.5 w-3.5 text-ok" />
          <span className="font-mono tabular-nums">6/6 Agents Synchronized</span>
          <span className="text-muted">·</span>
          <span className="font-mono">PBR Studio IBL</span>
        </div>
      </div>
    </div>
  );
}
