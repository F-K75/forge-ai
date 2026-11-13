import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, Rocket } from "lucide-react";
import toast from "react-hot-toast";
import { deploymentsApi } from "../../../lib/api";
import { formatRelativeTime } from "../../../lib/format";

// Mirrors backend core/models.py Deployment (list projection).
interface Deployment {
  id: string;
  build_id?: string | null;
  status: "pending" | "building" | "deploying" | "live" | "failed" | "cancelled" | string;
  target_type?: string;
  url?: string | null;
  created_at?: string;
  deployed_at?: string | null;
}

interface Props {
  projectId: string | null;
  buildId: string | null;
  buildStatus: "idle" | "running" | "debugging" | "complete" | "failed";
}

const ACTIVE = new Set(["pending", "building", "deploying"]);

const STATUS_STYLES: Record<string, string> = {
  live: "bg-emerald-400 text-black",
  failed: "bg-red-500 text-white",
  cancelled: "bg-neutral-300 text-black",
};

// Backend timestamps are naive UTC without a zone suffix.
function asUtc(ts?: string | null): string | undefined {
  if (!ts) return undefined;
  return /([zZ]|[+-]\d\d:?\d\d)$/.test(ts) ? ts : `${ts}Z`;
}

function errorDetail(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === "string" ? detail : fallback;
}

/**
 * Deploy tab for live mode: this project's real deployments, and a button
 * to deploy the latest completed build via POST /deployments/. Deployments
 * are opt-in on the backend (DEPLOYMENTS_ENABLED); when they're off, the
 * API's own explanation is shown instead of a fake success.
 */
export function LiveDeploySurface({ projectId, buildId, buildStatus }: Props) {
  const [deployments, setDeployments] = useState<Deployment[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);

  const load = useCallback(() => {
    if (!projectId) return;
    deploymentsApi
      .list(projectId)
      .then((res: { deployments?: Deployment[] }) => {
        setDeployments(res?.deployments ?? []);
        setLoadError(null);
      })
      .catch((err: unknown) => setLoadError(errorDetail(err, "Couldn't load deployments.")));
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while a deployment is in flight so its status/URL updates in place.
  const hasActive = (deployments ?? []).some((d) => ACTIVE.has(d.status));
  useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [hasActive, load]);

  const canDeploy = Boolean(projectId && buildId && buildStatus === "complete");

  const handleDeploy = async () => {
    if (!projectId || !buildId) return;
    setDeploying(true);
    setDeployError(null);
    try {
      await deploymentsApi.create({ build_id: buildId, project_id: projectId });
      toast.success("Deployment queued");
      load();
    } catch (err) {
      setDeployError(errorDetail(err, "Couldn't start the deployment."));
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 font-mono text-xs space-y-5 text-neutral-900 dark:text-neutral-100">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-black uppercase text-sm">Deployments</h3>
          <p className="text-neutral-500">
            {canDeploy
              ? "Deploy the latest completed build."
              : !buildId
              ? "Run a build first — completed builds can be deployed from here."
              : buildStatus === "failed"
              ? "The latest build failed, so there's nothing to deploy. Fix it and rebuild."
              : "The latest build hasn't finished yet."}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDeploy}
          disabled={!canDeploy || deploying}
          className="inline-flex items-center gap-2 h-9 px-4 border-2 border-black dark:border-white/80 bg-[#FFD731] text-black font-black uppercase disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {deploying ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
          Deploy build
        </button>
      </div>

      {deployError && (
        <p className="p-3 border-2 border-red-500 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 font-sans text-sm">
          {deployError}
        </p>
      )}

      {loadError ? (
        <p className="text-red-600">{loadError}</p>
      ) : deployments === null ? (
        <p className="inline-flex items-center gap-2 text-neutral-500">
          <Loader2 size={12} className="animate-spin" /> Loading deployments…
        </p>
      ) : deployments.length === 0 ? (
        <p className="text-neutral-500">This project hasn't been deployed yet.</p>
      ) : (
        <ul className="space-y-2">
          {deployments.map((d) => (
            <li
              key={d.id}
              className="p-3 border border-black/20 dark:border-white/20 bg-white dark:bg-white/5 flex flex-wrap items-center justify-between gap-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-black uppercase ${
                    STATUS_STYLES[d.status] ?? "bg-amber-200 text-black"
                  }`}
                >
                  {ACTIVE.has(d.status) && <Loader2 size={10} className="animate-spin" />}
                  {d.status}
                </span>
                <span className="text-neutral-500">{d.target_type ?? "docker"}</span>
                <span className="text-neutral-500">{formatRelativeTime(asUtc(d.deployed_at ?? d.created_at))}</span>
                {d.build_id && <span className="text-neutral-400">build {d.build_id.slice(0, 8)}</span>}
              </div>
              {d.url && d.status === "live" && (
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline break-all"
                >
                  {d.url} <ExternalLink size={11} />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
