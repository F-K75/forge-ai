import { useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Badge } from "../ui";
import { CommandCenterMockup } from "./CommandCenterMockup";
import { Reveal, TwoTone } from "./Reveal";
import { STEPS, type StepId } from "./landingContent";
import { GRAIN, rgba } from "./atmosphere";

export function Statement() {
  return (
    <section aria-label="Why Forge" className="px-5 py-28 sm:px-8 sm:py-36">
      <Reveal>
        <p className="mx-auto max-w-[52rem] text-balance text-center text-[30px] font-medium leading-[1.12] tracking-[-0.03em] text-ink sm:text-[44px]">
          Software shouldn't need a hundred handoffs.{" "}
          <span className="text-muted">
            Forge gives every idea its own engineering team: one that plans, builds, tests and
            ships, then remembers what it learned.
          </span>
        </p>
      </Reveal>
    </section>
  );
}

export function WorkflowShowcase() {
  const [active, setActive] = useState<StepId>("plan");
  const reduce = useReducedMotion();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const step = STEPS.find((s) => s.id === active) ?? STEPS[0];

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + STEPS.length) % STEPS.length;
    setActive(STEPS[next].id);
    tabs.current[next]?.focus();
  };

  return (
    <section id="product" aria-labelledby="product-title" className="scroll-mt-20 px-5 pb-28 sm:px-8 sm:pb-36">
      <Reveal>
        <TwoTone id="product-title" lead="See the work." rest="Know what's next." />
        <p className="mx-auto mt-5 max-w-xl text-balance text-center text-[16px] text-muted">
          Every agent, task and decision in one Command Center, from the first plan to the
          production gate.
        </p>
      </Reveal>

      <Reveal delay={0.1} className="mx-auto mt-14 grid max-w-[1120px] gap-4 lg:grid-cols-[340px_1fr]">
        {/* Step card */}
        <div className="flex flex-col rounded-2xl border border-border bg-panel/80 p-6 sm:p-7">
          <div id="step-panel" role="tabpanel" aria-labelledby={`step-tab-${step.id}`} className="min-h-[210px]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step.id}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                <Badge variant="accent" size="lg">
                  <span className="font-mono">{step.n}</span> {step.label}
                </Badge>
                <h3 className="mt-5 text-[24px] font-medium leading-[1.2] tracking-[-0.02em] text-ink">{step.title}</h3>
                <p className="mt-3 text-[15px] leading-[1.55] text-muted">{step.body}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          <div
            role="tablist"
            aria-label="Lifecycle steps"
            aria-orientation="vertical"
            className="mt-8 grid grid-cols-2 gap-1.5 border-t border-border-soft pt-5 lg:mt-auto lg:grid-cols-1"
          >
            {STEPS.map((s, i) => {
              const on = s.id === active;
              return (
                <button
                  key={s.id}
                  ref={(el) => {
                    tabs.current[i] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`step-tab-${s.id}`}
                  aria-selected={on}
                  aria-controls="step-panel"
                  tabIndex={on ? 0 : -1}
                  onClick={() => setActive(s.id)}
                  onKeyDown={(e) => onKey(e, i)}
                  className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    on ? "bg-ink/[0.06] text-ink" : "text-muted hover:bg-ink/[0.03] hover:text-ink"
                  }`}
                >
                  <span className={`font-mono text-[12px] ${on ? "text-accent" : "text-muted"}`}>{s.n}</span>
                  {s.label}
                  <span
                    className={`ml-auto hidden h-1.5 w-1.5 rounded-full lg:block ${on ? "bg-accent" : "bg-transparent"}`}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* Product frame */}
        <div className="relative overflow-hidden rounded-2xl border border-border p-3 sm:p-8">
          <div
            className="absolute inset-0 -z-0"
            aria-hidden="true"
            style={{
              background: [
                `radial-gradient(70% 60% at 85% 0%, ${rgba("rust", 0.85)} 0%, ${rgba("rust", 0)} 70%)`,
                `radial-gradient(60% 60% at 0% 100%, ${rgba("teal", 0.7)} 0%, ${rgba("teal", 0)} 70%)`,
                `linear-gradient(180deg, ${rgba("olive", 0.25)}, ${rgba("base", 0.9)})`,
              ].join(", "),
            }}
          />
          <div className="absolute inset-0 opacity-[0.06] mix-blend-overlay" aria-hidden="true" style={{ backgroundImage: GRAIN }} />
          <div className="relative">
            <CommandCenterMockup active={active} />
          </div>
        </div>
      </Reveal>
    </section>
  );
}
