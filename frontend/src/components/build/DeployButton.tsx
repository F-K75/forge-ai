import { useState } from "react";
import { Rocket, Loader2, ExternalLink, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import { useBuildStore } from "../../store/buildStore";
import { useDeploymentStore } from "../../store/deploymentStore";
import { deploymentsApi } from "../../lib/api";
import { LIVE_MODE } from "../../lib/env";
import { runMockDeployment } from "../../lib/mockEmitter";

const BUSY_LABEL: Record<string, string> = {
  pending: "Queued…",
  building: "Building image…",
  deploying: "Deploying…",
};

export function DeployButton({ projectId }: { projectId: string }) {
  const buildStatus = useBuildStore((s) => s.status);
  const buildId = useBuildStore((s) => s.buildId);
  const deployment = useDeploymentStore();
  const [triggering, setTriggering] = useState(false);

  if (buildStatus !== "complete" || !buildId) return null;

  const busy = triggering || ["pending", "building", "deploying"].includes(deployment.status);

  const handleDeploy = async () => {
    setTriggering(true);
    try {
      if (LIVE_MODE) {
        const { deployment_id } = await deploymentsApi.create({ build_id: buildId, project_id: projectId });
        deployment.startDeployment(deployment_id);
        // Status/url updates arrive over the already-open build socket
        // (see buildStore.handleEvent's deployment_id guard).
      } else {
        const deploymentId = `deploy-${Date.now().toString(36)}`;
        deployment.startDeployment(deploymentId);
        runMockDeployment(deploymentId, deployment.handleEvent);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to start deployment");
    } finally {
      setTriggering(false);
    }
  };

  // A visually-hidden live region announces status changes to screen readers
  // — the button itself swaps between three different elements below (link,
  // retry button, deploy button), which alone gives no announcement when the
  // user isn't focused on it (e.g. right after triggering a deploy).
  const announcement =
    deployment.status === "live" && deployment.url
      ? "Deployment live"
      : deployment.status === "failed"
      ? "Deployment failed"
      : busy
      ? BUSY_LABEL[deployment.status] ?? "Starting deployment"
      : null;

  const liveRegion = (
    <span role="status" aria-live="polite" className="sr-only">
      {announcement}
    </span>
  );

  if (deployment.status === "live" && deployment.url) {
    return (
      <>
        {liveRegion}
        <a
          href={deployment.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ok hover:underline"
        >
          <ExternalLink size={13} aria-hidden="true" /> View live app
        </a>
      </>
    );
  }

  if (deployment.status === "failed") {
    return (
      <>
        {liveRegion}
        <button
          type="button"
          onClick={handleDeploy}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-error hover:underline"
        >
          <AlertCircle size={13} aria-hidden="true" /> Deploy failed — retry
        </button>
      </>
    );
  }

  return (
    <>
      {liveRegion}
      <button
        type="button"
        onClick={handleDeploy}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-ink text-base hover:bg-ink/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {busy ? (
          <>
            <Loader2 size={13} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            {BUSY_LABEL[deployment.status] ?? "Starting…"}
          </>
        ) : (
          <>
            <Rocket size={13} aria-hidden="true" /> Deploy
          </>
        )}
      </button>
    </>
  );
}
