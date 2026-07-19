import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Hammer, Check, Github, Key, ArrowUpRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { motionVariants } from "../lib/animations";
import { presets } from "../lib/animationPresets";
import { getIcon } from "../lib/iconMap";
import { useAuthStore } from "../store/authStore";
import { LIVE_MODE } from "../lib/env";
import { DEFAULT_SETTINGS } from "../lib/mockData";

type Goal = string | null;

interface GoalOption {
  label: string;
  iconName: string;
  hue: string;
}

const GOALS: GoalOption[] = [
  { label: "SaaS dashboard", iconName: "trending-up",  hue: "#6366F1" },
  { label: "Marketplace",    iconName: "store",         hue: "#A855F7" },
  { label: "Internal tool",  iconName: "shield-check",  hue: "#22D3EE" },
  { label: "AI app",         iconName: "sparkles",      hue: "#F59E0B" },
  { label: "API backend",    iconName: "code",          hue: "#34D399" },
  { label: "Just exploring", iconName: "compass",       hue: "#8B5CF6" },
];

const STEP_LABELS = ["Welcome", "Goal", "Connect", "Ready"] as const;

// A short starter prompt per goal, handed off to the workspace so the first
// build isn't a blank prompt box — mirrors how Marketplace's "Install" flow
// hands a prompt to /build/new (see WorkspacePage.tsx's location.state.prompt).
const GOAL_STARTER_PROMPTS: Record<string, string> = {
  "SaaS dashboard": "A SaaS admin dashboard with auth, billing, and usage charts.",
  "Marketplace": "A two-sided marketplace with listings, search, and checkout.",
  "Internal tool": "An internal tool for the team to manage records and approvals.",
  "AI app": "An AI-powered app that takes user input and returns generated content.",
  "API backend": "A REST API backend with auth, a Postgres-style data model, and docs.",
};

export default function Onboarding() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const { user } = useAuthStore();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<Goal>(null);
  const githubDone = LIVE_MODE ? Boolean(user?.github_connected) : DEFAULT_SETTINGS.github.connected;
  const anthropicDone = LIVE_MODE ? Boolean(user?.byok_connected) : DEFAULT_SETTINGS.byok;

  const primaryLabel =
    step === 2 ? "Skip for now" : step === 3 ? "Open workspace" : "Continue";

  const handlePrimary = () => {
    if (step === 3) {
      const prompt = goal ? GOAL_STARTER_PROMPTS[goal] : undefined;
      navigate("/build/new", prompt ? { state: { prompt, template: goal } } : undefined);
    } else {
      setStep((s) => Math.min(s + 1, 3));
    }
  };

  return (
    <div className="min-h-screen bg-base flex flex-col items-center justify-center px-4 py-12">
      <motion.div
        className="w-full max-w-lg"
        initial={reduceMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        {/* Progress rail */}
        <nav aria-label="Onboarding steps" className="mb-8">
          <motion.ol
            className="flex items-start"
            variants={reduceMotion ? undefined : motionVariants.staggerContainer}
            initial={reduceMotion ? false : "hidden"}
            animate="visible"
          >
            {STEP_LABELS.map((label, i) => {
              const isDone = i < step;
              const isCurrent = i === step;
              return (
                <motion.li key={label} className="flex items-center flex-1 last:flex-none" variants={motionVariants.staggerItem}>
                  <div className="flex flex-col items-center">
                    <div
                      aria-current={isCurrent ? "step" : undefined}
                      className={[
                        "w-8 h-8 rounded-full flex items-center justify-center",
                        "text-xs font-semibold shrink-0",
                        isDone
                          ? "bg-accent text-white"
                          : isCurrent
                          ? "bg-accent text-white ring-2 ring-accent ring-offset-2 ring-offset-base"
                          : "bg-border text-faint",
                      ].join(" ")}
                    >
                      {isDone ? (
                        <Check size={12} aria-hidden="true" />
                      ) : (
                        i + 1
                      )}
                    </div>
                    <span
                      className={[
                        "hidden sm:block text-[10px] mt-1.5",
                        isCurrent ? "text-ink" : "text-faint",
                      ].join(" ")}
                    >
                      {label}
                    </span>
                  </div>
                  {i < STEP_LABELS.length - 1 && (
                    <div
                      className={[
                        "flex-1 h-px mx-1.5 mb-3 sm:mb-5",
                        i < step ? "bg-accent" : "bg-border",
                      ].join(" ")}
                    />
                  )}
                </motion.li>
              );
            })}
          </motion.ol>
        </nav>

        <span role="status" aria-live="polite" className="sr-only">
          Step {step + 1} of {STEP_LABELS.length}: {STEP_LABELS[step]}
        </span>

        {/* Step card */}
        <div className="glass-strong rounded-2xl p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              variants={reduceMotion ? undefined : motionVariants.slideInRight}
              initial={reduceMotion ? false : "hidden"}
              animate="visible"
              exit="exit"
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              {step === 0 && <StepWelcome />}
              {step === 1 && <StepGoal goal={goal} onSelect={setGoal} />}
              {step === 2 && (
                <StepConnect
                  githubDone={githubDone}
                  anthropicDone={anthropicDone}
                  onGithub={() => window.open("/settings", "_blank", "noopener,noreferrer")}
                  onAnthropic={() => window.open("/settings", "_blank", "noopener,noreferrer")}
                />
              )}
              {step === 3 && <StepReady goal={goal} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer nav */}
        <div
          className={[
            "flex mt-5",
            step > 0 ? "justify-between" : "justify-end",
          ].join(" ")}
        >
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(s - 1, 0))}
              className="px-4 py-2 text-sm text-muted hover:text-ink rounded-lg transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Back
            </button>
          )}
          <motion.button
            type="button"
            onClick={handlePrimary}
            className="px-5 py-2 text-sm font-semibold bg-accent text-white rounded-lg hover:opacity-90 transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base"
            {...presets.button}
          >
            {primaryLabel}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

function StepWelcome() {
  return (
    <div className="flex flex-col items-center text-center gap-5">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent to-[#A855F7] flex items-center justify-center">
        <Hammer size={22} className="text-white" aria-hidden="true" />
      </div>
      <div>
        <h1 className="text-xl font-bold text-ink mb-2">Welcome to Forge</h1>
        <p className="text-sm text-muted leading-relaxed max-w-xs mx-auto">
          Six specialized agents — architect, business model, designer, developer,
          integrations, and PM — collaborate to ship your app in under a minute.
          Setup takes two minutes.
        </p>
      </div>
    </div>
  );
}

function StepGoal({
  goal,
  onSelect,
}: {
  goal: Goal;
  onSelect: (g: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <div>
      <h2 className="text-lg font-bold text-ink mb-1">What are you building first?</h2>
      <p className="text-sm text-muted mb-5">
        Pick a goal and we'll load the right starters.
      </p>
      <motion.div
        className="grid grid-cols-2 gap-3"
        variants={reduceMotion ? undefined : motionVariants.staggerContainer}
        initial={reduceMotion ? false : "hidden"}
        animate="visible"
      >
        {GOALS.map(({ label, iconName, hue }) => {
          const Icon = getIcon(iconName);
          const isSelected = goal === label;
          return (
            <motion.button
              key={label}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(label)}
              variants={motionVariants.staggerItem}
              whileHover={reduceMotion ? {} : { scale: 1.02 }}
              whileTap={reduceMotion ? {} : { scale: 0.98 }}
              className={[
                "flex flex-col items-start gap-2.5 p-4 rounded-xl border text-left",
                "transition motion-reduce:transition-none",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                isSelected ? "" : "border-border bg-panel-alt hover:border-border-soft",
              ].join(" ")}
              style={
                isSelected
                  ? {
                      backgroundColor: `${hue}15`,
                      borderColor: `${hue}55`,
                    }
                  : undefined
              }
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{
                  backgroundColor: `${hue}22`,
                  border: `1px solid ${hue}44`,
                }}
              >
                <Icon size={15} style={{ color: hue }} aria-hidden="true" />
              </div>
              <span className="text-sm font-medium text-ink">{label}</span>
            </motion.button>
          );
        })}
      </motion.div>
    </div>
  );
}

function StepConnect({
  githubDone,
  anthropicDone,
  onGithub,
  onAnthropic,
}: {
  githubDone: boolean;
  anthropicDone: boolean;
  onGithub: () => void;
  onAnthropic: () => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <div>
      <h2 className="text-lg font-bold text-ink mb-1">Connect your tools</h2>
      <p className="text-sm text-muted mb-5">
        These open Settings in a new tab — come back here when you're done, or skip for now.
      </p>
      <motion.div
        className="flex flex-col gap-3"
        variants={reduceMotion ? undefined : motionVariants.staggerContainer}
        initial={reduceMotion ? false : "hidden"}
        animate="visible"
      >
        <motion.div variants={motionVariants.staggerItem}>
          <ConnectRow
            icon={<Github size={16} className="text-ink" aria-hidden="true" />}
            label="GitHub"
            description="Push every build to a repo"
            done={githubDone}
            actionLabel="Connect in Settings"
            onAction={onGithub}
          />
        </motion.div>
        <motion.div variants={motionVariants.staggerItem}>
          <ConnectRow
            icon={<Key size={16} className="text-ink" aria-hidden="true" />}
            label="Anthropic API key"
            description="Bring your own key on Pro — skip credit costs"
            done={anthropicDone}
            actionLabel="Add key in Settings"
            onAction={onAnthropic}
          />
        </motion.div>
      </motion.div>
    </div>
  );
}

function ConnectRow({
  icon,
  label,
  description,
  done,
  actionLabel,
  onAction,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  done: boolean;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-panel-alt border border-border">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-border-soft flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium text-ink">{label}</p>
          <p className="text-xs text-muted">{description}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onAction}
        disabled={done}
        className={[
          "px-3.5 py-1.5 text-xs font-semibold rounded-lg transition motion-reduce:transition-none",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          done
            ? "bg-ok/10 text-ok border border-ok/25 cursor-default"
            : "bg-panel border border-border text-ink hover:bg-base",
        ].join(" ")}
      >
        {done ? (
          <span className="flex items-center gap-1.5">
            <Check size={12} aria-hidden="true" />
            Connected
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            {actionLabel}
            <ArrowUpRight size={12} aria-hidden="true" />
          </span>
        )}
      </button>
    </div>
  );
}

function StepReady({ goal }: { goal: Goal }) {
  return (
    <div className="flex flex-col items-center text-center gap-5">
      <div className="w-14 h-14 rounded-2xl bg-ok/10 border border-ok/25 flex items-center justify-center">
        <Check size={22} className="text-ok" aria-hidden="true" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-ink mb-2">You're ready</h2>
        <p className="text-sm text-muted leading-relaxed max-w-xs mx-auto">
          {goal
            ? `We've loaded ${goal} starters for you. `
            : "Your workspace is set up. "}
          10 free credits are on your account.
        </p>
      </div>
    </div>
  );
}
