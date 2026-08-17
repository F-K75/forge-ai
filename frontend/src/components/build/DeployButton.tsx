import { useRef, useState } from "react";
import { Rocket, Loader2, ExternalLink, AlertCircle } from "lucide-react";
import { motion } from "motion/react";
import toast from "react-hot-toast";
import { useBuildStore } from "../../store/buildStore";
import { useDeploymentStore } from "../../store/deploymentStore";
import { deploymentsApi } from "../../lib/api";
import { LIVE_MODE } from "../../lib/env";
import { runMockDeployment } from "../../lib/mockEmitter";
import { useGsapTo } from "../../lib/animations";
import { presets } from "../../lib/animationPresets";

const BUSY_LABEL: Record<string, string> = {
  pending: "Preparing…",
  building: "Building…",
  deploying: "Deploying…",
};

// Deployment status is a discrete phase, not a percentage — approximate a
// progress bar position from the current phase.
const PROGRESS_BY_STATUS: Record<string, number> = {
  pending: 15,
  building: 55,
  deploying: 85,
};

export function DeployButton({ projectId }: { projectId: string }) {
  const buildStatus = useBuildStore((s) => s.status);
  const buildId = useBuildStore((s) => s.buildId);
  const deployment = useDeploymentStore();
  const [triggering, setTriggering] = useState(false);

  const progressRef = useRef<HTMLDivElement | null>(null);

  const busy = triggering || ["pending", "building", "deploying"].includes(deployment.status);

  // GSAP progress bar driven by deployment phase.
  const progress = busy ? PROGRESS_BY_STATUS[deployment.status] ?? 35 : 0;
  useGsapTo(
    progressRef.current,
    { width: `${progress}%`, duration: 0.6, ease: "power2.out" },
    [progress]
  );

  if (buildStatus !== "complete" || !buildId) return null;

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
      toast.error(err?.response?.data?.detail || "Couldn't start the deployment.");
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
      ? BUSY_LABEL[deployment.status] ?? "Starting…"
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
        <motion.a
          href={deployment.url}
          target="_blank"
          rel="noopener noreferrer"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1, transition: { type: "spring", stiffness: 300, damping: 20 } }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ok hover:underline"
        >
          <ExternalLink size={13} aria-hidden="true" /> View live app
        </motion.a>
      </>
    );
  }

  if (deployment.status === "failed") {
    return (
      <>
        {liveRegion}
        <motion.button
          type="button"
          onClick={handleDeploy}
          variants={presets.notification}
          initial="initial"
          animate="animate"
          whileHover={{ x: 2 }}
          whileTap={{ scale: 0.96 }}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-error hover:underline"
        >
          <AlertCircle size={13} aria-hidden="true" /> Deploy failed — retry
        </motion.button>
      </>
    );
  }

  return (
    <>
      {liveRegion}
      <motion.button
        type="button"
        onClick={handleDeploy}
        disabled={busy}
        variants={presets.button}
        whileHover={busy ? undefined : presets.button.whileHover}
        whileTap={busy ? undefined : presets.button.whileTap}
        transition={presets.button.whileHover?.transition}
        className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium gradient-ember text-base hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed transition-[filter] overflow-hidden"
      >
        {busy && (
          <>
            <motion.span
              ref={progressRef}
              aria-hidden="true"
              initial={{ width: 0 }}
              className="absolute inset-y-0 left-0 bg-white/20"
            />
            <span className="absolute inset-0 animate-shimmer" aria-hidden="true" />
          </>
        )}
        <span className="relative inline-flex items-center gap-1.5">
          {busy ? (
            <>
              <Loader2 size={13} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              {BUSY_LABEL[deployment.status] ?? "Starting…"}
            </>
          ) : (
            <>
              <motion.span
                key="rocket"
                initial={{ rotate: -8, scale: 0.8 }}
                animate={{ rotate: 0, scale: 1 }}
                className="inline-flex"
              >
                <Rocket size={13} aria-hidden="true" />
              </motion.span>
              Deploy
            </>
          )}
        </span>
      </motion.button>
    </>
  );
}
