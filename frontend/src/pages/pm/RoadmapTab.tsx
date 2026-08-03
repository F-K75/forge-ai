import { Map, Layers } from "lucide-react";
import { usePMStore } from "../../store/pmStore";
import { motion, motionVariants } from "../../lib/animations";

export default function RoadmapTab() {
  const { initiative, epics } = usePMStore();
  const roadmap: { phase: string; goal: string; duration: string }[] = initiative?.roadmap ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
      {/* Section: Roadmap timeline */}
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Map size={12} aria-hidden="true" />
        </span>
        <h2 className="font-display text-sm font-semibold text-ink">Roadmap</h2>
      </div>
      <motion.section className="mb-8 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-xl" variants={motionVariants.fadeUp} initial="hidden" animate="visible">
        {roadmap.length === 0 ? (
          <motion.p className="text-sm text-faint" variants={motionVariants.fadeIn}>Not generated yet.</motion.p>
        ) : (
          <ol className="relative border-l border-white/10 pl-6 space-y-6">
            {roadmap.map((phase, i) => (
              <motion.li
                key={i}
                className="relative"
                variants={motionVariants.staggerItem}
                custom={i}
                whileHover={{ x: 4, transition: { type: "spring", stiffness: 400, damping: 20 } }}
              >
                <span className="absolute -left-[27px] top-0.5 w-3 h-3 rounded-full bg-accent border-2 border-base" aria-hidden="true" />
                <p className="text-sm font-medium text-ink mb-0.5">{phase.phase}</p>
                <p className="text-xs text-faint mb-1.5">{phase.duration}</p>
                <p className="text-sm text-muted leading-relaxed">{phase.goal}</p>
              </motion.li>
            ))}
          </ol>
        )}
      </motion.section>

      {/* Section: Epics */}
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Layers size={12} aria-hidden="true" />
        </span>
        <h2 className="font-display text-sm font-semibold text-ink">Epics by priority</h2>
      </div>
      <motion.section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 backdrop-blur-xl" variants={motionVariants.fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.15 }}>
        {epics.length === 0 ? (
          <motion.p className="text-sm text-faint" variants={motionVariants.fadeIn}>Not generated yet.</motion.p>
        ) : (
          <motion.div className="space-y-1.5" variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
            {[...epics]
              .sort((a, b) => a.priority.localeCompare(b.priority))
              .map((epic, i) => (
                <motion.div
                  key={epic.id}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 border border-white/[0.04] bg-white/[0.01] transition-all duration-200 hover:border-white/10 hover:bg-white/[0.03]"
                  variants={motionVariants.staggerItem}
                  custom={i}
                >
                  <span className="text-[10px] font-mono uppercase text-faint w-6 shrink-0">{epic.priority}</span>
                  <span className="text-sm text-ink flex-1 min-w-0 truncate">{epic.title}</span>
                  <span className="text-xs text-muted shrink-0">{epic.estimated_duration}</span>
                  <span className="text-xs text-faint shrink-0 w-16 text-right">{epic.story_points} pts</span>
                </motion.div>
              ))}
          </motion.div>
        )}
      </motion.section>
    </div>
  );
}