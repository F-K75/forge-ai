import { useEffect, useState } from "react";
import { useBuildStore } from "../../store/buildStore";
import { AgentFlowPanel } from "./AgentFlowPanel";
import { EditorPanel } from "./EditorPanel";

// The workspace's middle display. Two views of the same build: what the
// agents are producing (plans, models, validation — plus approval gates on
// interactive builds) and the code itself. Auto-follows the pipeline —
// planning agents pull the Agents tab forward, the developer's stream pulls
// Code forward — while manual clicks always win until the next transition.

type Tab = "agents" | "code";

export function CenterPanel() {
  const activeAgent = useBuildStore((s) => s.activeAgent);
  const pendingGate = useBuildStore((s) => s.pendingGate);
  const status = useBuildStore((s) => s.status);

  const [tab, setTab] = useState<Tab>("agents");

  useEffect(() => {
    if (pendingGate) setTab("agents");
  }, [pendingGate]);

  useEffect(() => {
    if (activeAgent === "developer") setTab("code");
    else if (activeAgent) setTab("agents");
  }, [activeAgent]);

  useEffect(() => {
    if (status === "complete" || status === "debugging") setTab("code");
  }, [status]);

  const waiting = pendingGate !== null;

  return (
    <section className="flex-1 min-w-0 flex flex-col bg-base border-r border-border" aria-label="Build output">
      <div role="tablist" aria-label="Center panel view" className="flex items-center gap-1 px-3 pt-2 border-b border-border-soft">
        <TabButton id="agents" active={tab === "agents"} onSelect={setTab} badge={waiting}>
          Agents
        </TabButton>
        <TabButton id="code" active={tab === "code"} onSelect={setTab}>
          Code
        </TabButton>
      </div>
      <div className="flex-1 min-h-0">
        {tab === "agents" ? <AgentFlowPanel /> : <EditorPanel bare />}
      </div>
    </section>
  );
}

function TabButton({
  id,
  active,
  onSelect,
  badge,
  children,
}: {
  id: Tab;
  active: boolean;
  onSelect: (tab: Tab) => void;
  badge?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={() => onSelect(id)}
      className={`relative px-3 py-2 text-xs font-medium uppercase tracking-wider transition-colors border-b-2 -mb-px focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 ${
        active ? "text-ink border-ink" : "text-faint border-transparent hover:text-muted"
      }`}
    >
      {children}
      {badge && (
        <span
          className="absolute top-1.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-warn"
          aria-label="Waiting for your response"
        />
      )}
    </button>
  );
}
