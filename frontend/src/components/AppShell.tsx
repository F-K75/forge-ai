import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Bot } from "lucide-react";
import { AgentFleetGraph } from "./AgentFleetGraph";
import { CommandPalette } from "./CommandPalette";
import { OSWindow } from "./OSWindow";
import { TopNavBar } from "./TopNavBar";
import { useActiveProject } from "../hooks/useActiveProject";
import { useAuthStore } from "../store/authStore";
import { LIVE_MODE } from "../lib/env";

export default function AppShell() {
  const navigate = useNavigate();
  const [showAgentFleet, setShowAgentFleet] = useState(false);

  // Project context resolution for global shortcuts (shared with TopNavBar)
  const { projectPath } = useActiveProject();
  const user = useAuthStore((st) => st.user);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey) {
        if (e.key === "1") navigate("/projects");
        if (e.key === "2") navigate(projectPath("workspace"));
        if (e.key === "3") navigate(projectPath("flow"));
        if (e.key === "4") navigate(projectPath("initiatives"));
        if (e.key === "5") navigate(projectPath("reviews"));
        if (e.key === "6") navigate("/marketplace");
        if (e.key === "7") navigate(projectPath("files"));
        if (e.key === "8") navigate(projectPath("history"));
        if (e.key === "9") navigate("/models");
        if (e.key === "0") navigate("/billing");
        if (e.key === ",") navigate(projectPath("settings"));
        if (e.key.toLowerCase() === "l") navigate("/launch");
        if (e.key.toLowerCase() === "h") navigate("/home");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, projectPath]);

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden text-ink select-none font-sans bg-base">
      {/* Redesigned High-Performance Top Navigation Bar */}
      <TopNavBar
        onOpenAgentFleet={() => setShowAgentFleet(true)}
        activeAgentCount={LIVE_MODE ? undefined : 3}
        creditsBalance={LIVE_MODE ? user?.credits : 1247}
      />

      {/* Viewport Canvas Area */}
      <div className="flex-1 min-h-0 relative flex overflow-hidden">
        <main
          id="os-desktop-canvas"
          className="flex-1 min-w-0 min-h-0 relative flex flex-col overflow-y-auto bg-base"
        >
          <Outlet />
        </main>
      </div>

      {/* Global Command Palette */}
      <CommandPalette />

      {/* Agent Fleet Modal Window */}
      {showAgentFleet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl h-[520px]">
            <OSWindow
              id="os-modal-agent-fleet"
              title="AGENT_FLEET_MONITOR.SYS"
              icon={Bot}
              status="ONLINE · 3 AGENTS"
              onClose={() => setShowAgentFleet(false)}
              className="h-full shadow-[8px_8px_0px_0px_#000] dark:shadow-[8px_8px_0px_0px_#fff]"
              bodyClassName="p-4"
            >
              <div className="h-full flex flex-col gap-3 font-mono text-xs">
                <div className="p-3 bg-[#F4F0EA] dark:bg-[#202028] border-2 border-black dark:border-white/80 flex items-center justify-between">
                  <span className="font-bold">ACTIVE WORKSPACE TOPOLOGY</span>
                  <span className="px-2 py-0.5 bg-emerald-400 text-black font-black border border-black text-[10px]">
                    AUTONOMOUS
                  </span>
                </div>
                <div className="flex-1 border-2 border-black dark:border-white/80 p-2 overflow-hidden bg-white dark:bg-[#15151C]">
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
