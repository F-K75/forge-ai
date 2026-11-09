import { useState } from "react";
import { 
  Globe, 
  Server, 
  ShieldCheck, 
  Zap, 
  CheckCircle2, 
  ExternalLink, 
  Copy, 
  RefreshCw,
  Cpu,
  Database,
  ArrowUpRight
} from "lucide-react";
import { motion } from "motion/react";
import toast from "react-hot-toast";

interface DeployNode {
  region: string;
  location: string;
  latency: string;
  status: "active" | "standby";
  load: string;
}

const REGIONS: DeployNode[] = [
  { region: "iad1", location: "US East (N. Virginia)", latency: "14ms", status: "active", load: "24%" },
  { region: "sfo1", location: "US West (San Francisco)", latency: "18ms", status: "active", load: "19%" },
  { region: "lhr1", location: "Europe (London)", latency: "78ms", status: "active", load: "32%" },
  { region: "hnd1", location: "Asia Pacific (Tokyo)", latency: "112ms", status: "active", load: "15%" },
  { region: "fra1", location: "Europe (Frankfurt)", latency: "82ms", status: "standby", load: "8%" },
];

export function ForgeDeploySurface({ projectName = "forge-app" }: { projectName?: string }) {
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployedAt, setDeployedAt] = useState("Just now");
  const deploymentUrl = `https://${projectName.toLowerCase().replace(/\s+/g, "-")}.forge.edge`;

  const handleRedeploy = () => {
    setIsDeploying(true);
    setTimeout(() => {
      setIsDeploying(false);
      setDeployedAt("Just now");
      toast.success("Deployed latest build to global edge network in 1.4s");
    }, 1400);
  };

  const handleCopyUrl = () => {
    navigator.clipboard?.writeText(deploymentUrl);
    toast.success("Copied deployment URL to clipboard");
  };

  return (
    <div className="h-full w-full bg-[#08090C] text-zinc-100 flex flex-col overflow-y-auto p-6 select-none font-sans">
      <div className="max-w-5xl w-full mx-auto space-y-6">
        {/* Top Header Card */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 backdrop-blur-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-accent/[0.04] rounded-full blur-3xl pointer-events-none" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Production Edge Ready
                </span>
                <span className="text-xs font-mono text-zinc-500">v1.4.2 · commit 7e2f1a</span>
              </div>
              <h2 className="text-xl font-medium tracking-tight text-white mt-2">
                {projectName} Global Cluster
              </h2>
              <p className="text-xs text-zinc-400 font-mono mt-1">
                Zero-cold-start Edge Runtime · Fastly + Cloudflare + Fly.io Anycast
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleRedeploy}
                disabled={isDeploying}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs font-mono text-zinc-200 transition active:scale-95 disabled:opacity-50"
              >
                <RefreshCw size={13} className={isDeploying ? "animate-spin text-accent" : ""} />
                <span>{isDeploying ? "Synthesizing Edge..." : "Trigger Deploy"}</span>
              </button>

              <a
                href="#preview"
                onClick={(e) => {
                  e.preventDefault();
                  window.open(deploymentUrl, "_blank");
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-white text-xs font-medium hover:brightness-110 shadow-lg shadow-accent/20 transition active:scale-95"
              >
                <span>Visit Live App</span>
                <ArrowUpRight size={13} />
              </a>
            </div>
          </div>

          {/* Quick URL Bar */}
          <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 truncate">
              <Globe size={14} className="text-accent shrink-0" />
              <span className="text-zinc-200 select-all">{deploymentUrl}</span>
            </div>
            <button
              type="button"
              onClick={handleCopyUrl}
              className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08]"
            >
              <Copy size={12} />
              <span>Copy</span>
            </button>
          </div>
        </div>

        {/* Vital Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex items-center justify-between text-zinc-400 text-xs font-mono">
              <span>Avg Latency</span>
              <Zap size={13} className="text-amber-400" />
            </div>
            <div className="text-2xl font-light tracking-tight text-white mt-2 font-mono">18ms</div>
            <div className="text-[11px] text-emerald-400 mt-1 font-mono">99.99% under 45ms</div>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex items-center justify-between text-zinc-400 text-xs font-mono">
              <span>Cold Starts</span>
              <Cpu size={13} className="text-cyan-400" />
            </div>
            <div className="text-2xl font-light tracking-tight text-white mt-2 font-mono">0.0ms</div>
            <div className="text-[11px] text-zinc-400 mt-1 font-mono">V8 Isolate warm pool</div>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex items-center justify-between text-zinc-400 text-xs font-mono">
              <span>Edge DB Sync</span>
              <Database size={13} className="text-accent" />
            </div>
            <div className="text-2xl font-light tracking-tight text-white mt-2 font-mono">Synced</div>
            <div className="text-[11px] text-emerald-400 mt-1 font-mono">5 read replicas live</div>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex items-center justify-between text-zinc-400 text-xs font-mono">
              <span>SSL & DDoS</span>
              <ShieldCheck size={13} className="text-emerald-400" />
            </div>
            <div className="text-2xl font-light tracking-tight text-white mt-2 font-mono">Shielded</div>
            <div className="text-[11px] text-zinc-400 mt-1 font-mono">Auto-rotated TLS 1.3</div>
          </div>
        </div>

        {/* Global Edge Nodes Table */}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between bg-white/[0.01]">
            <div className="flex items-center gap-2">
              <Server size={14} className="text-accent" />
              <span className="text-xs font-mono font-medium text-zinc-200">Active Anycast PoPs (5 Active)</span>
            </div>
            <span className="text-[11px] font-mono text-zinc-500">Live Telemetry</span>
          </div>

          <div className="divide-y divide-white/[0.04]">
            {REGIONS.map((pop) => (
              <div
                key={pop.region}
                className="px-5 py-3 flex items-center justify-between hover:bg-white/[0.02] transition font-mono text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${pop.status === "active" ? "bg-emerald-400" : "bg-amber-400/80"}`} />
                  <div>
                    <span className="text-white font-medium">{pop.region.toUpperCase()}</span>
                    <span className="text-zinc-500 text-[11px] ml-2">{pop.location}</span>
                  </div>
                </div>

                <div className="flex items-center gap-6 text-zinc-400">
                  <span className="text-emerald-400">{pop.latency}</span>
                  <span className="text-zinc-500">load {pop.load}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-white/[0.04] text-zinc-300">
                    {pop.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
