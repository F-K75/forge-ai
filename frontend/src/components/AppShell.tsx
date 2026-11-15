import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Bot } from "lucide-react";
import { AgentFleetGraph } from "./AgentFleetGraph";
import { CommandPalette } from "./CommandPalette";
import { LeftNavRail } from "./LeftNavRail";
import { TopNavBar } from "./TopNavBar";
import { Dialog } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { useActiveProject } from "../hooks/useActiveProject";
import { useAuthStore } from "../store/authStore";
import { LIVE_MODE } from "../lib/env";

export default function AppShell() {
  const navigate = useNavigate();
  const [showAgentFleet, setShowAgentFleet] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Project context resolution for global shortcuts (shared with TopNavBar)
  const { projectPath } = useActiveProject();
  const user = useAuthStore((st) => st.user);

  // Global Keyboard Shortcuts (Alt+1..0, Alt+,, Alt+L, Alt+H)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey) {
        if (e.key === "1") navigate("/projects");
        if (e.key === "2") navigate(projectPath("workspace"));
        if (e.key === "3") navigate(projectPath("agents"));
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
    <div className="relative flex h-[100dvh] flex-col overflow-hidden text-ink font-sans bg-base">
      {/* Compact Top Context Bar (56px / h-14) */}
      <TopNavBar
        onOpenAgentFleet={() => setShowAgentFleet(true)}
        activeAgentCount={LIVE_MODE ? undefined : 3}
        creditsBalance={LIVE_MODE ? user?.credits : 1247}
        mobileNavOpen={mobileNavOpen}
        onToggleMobileNav={() => setMobileNavOpen((v) => !v)}
      />

      {/* Shell Body: Collapsible Left Rail + Main Content Canvas */}
      <div className="flex-1 min-h-0 relative flex overflow-hidden">
        <LeftNavRail
          mobileOpen={mobileNavOpen}
          onCloseMobile={() => setMobileNavOpen(false)}
        />

        <main
          id="os-desktop-canvas"
          className="flex-1 min-w-0 min-h-0 relative flex flex-col overflow-y-auto bg-base"
        >
          <Outlet />
        </main>
      </div>

      {/* Global Command Palette */}
      <CommandPalette />

      {/* Agent Fleet Monitor Dialog */}
      <Dialog
        open={showAgentFleet}
        onOpenChange={setShowAgentFleet}
        title="Agent Fleet Monitor"
        description="Active autonomous workspace topology"
        size="xl"
        footer={
          <Button variant="secondary" size="sm" onClick={() => setShowAgentFleet(false)}>
            Close
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="px-3 py-2 rounded-lg bg-panel-alt border border-border flex items-center justify-between text-xs font-mono">
            <span className="flex items-center gap-2 font-medium text-ink">
              <Bot size={14} className="text-accent" />
              Active Workspace Topology
            </span>
            <span className="px-2 py-0.5 rounded-md bg-ok/15 text-ok font-semibold text-[11px]">
              ONLINE · AUTONOMOUS
            </span>
          </div>
          <div className="h-[340px] rounded-lg border border-border p-2 overflow-hidden bg-base">
            <AgentFleetGraph />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
