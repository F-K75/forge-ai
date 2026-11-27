import { useSearchParams } from "react-router-dom";
import {
  LayoutDashboard,
  Cpu,
  TerminalSquare,
  Gauge,
  Activity,
  Shield,
  type LucideIcon,
} from "lucide-react";
import AdminConsole from "./AdminConsole";
import LLMManagementPage from "./LLMManagementPage";
import PromptStudioPage from "./PromptStudioPage";
import OptimizationDashboard from "./OptimizationDashboard";
import EngineeringHealthPage from "./EngineeringHealthPage";

export type AdminOpsTabId = "overview" | "llm" | "prompts" | "optimization" | "health";

interface AdminOpsTab {
  id: AdminOpsTabId;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const ADMIN_OPS_TABS: AdminOpsTab[] = [
  {
    id: "overview",
    label: "Overview",
    description: "Platform telemetry, users, and system services",
    icon: LayoutDashboard,
  },
  {
    id: "llm",
    label: "LLM & Models",
    description: "Gateway providers, routing policies, and model usage",
    icon: Cpu,
  },
  {
    id: "prompts",
    label: "Prompt Studio",
    description: "Design prompt templates and agent system instructions",
    icon: TerminalSquare,
  },
  {
    id: "optimization",
    label: "Optimization",
    description: "Spend analytics, cache hit rates, and gateway efficiency",
    icon: Gauge,
  },
  {
    id: "health",
    label: "Engineering Health",
    description: "CI pipelines, test coverage, and runtime diagnostics",
    icon: Activity,
  },
];

function resolveTab(raw: string | null): AdminOpsTabId {
  if (raw && ADMIN_OPS_TABS.some((t) => t.id === raw)) {
    return raw as AdminOpsTabId;
  }
  return "overview";
}

export default function AdminOpsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolveTab(searchParams.get("tab"));

  const handleSelectTab = (tabId: AdminOpsTabId) => {
    setSearchParams({ tab: tabId }, { replace: true });
  };

  const activeMeta = ADMIN_OPS_TABS.find((t) => t.id === activeTab) ?? ADMIN_OPS_TABS[0]!;

  return (
    <div
      id="admin-ops-view"
      className="h-full flex flex-col min-h-0 bg-base text-ink"
    >
      {/* Header & Tab Navigation */}
      <header className="shrink-0 bg-panel border-b border-border px-4 sm:px-6 pt-4 pb-3 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-ink/[0.06] flex items-center justify-center text-ink shrink-0">
              <Shield size={18} aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold tracking-tight text-ink">
                Admin Ops Console
              </h1>
              <p className="text-xs text-muted">{activeMeta.description}</p>
            </div>
          </div>
          <span className="self-start sm:self-auto inline-flex items-center px-2.5 py-1 rounded-md bg-panel-alt border border-border font-mono text-[11px] font-medium text-muted">
            /admin?tab={activeTab}
          </span>
        </div>

        <nav
          role="tablist"
          aria-label="Admin Ops sections"
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1"
        >
          {ADMIN_OPS_TABS.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`admin-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`admin-panel-${tab.id}`}
                onClick={() => handleSelectTab(tab.id)}
                className={`shrink-0 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-pill text-xs font-medium transition-all duration-150 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer ${
                  selected
                    ? "bg-ink/[0.08] text-ink border border-border"
                    : "text-muted hover:text-ink hover:bg-panel-alt border border-transparent"
                }`}
              >
                <Icon size={14} aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </header>

      {/* Active Tab Panel */}
      <main
        id={`admin-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`admin-tab-${activeTab}`}
        className="flex-1 min-h-0 overflow-y-auto bg-base"
      >
        {activeTab === "overview" && <AdminConsole />}
        {activeTab === "llm" && <LLMManagementPage />}
        {activeTab === "prompts" && <PromptStudioPage />}
        {activeTab === "optimization" && <OptimizationDashboard />}
        {activeTab === "health" && <EngineeringHealthPage />}
      </main>
    </div>
  );
}

