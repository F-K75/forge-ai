import { AgentFleetGraph } from "../components/AgentFleetGraph";
import { motion, motionVariants } from "../lib/animations";

export default function FlowPage() {
  return (
    <div className="mx-auto px-4 pb-16 md:px-8">
      <section aria-label="Agent flow" className="relative pt-8 md:pt-12">
        <motion.div
          variants={motionVariants.staggerContainer}
          initial="hidden"
          animate="visible"
          className="min-w-0"
        >
          <motion.h1
            variants={motionVariants.staggerItem}
            className="font-display text-3xl font-semibold leading-[1.1] tracking-tight text-ink md:text-4xl"
          >
            Agent Flow
          </motion.h1>
          <motion.p variants={motionVariants.staggerItem} className="mt-3 text-[15px] leading-relaxed text-muted">
            Explore the build pipeline and gateway agents that power Forge. Click a node to inspect status, credits, and last-run details.
          </motion.p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="mt-6"
        >
          <AgentFleetGraph embedded={false} />
        </motion.div>
      </section>
    </div>
  );
}
