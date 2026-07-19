import { usePMStore } from "../../store/pmStore";
import { motion, motionVariants } from "../../lib/animations";

export default function RoadmapTab() {
  const { initiative, epics } = usePMStore();
  const roadmap: { phase: string; goal: string; duration: string }[] = initiative?.roadmap ?? [];

  return (
    <div className="px-6 md:px-8 py-6 max-w-3xl">
      <motion.section className="mb-10" variants={motionVariants.fadeUp} initial="hidden" animate="visible">
        <h2 className="text-xs uppercase tracking-[0.14em] text-muted mb-5">Roadmap</h2>
        {roadmap.length === 0 ? (
          <motion.p className="text-sm text-faint" variants={motionVariants.fadeIn}>Not generated yet.</motion.p>
        ) : (
          <ol className="relative border-l border-border pl-6 space-y-8">
            {roadmap.map((phase, i) => (
              <motion.li
                key={i}
                className="relative"
                variants={motionVariants.staggerItem}
                custom={i}
                whileHover={{ x: 4, transition: { type: "spring", stiffness: 400, damping: 20 } }}
              >
                <span className="absolute -left-[29px] top-0.5 w-3 h-3 rounded-full bg-ink border-2 border-base" aria-hidden="true" />
                <p className="text-sm font-medium text-ink mb-0.5">{phase.phase}</p>
                <p className="text-xs text-faint mb-1.5">{phase.duration}</p>
                <p className="text-sm text-muted leading-relaxed">{phase.goal}</p>
              </motion.li>
            ))}
          </ol>
        )}
      </motion.section>

      <motion.section variants={motionVariants.fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.15 }}>
        <h2 className="text-xs uppercase tracking-[0.14em] text-muted mb-5">Epics by priority</h2>
        {epics.length === 0 ? (
          <motion.p className="text-sm text-faint" variants={motionVariants.fadeIn}>Not generated yet.</motion.p>
        ) : (
          <motion.div className="space-y-2" variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
            {[...epics]
              .sort((a, b) => a.priority.localeCompare(b.priority))
              .map((epic, i) => (
                <motion.div
                  key={epic.id}
                  className="flex items-center gap-3 py-2 border-b border-border-soft"
                  variants={motionVariants.staggerItem}
                  custom={i}
                  whileHover={{ backgroundColor: "rgba(255,255,255,0.02)", transition: { duration: 0.15 } }}
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
