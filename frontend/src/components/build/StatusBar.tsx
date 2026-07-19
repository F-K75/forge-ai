import { useRef } from "react";
import { Zap, Cpu, Bug, Wifi, WifiOff } from "lucide-react";
import { useBuildStore } from "../../store/buildStore";
import { LIVE_MODE } from "../../lib/env";
import { useGsapTo, useCountUp } from "../../lib/animations";

type ConnectionStatus = "offline" | "connecting" | "online" | "error";

const CONNECTION: Record<ConnectionStatus, { label: string; dot: string; pulse: string; icon: typeof Wifi }> = {
  online:     { label: "connected",    dot: "bg-ok",    pulse: "bg-ok",    icon: Wifi },
  connecting: { label: "connecting…",  dot: "bg-ember", pulse: "bg-ember", icon: Wifi },
  offline:    { label: "offline",      dot: "bg-faint", pulse: "bg-faint", icon: WifiOff },
  error:      { label: "connection error", dot: "bg-error", pulse: "bg-error", icon: WifiOff },
};

export function StatusBar({ connectionStatus }: { connectionStatus: ConnectionStatus }) {
  const tokenCount = useBuildStore((s) => s.tokenCount);
  const creditsUsed = useBuildStore((s) => s.creditsUsed);
  const debug = useBuildStore((s) => s.debug);
  const error = useBuildStore((s) => s.error);

  const conn = CONNECTION[connectionStatus];

  const tokensRef = useRef<HTMLSpanElement | null>(null);
  const creditsRef = useRef<HTMLSpanElement | null>(null);
  const dotRef = useRef<HTMLSpanElement | null>(null);

  // GSAP count-up for the live token and credit tallies.
  useCountUp(tokensRef, tokenCount, 800);
  useCountUp(creditsRef, creditsUsed, 800);

  // GSAP pulse on the connection status dot when (re)connecting or in error.
  useGsapTo(
    dotRef.current,
    conn.pulse === "bg-faint"
      ? { scale: 1, duration: 0.2 }
      : { scale: 1.6, boxShadow: "0 0 0 3px rgba(0,0,0,0.06)", duration: 0.9, repeat: -1, yoyo: true, ease: "sine.inOut" },
    [connectionStatus]
  );

  const ConnIcon = conn.icon;

  return (
    <footer className="h-8 shrink-0 flex items-center gap-4 px-4 bg-base/70 backdrop-blur border-t border-border text-[11px] text-muted">
      <span className="flex items-center gap-1.5">
        <span ref={dotRef} className={`w-1.5 h-1.5 rounded-full ${conn.dot}`} aria-hidden="true" />
        <ConnIcon size={11} aria-hidden="true" />
        {LIVE_MODE ? conn.label : "demo mode"}
      </span>

      {debug && (
        <span className="flex items-center gap-1 text-warn">
          <Bug size={11} aria-hidden="true" />
          debug iteration {debug.iteration}/3
        </span>
      )}

      {error && <span className="text-error truncate">{error}</span>}

      <span className="ml-auto flex items-center gap-4 font-mono">
        <span className="flex items-center gap-1.5" title="Tokens used this build">
          <Cpu size={11} className="text-agent-designer" aria-hidden="true" />
          <span ref={tokensRef} className="tabular-nums text-ink/80">{tokenCount.toLocaleString()}</span> tokens
        </span>

        <span className="flex items-center gap-1.5" title="Credit usage">
          <Zap size={11} className="text-ember" aria-hidden="true" />
          <span ref={creditsRef} className="tabular-nums text-ink/80">{creditsUsed}</span> credits
        </span>
      </span>
    </footer>
  );
}
