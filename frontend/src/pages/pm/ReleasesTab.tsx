import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Loader2, Rocket } from "lucide-react";
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
      toast.error("Couldn't generate the release plan.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
      {/* Section header */}
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Rocket size={12} aria-hidden="true" />
        </span>
        <h2 className="font-display text-sm font-semibold text-ink">Releases</h2>
      </div>

      {/* Generate bar */}
      <motion.div className="mb-6 flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 backdrop-blur-xl" variants={motionVariants.fadeIn}>
        <input
          value={version}
          onChange={e => setVersion(e.target.value)}
          placeholder="v1.0.0"
          className="h-9 w-32 bg-transparent border border-white/10 rounded-xl px-3 text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        />
        <motion.button
          onClick={handleGenerate}
          disabled={generating}
          {...presets.button}
          className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-accent text-white text-sm font-medium hover:opacity-90 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 transition-opacity disabled:opacity-50"
        >
          {generating ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Plus size={13} aria-hidden="true" />}
          Create release
        </motion.button>
      </motion.div>

      {/* Release cards */}
      {releases === null ? (
        <motion.p className="text-sm text-faint" variants={motionVariants.fadeIn}>Loading…</motion.p>
      ) : releases.length === 0 ? (
        <motion.div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center backdrop-blur-xl" variants={motionVariants.fadeIn}>
          <p className="text-sm text-faint">No releases yet. Create your first release above.</p>
        </motion.div>
      ) : (
        <motion.div className="grid grid-cols-1 gap-3 md:grid-cols-2" variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
          {releases.map((release, i) => (
            <motion.article
              key={release.id}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-xl transition-all duration-200 hover:border-white/15 hover:shadow-m3"
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