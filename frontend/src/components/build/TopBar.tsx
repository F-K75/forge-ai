import { ArrowLeft, ChevronRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { useBuildStore } from "../../store/buildStore";
import { DeployButton } from "./DeployButton";
import { motionVariants } from "../../lib/animations";

const STATUS_META: Record<
  ReturnType<typeof useBuildStore.getState>["status"],
  { label: string; dot: string; pulse?: boolean }
> = {
  idle: { label: "Ready", dot: "bg-faint" },
  running: { label: "Building", dot: "bg-ember", pulse: true },
  debugging: { label: "Refining", dot: "bg-warn", pulse: true },
  complete: { label: "Live", dot: "bg-ok" },
  failed: { label: "Failed", dot: "bg-error" },
};

export function TopBar({ projectName, projectId }: { projectName: string; projectId: string }) {
  const status = useBuildStore((s) => s.status);
  const prompt = useBuildStore((s) => s.prompt);
  const agentStates = useBuildStore((s) => s.agentStates);

  const doneCount = Object.values(agentStates).filter((s) => s === "done").length;
  const total = Object.keys(agentStates).length;
  const meta = STATUS_META[status];

  return (
    <motion.header
      variants={motionVariants.slideInLeft}
      initial="hidden"
      animate="visible"
      className="h-14 shrink-0 flex items-center gap-3 px-4 bg-base/70 backdrop-blur border-b border-border"
    >
      <motion.div variants={motionVariants.fadeIn} initial="hidden" animate="visible">
        <Link
          to="/projects"
          aria-label="Back to projects"
          className="p-1.5 rounded-md text-muted hover:text-ink transition-colors"
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </Link>
      </motion.div>

      <motion.div
        variants={motionVariants.scaleIn}
        initial="hidden"
        animate="visible"
        className="w-7 h-7 rounded-md gradient-ember flex items-center justify-center shrink-0"
      >
        <Sparkles size={13} className="text-base" aria-hidden="true" />
      </motion.div>

      <div className="min-w-0 flex items-center gap-1.5 text-sm">
        <Link to="/projects" className="text-muted hover:text-ink transition-colors shrink-0">
          Projects
        </Link>
        <ChevronRight size={13} className="text-faint shrink-0" aria-hidden="true" />
        <h1 className="font-medium text-ink truncate">{projectName}</h1>
      </div>

      <div
        className={`ml-2 inline-flex items-center gap-2 border border-border bg-panel/60 py-1 pl-2 pr-3 text-xs shrink-0 ${
          meta.pulse ? "text-ember" : "text-muted"
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot} ${meta.pulse ? "animate-tick" : ""}`} aria-hidden="true" />
        <span>{meta.label}</span>
        {status === "running" && (
          <span className="text-faint">
            · {doneCount} of {total}
          </span>
        )}
      </div>

      {prompt && (
        <p className="ml-2 flex-1 text-xs text-faint truncate hidden md:block" title={prompt}>
          {prompt}
        </p>
      )}

      <div className="ml-auto shrink-0 flex items-center gap-3">
        <motion.div
          key={status}
          variants={motionVariants.scaleIn}
          initial="hidden"
          animate="visible"
        >
          <DeployButton projectId={projectId} />
        </motion.div>
      </div>
    </motion.header>
  );
}
