import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Bot, Box } from "lucide-react";
import { AgentFleetGraph } from "./AgentFleetGraph";
import { CommandPalette } from "./CommandPalette";
import { OSWindow } from "./OSWindow";
import { TopNavBar } from "./TopNavBar";

export default function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [showAgentFleet, setShowAgentFleet] = useState(false);

  const projectMatch = location.pathname.match(/^\/(?:p|build|project)\/([^/]+)/);
  const activeProjectId = projectMatch
    ? projectMatch[1]
    : localStorage.getItem("forge_last_project") || "demo-project";

  useEffect(() => {
    if (projectMatch && projectMatch[1] && projectMatch[1] !== "new") {
      try {
        localStorage.setItem("forge_last_project", projectMatch[1]);
      } catch {
        // ignore storage errors
      }
    }
  }, [projectMatch]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey) {
        if (e.key === "1") navigate("/projects");
        if (e.key === "2") navigate(`/p/${activeProjectId}/workspace`);
        if (e.key === "3") navigate(`/p/${activeProjectId}/flow`);
        if (e.key === "4") navigate(`/p/${activeProjectId}/initiatives`);
        if (e.key === "5") navigate(`/p/${activeProjectId}/reviews`);
        if (e.key === "6") navigate("/marketplace");
        if (e.key === "7") navigate(`/p/${activeProjectId}/files`);
        if (e.key === "8") navigate(`/p/${activeProjectId}/history`);
        if (e.key === "9") navigate("/models");
        if (e.key === "0") navigate("/billing");
        if (e.key === ",") navigate(`/p/${activeProjectId}/settings`);
        if (e.key.toLowerCase() === "l") navigate("/launch");
        if (e.key.toLowerCase() === "d") navigate("/studio-3d");
        if (e.key.toLowerCase() === "h") navigate("/home");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, activeProjectId]);

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-base font-sans text-ink select-none">
      <TopNavBar
        onOpenAgentFleet={() => setShowAgentFleet(true)}
        activeAgentCount={6}
        creditsBalance={1247}
      />

      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        <main
          id="os-desktop-canvas"
          className="relative flex flex-1 min-w-0 min-h-0 flex-col overflow-y-auto bg-base"
        >
          <Outlet />
        </main>
      </div>

      <CommandPalette />

      {showAgentFleet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="h-[520px] w-full max-w-2xl">
            <OSWindow
              id="os-modal-agent-fleet"
              title="Agent Fleet Topology"
              icon={Bot}
              status="6 Active Specialists"
              onClose={() => setShowAgentFleet(false)}
              className="h-full shadow-apple-float"
              bodyClassName="p-4"
            >
              <div className="flex h-full flex-col gap-3 text-xs">
                <div className="flex items-center justify-between rounded-lg border border-border bg-panel-alt/60 px-3.5 py-2.5">
                  <span className="font-medium text-ink">Active Workspace Graph</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAgentFleet(false);
                      navigate("/studio-3d");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-ember-glow transition-colors"
                  >
                    <Box size={12} />
                    <span>Open 3D Studio</span>
                  </button>
                </div>
                <div className="flex-1 overflow-hidden rounded-lg border border-border bg-panel p-2">
                  <AgentFleetGraph />
                </div>
              </div>
            </OSWindow>
          </div>
        </div>
      )}
    </div>
  );
}
