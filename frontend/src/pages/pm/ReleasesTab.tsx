import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Loader2 } from "lucide-react";
import { usePMStore } from "../../store/pmStore";
import { releasesApi } from "../../lib/pmApi";
import { StatusPill } from "../../components/StatusPill";
import { motion, motionVariants } from "../../lib/animations";
import { presets } from "../../lib/animationPresets";

const READINESS_LABEL: Record<string, string> = {
  ready: "Ready to ship",
  in_progress: "In progress",
  blocked: "Blocked",
  not_ready: "Not ready",
};

export default function ReleasesTab() {
  const { initiative } = usePMStore();
  const [releases, setReleases] = useState<any[] | null>(null);
  const [version, setVersion] = useState("v1.0.0");
  const [generating, setGenerating] = useState(false);

  const load = () => {
    if (!initiative) return;
    releasesApi.list(initiative.id).then(setReleases).catch(() => setReleases([]));
  };

  useEffect(load, [initiative]);

  const handleGenerate = async () => {
    if (!initiative || !version.trim()) return;
    setGenerating(true);
    try {
      await releasesApi.generate(initiative.id, version.trim());
      load();
      toast.success("Release plan generated");
    } catch {
      toast.error("Failed to generate release");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="px-6 md:px-8 py-6 max-w-3xl">
      <motion.div className="flex items-center gap-2 mb-8" variants={motionVariants.fadeIn}>
        <input
          value={version}
          onChange={e => setVersion(e.target.value)}
          placeholder="v1.0.0"
          className="h-9 w-32 bg-transparent border border-border rounded-md px-3 text-sm text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40"
        />
        <motion.button
          onClick={handleGenerate}
          disabled={generating}
          {...presets.button}
          className="flex items-center gap-1.5 h-9 px-4 rounded-md bg-ink text-base text-sm font-medium hover:bg-ink/90 active:scale-[0.98] focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 transition-colors motion-reduce:transition-none disabled:opacity-50"
        >
          {generating ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Plus size={13} aria-hidden="true" />}
          Generate release
        </motion.button>
      </motion.div>

      {releases === null ? (
        <motion.p className="text-sm text-faint" variants={motionVariants.fadeIn}>Loading…</motion.p>
      ) : releases.length === 0 ? (
        <motion.p className="text-sm text-faint" variants={motionVariants.fadeIn}>No releases yet.</motion.p>
      ) : (
        <motion.div className="space-y-4" variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
          {releases.map((release, i) => (
            <motion.article
              key={release.id}
              className="border border-border rounded-lg p-5"
              custom={i}
              {...presets.card}
              variants={motionVariants.staggerItem}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-mono text-sm font-medium text-ink">{release.version}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted">{release.confidence_score}% confidence</span>
                  <StatusPill status={release.status === "released" ? "complete" : release.status === "in_progress" ? "running" : "pending"} />
                </div>
              </div>
              <p className="text-xs text-muted mb-3">{READINESS_LABEL[release.deployment_readiness] ?? release.deployment_readiness} · QA {release.qa_status}</p>

              {release.features?.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-medium text-muted mb-1">Features</p>
                  <ul className="text-sm text-ink space-y-0.5">
                    {release.features.map((f: string, i: number) => <li key={i}>— {f}</li>)}
                  </ul>
                </div>
              )}

              {release.blocked_items?.length > 0 && (
                <div className="mb-1">
                  <p className="text-xs font-medium text-error mb-1">Blocked</p>
                  <ul className="text-sm text-ink space-y-0.5">
                    {release.blocked_items.map((f: string, i: number) => <li key={i}>— {f}</li>)}
                  </ul>
                </div>
              )}
            </motion.article>
          ))}
        </motion.div>
      )}
    </div>
  );
}
