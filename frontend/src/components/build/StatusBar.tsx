import { Zap, Cpu, Bug } from "lucide-react";
import { useBuildStore } from "../../store/buildStore";
import { LIVE_MODE } from "../../lib/env";

type ConnectionStatus = "offline" | "connecting" | "online" | "error";

const CONNECTION: Record<ConnectionStatus, { label: string; dot: string }> = {
  online:     { label: "connected",    dot: "bg-ok" },
  connecting: { label: "connecting…",  dot: "bg-warn" },
  offline:    { label: "offline",      dot: "bg-faint" },
  error:      { label: "connection error", dot: "bg-error" },
};

export function StatusBar({ connectionStatus }: { connectionStatus: ConnectionStatus }) {
  const tokenCount = useBuildStore((s) => s.tokenCount);
  const creditsUsed = useBuildStore((s) => s.creditsUsed);
  const debug = useBuildStore((s) => s.debug);
  const error = useBuildStore((s) => s.error);

  const conn = CONNECTION[connectionStatus];

  return (
    <footer className="h-7 shrink-0 flex items-center gap-4 px-3 bg-base border-t border-border text-[11px] text-muted">
      <span className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${conn.dot}`} aria-hidden="true" />
        {LIVE_MODE ? conn.label : "demo mode"}
      </span>

      <span className="flex items-center gap-1 font-mono">
        <Cpu size={11} className="text-faint" aria-hidden="true" />
        {tokenCount.toLocaleString()} tokens
      </span>

      <span className="flex items-center gap-1 font-mono">
        <Zap size={11} className="text-faint" aria-hidden="true" />
        {creditsUsed} credits
      </span>

      {debug && (
        <span className="flex items-center gap-1 text-warn">
          <Bug size={11} aria-hidden="true" />
          debug iteration {debug.iteration}/3
        </span>
      )}

      {error && <span className="text-error truncate">{error}</span>}
    </footer>
  );
}
