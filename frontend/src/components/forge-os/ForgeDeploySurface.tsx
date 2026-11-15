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
 <div className="h-full w-full bg-panel-alt dark:bg-[#0D0D12] text-ink flex flex-col overflow-y-auto p-3 sm:p-5 select-none font-mono">
 <div className="max-w-5xl w-full mx-auto space-y-4">
        {/* Top Header Card */}
 <div className="border border-border bg-white dark:bg-[#181822] p-4 sm:p-5 shadow-m3 relative overflow-hidden">
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 relative z-10">
            <div>
 <div className="flex items-center gap-2 flex-wrap">
 <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-400 text-black border border-black text-[10px] font-mono font-black uppercase shadow-m3">
 <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
                  PRODUCTION_EDGE_READY
                </span>
 <span className="text-[10px] font-mono text-muted">V1.4.2 · COMMIT 7E2F1A</span>
              </div>
 <h2 className="text-base sm:text-lg font-black tracking-tight text-ink uppercase mt-1">
                {projectName} Global Cluster
              </h2>
 <p className="text-[11px] text-muted font-mono mt-0.5">
                Zero-cold-start Edge Runtime · Fastly + Cloudflare + Fly.io Anycast
              </p>
            </div>

 <div className="flex items-center gap-2 flex-wrap">
              <button
 type="button"
                onClick={handleRedeploy}
                disabled={isDeploying}
 className="h-7 px-3 bg-white dark:bg-[#252530] hover:bg-accent text-[#09090B] hover:text-black text-ink border border-border text-[11px] font-mono font-black uppercase flex items-center gap-1.5 transition-none active:translate-x-[1px] active:translate-y-[1px] shadow-m3 disabled:opacity-50 cursor-pointer"
              >
 <RefreshCw size={11} strokeWidth={2.5} className={isDeploying ? "animate-spin" : ""} />
 <span>{isDeploying ? "SYNTHESIZING..." : "TRIGGER DEPLOY"}</span>
              </button>

              <a
 href="#preview"
                onClick={(e) => {
                  e.preventDefault();
 window.open(deploymentUrl, "_blank");
                }}
 className="h-7 px-3 bg-[#00F0FF] hover:bg-accent text-[#09090B] text-black border border-border text-[11px] font-mono font-black uppercase flex items-center gap-1 transition-none active:translate-x-[1px] active:translate-y-[1px] shadow-m3 cursor-pointer"
              >
                <span>VISIT LIVE APP</span>
                <ArrowUpRight size={12} strokeWidth={2.5} />
              </a>
            </div>
          </div>

          {/* Quick URL Bar */}
 <div className="mt-3.5 pt-3 border-t-2 border-black dark:border-white/80 flex items-center justify-between gap-3">
 <div className="flex items-center gap-2 text-xs font-mono truncate">
 <Globe size={13} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
 <span className="font-bold text-ink select-all truncate">{deploymentUrl}</span>
            </div>
            <button
 type="button"
              onClick={handleCopyUrl}
 className="h-6 px-2 text-[10px] font-mono font-black uppercase bg-white dark:bg-[#252530] text-ink hover:bg-accent text-[#09090B] hover:text-black border border-black dark:border-white/80 shadow-m3 active:translate-x-[1px] active:translate-y-[1px] flex items-center gap-1 cursor-pointer"
            >
              <Copy size={10} strokeWidth={2.5} />
              <span>COPY</span>
            </button>
          </div>
        </div>

        {/* Vital Metrics Grid */}
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
 <div className="border border-border bg-white dark:bg-[#181822] p-3 shadow-m3 ">
 <div className="flex items-center justify-between text-muted text-[10px] font-mono uppercase font-bold">
              <span>AVG LATENCY</span>
 <Zap size={12} className="text-amber-500" />
            </div>
 <div className="text-xl font-black tracking-tight text-ink mt-1 font-mono">18MS</div>
 <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5 font-mono font-bold">99.99% under 45ms</div>
          </div>

 <div className="border border-border bg-white dark:bg-[#181822] p-3 shadow-m3 ">
 <div className="flex items-center justify-between text-muted text-[10px] font-mono uppercase font-bold">
              <span>COLD STARTS</span>
 <Cpu size={12} className="text-[#00F0FF]" />
            </div>
 <div className="text-xl font-black tracking-tight text-ink mt-1 font-mono">0.0MS</div>
 <div className="text-[10px] text-muted mt-0.5 font-mono">V8 Isolate warm pool</div>
          </div>

 <div className="border border-border bg-white dark:bg-[#181822] p-3 shadow-m3 ">
 <div className="flex items-center justify-between text-muted text-[10px] font-mono uppercase font-bold">
              <span>EDGE DB SYNC</span>
 <Database size={12} className="text-[#00F0FF]" />
            </div>
 <div className="text-xl font-black tracking-tight text-ink mt-1 font-mono">SYNCED</div>
 <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5 font-mono font-bold">5 read replicas</div>
          </div>

 <div className="border border-border bg-white dark:bg-[#181822] p-3 shadow-m3 ">
 <div className="flex items-center justify-between text-muted text-[10px] font-mono uppercase font-bold">
              <span>SSL & DDOS</span>
 <ShieldCheck size={12} className="text-emerald-500" />
            </div>
 <div className="text-xl font-black tracking-tight text-ink mt-1 font-mono">SHIELDED</div>
 <div className="text-[10px] text-muted mt-0.5 font-mono">Auto-rotated TLS 1.3</div>
          </div>
        </div>

        {/* Global Edge Nodes Table */}
 <div className="border border-border bg-white dark:bg-[#181822] shadow-m3 overflow-hidden">
 <div className="px-3.5 py-2.5 border-b-2 border-black dark:border-white/80 flex items-center justify-between bg-panel-alt dark:bg-[#1E1E28]">
 <div className="flex items-center gap-1.5">
              <Server size={12} strokeWidth={2.5} />
 <span className="text-xs font-mono font-black uppercase text-ink">ACTIVE ANYCAST POPS (5 ACTIVE)</span>
            </div>
 <span className="text-[10px] font-mono font-bold text-muted">LIVE TELEMETRY</span>
          </div>

 <div className="divide-y-2 divide-black/10 dark:divide-white/10">
            {REGIONS.map((pop) => (
              <div
                key={pop.region}
 className="px-3.5 py-2 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-[#20202C] font-mono text-xs"
              >
 <div className="flex items-center gap-2.5">
 <span className={`w-2 h-2 border border-black ${pop.status === "active" ? "bg-emerald-400" : "bg-amber-400"}`} />
                  <div>
 <span className="font-black text-ink">{pop.region.toUpperCase()}</span>
 <span className="text-muted text-[10px] ml-2">{pop.location}</span>
                  </div>
                </div>

 <div className="flex items-center gap-3 sm:gap-6 text-ink text-[11px]">
 <span className="text-emerald-600 dark:text-emerald-400 font-bold">{pop.latency}</span>
 <span className="text-muted">load {pop.load}</span>
 <span className="px-1.5 py-0.5 text-[9px] font-black uppercase bg-panel-alt dark:bg-[#2A2A36] border border-black dark:border-white/60">
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
