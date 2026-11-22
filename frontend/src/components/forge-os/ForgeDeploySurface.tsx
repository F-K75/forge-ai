import { useState } from "react";
import {
  Globe,
  Server,
  ShieldCheck,
  Zap,
  Copy,
  RefreshCw,
  Cpu,
  Database,
  ArrowUpRight,
} from "lucide-react";
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
    <div className="h-full w-full bg-base text-ink flex flex-col overflow-y-auto p-4 sm:p-6 select-none">
      <div className="max-w-5xl w-full mx-auto space-y-5">
        {/* Top Cluster Summary Card */}
        <div className="rounded-xl border border-border bg-panel p-5 shadow-apple space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3 flex-wrap text-xs font-mono">
                <span className="inline-flex items-center gap-1.5 text-ok font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-ok" />
                  Production Edge Ready
                </span>
                <span className="text-muted tabular-nums">
                  v1.4.2 · Commit 7e2f1a · Updated {deployedAt}
                </span>
              </div>
              <h2 className="font-display text-lg sm:text-xl font-semibold tracking-tight text-ink">
                {projectName} Global Cluster
              </h2>
              <p className="text-xs text-muted">
                Zero-cold-start Edge Runtime · Multi-region Anycast routing
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleRedeploy}
                disabled={isDeploying}
                className="h-9 px-3.5 rounded-lg border border-border bg-panel-alt hover:bg-base text-ink text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors duration-150 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer"
              >
                <RefreshCw size={13} className={isDeploying ? "animate-spin" : ""} />
                <span>{isDeploying ? "Deploying…" : "Trigger Deploy"}</span>
              </button>

              <a
                href={deploymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 px-3.5 rounded-lg bg-accent hover:bg-ember-glow text-white text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <span>Visit Live App</span>
                <ArrowUpRight size={14} />
              </a>
            </div>
          </div>

          {/* Deployment Endpoint Bar */}
          <div className="pt-3.5 border-t border-border flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-mono min-w-0">
              <Globe size={14} className="text-ok shrink-0" />
              <span className="font-medium text-ink select-all truncate">{deploymentUrl}</span>
            </div>
            <button
              type="button"
              onClick={handleCopyUrl}
              className="h-7 px-2.5 rounded-md border border-border bg-panel-alt hover:bg-base text-ink text-xs font-medium flex items-center gap-1.5 shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer"
            >
              <Copy size={12} className="text-muted" />
              <span>Copy URL</span>
            </button>
          </div>
        </div>

        {/* Vital Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border bg-panel p-4 shadow-apple">
            <div className="flex items-center justify-between text-muted text-xs">
              <span>Avg Latency</span>
              <Zap size={14} className="text-warn" />
            </div>
            <div className="font-mono text-2xl font-semibold tracking-tight text-ink mt-1.5 tabular-nums">
              18ms
            </div>
            <div className="text-xs text-ok mt-1 tabular-nums">99.99% under 45ms</div>
          </div>

          <div className="rounded-xl border border-border bg-panel p-4 shadow-apple">
            <div className="flex items-center justify-between text-muted text-xs">
              <span>Cold Starts</span>
              <Cpu size={14} className="text-accent" />
            </div>
            <div className="font-mono text-2xl font-semibold tracking-tight text-ink mt-1.5 tabular-nums">
              0.0ms
            </div>
            <div className="text-xs text-muted mt-1">V8 Isolate warm pool</div>
          </div>

          <div className="rounded-xl border border-border bg-panel p-4 shadow-apple">
            <div className="flex items-center justify-between text-muted text-xs">
              <span>Edge DB Sync</span>
              <Database size={14} className="text-accent" />
            </div>
            <div className="font-mono text-2xl font-semibold tracking-tight text-ink mt-1.5">
              Synced
            </div>
            <div className="text-xs text-ok mt-1 tabular-nums">5 read replicas</div>
          </div>

          <div className="rounded-xl border border-border bg-panel p-4 shadow-apple">
            <div className="flex items-center justify-between text-muted text-xs">
              <span>TLS &amp; Shield</span>
              <ShieldCheck size={14} className="text-ok" />
            </div>
            <div className="font-mono text-2xl font-semibold tracking-tight text-ink mt-1.5">
              Active
            </div>
            <div className="text-xs text-muted mt-1">Auto-rotated TLS 1.3</div>
          </div>
        </div>

        {/* Global Edge Nodes Table */}
        <div className="rounded-xl border border-border bg-panel shadow-apple overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-panel-alt">
            <div className="flex items-center gap-2">
              <Server size={14} className="text-muted" />
              <span className="text-xs font-semibold text-ink">
                Active Anycast PoPs ({REGIONS.length})
              </span>
            </div>
            <span className="text-xs font-mono text-muted">Live regional routing</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-panel-alt/50 text-muted font-medium">
                <tr>
                  <th className="px-4 py-2.5">Region</th>
                  <th className="px-4 py-2.5">Location</th>
                  <th className="px-4 py-2.5 text-right">Latency</th>
                  <th className="px-4 py-2.5 text-right">Load</th>
                  <th className="px-4 py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-mono tabular-nums">
                {REGIONS.map((pop) => (
                  <tr
                    key={pop.region}
                    className="hover:bg-panel-alt/50 transition-colors duration-150"
                  >
                    <td className="px-4 py-3 font-semibold text-ink uppercase">
                      {pop.region}
                    </td>
                    <td className="px-4 py-3 font-sans text-muted">{pop.location}</td>
                    <td className="px-4 py-3 text-right text-ok font-medium">{pop.latency}</td>
                    <td className="px-4 py-3 text-right text-muted">{pop.load}</td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`inline-flex items-center gap-1.5 font-sans text-xs font-medium capitalize ${
                          pop.status === "active" ? "text-ok" : "text-warn"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            pop.status === "active" ? "bg-ok" : "bg-warn"
                          }`}
                        />
                        {pop.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
