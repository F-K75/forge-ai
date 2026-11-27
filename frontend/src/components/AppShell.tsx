import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Box, X } from "lucide-react";
import { AgentFleetGraph } from "./AgentFleetGraph";
import { CommandPalette } from "./CommandPalette";
import { LeftNavRail } from "./LeftNavRail";
import { TopNavBar } from "./TopNavBar";
import { Button } from "./ui/Button";
import { useActiveProject } from "../hooks/useActiveProject";
import { useFleetOverview } from "../hooks/useFleetOverview";
import { useAuthStore } from "../store/authStore";

/** Alt-key shortcuts. Keep in sync with SHORTCUTS in LeftNavRail's help dialog. */
const GLOBAL_SHORTCUTS: Record<string, string> = {
  "1": "/projects",
  "6": "/marketplace",
  "9": "/models",
  "0": "/billing",
  c: "/command",
  l: "/launch",
  d: "/studio-3d",
  h: "/home",
};

const PROJECT_SHORTCUTS: Record<string, string> = {
  "2": "workspace",
  "3": "agents",
  "4": "initiatives",
  "5": "reviews",
  "7": "files",
  "8": "history",
  ",": "settings",
};

export default function AppShell() {
  const navigate = useNavigate();
  const { projectPath } = useActiveProject();
  const user = useAuthStore((s) => s.user);
  const { data: fleet } = useFleetOverview();
  const [showAgentFleet, setShowAgentFleet] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const fleetCloseRef = useRef<HTMLButtonElement>(null);

  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      // Use the physical key so macOS Option-combos (e.g. ⌥C → "ç") still work.
      const key = e.code.startsWith("Digit")
        ? e.code.slice(5)
        : e.code.startsWith("Key")
          ? e.code.slice(3).toLowerCase()
          : e.code === "Comma"
            ? ","
            : e.key.toLowerCase();
      if (GLOBAL_SHORTCUTS[key]) navigate(GLOBAL_SHORTCUTS[key]);
      else if (PROJECT_SHORTCUTS[key]) navigate(projectPath(PROJECT_SHORTCUTS[key]));
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, projectPath]);

  useEffect(() => {
    if (!showAgentFleet) return;
    fleetCloseRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowAgentFleet(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showAgentFleet]);

  const agentsWorking = fleet?.stats.agentsWorking ?? 0;

  return (
    <div className="relative flex h-[100dvh] overflow-hidden bg-base font-sans text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-pill focus:bg-ink focus:px-4 focus:py-2 focus:text-caption focus:font-medium focus:text-[rgb(var(--bg))]"
      >
        Skip to main content
      </a>

      <LeftNavRail mobileOpen={mobileNavOpen} onCloseMobile={closeMobileNav} />

      <div className="relative flex min-w-0 flex-1 flex-col">
        <TopNavBar
          onOpenAgentFleet={() => setShowAgentFleet(true)}
          activeAgentCount={agentsWorking}
          creditsBalance={user?.credits ?? 1247}
          onToggleMobileNav={() => setMobileNavOpen((v) => !v)}
          mobileNavOpen={mobileNavOpen}
        />

        <main
          id="main-content"
          tabIndex={-1}
          className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-base focus:outline-none"
        >
          <Outlet />
        </main>
      </div>

      <CommandPalette />

      {showAgentFleet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-base/70 backdrop-blur-sm"
            onClick={() => setShowAgentFleet(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="agent-fleet-title"
            className="relative flex h-[560px] max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-apple-float"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border-soft px-5 py-3.5">
              <div className="min-w-0">
                <h2 id="agent-fleet-title" className="text-body font-medium text-ink">
                  Agent fleet topology
                </h2>
                <p className="text-xs font-normal text-muted">
                  <span className="font-mono tabular-nums text-ink">{agentsWorking}</span> agents
                  working right now
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setShowAgentFleet(false);
                    navigate("/studio-3d");
                  }}
                >
                  <Box size={13} aria-hidden="true" />
                  Open 3D Studio
                </Button>
                <button
                  ref={fleetCloseRef}
                  type="button"
                  onClick={() => setShowAgentFleet(false)}
                  aria-label="Close agent fleet"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 p-3">
              <AgentFleetGraph />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
