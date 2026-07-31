import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion, AnimatePresence } from "motion/react";
import gsap from "gsap";
import { AGENTS } from "../lib/agents";
import { coverageStats } from "../lib/skillVisuals";
import { presets } from "../lib/animationPresets";
import LaunchGlobe from "../components/LaunchGlobe";
import { LandingPageBody, Nav as SiteNav, Footer as SiteFooter } from "./LandingPage";

const EXAMPLE_PROMPTS = [
  "a habit tracker with streaks and reminders",
  "an invoicing app for freelancers",
  "a booking site for my yoga studio",
  "an internal tool to triage support tickets",
  "a marketplace for vintage synthesizers",
];

const AGENT_SHORT: Record<(typeof AGENTS)[number]["id"], string> = {
  architect: "ARCH",
  business_improver: "BIZ",
  designer: "DES",
  developer: "DEV",
  integration: "INT",
  pm: "PM",
};

const AGENT_TASK: Record<(typeof AGENTS)[number]["id"], string> = {
  architect: "Mapping system topology",
  business_improver: "Stress-testing the model",
  designer: "Composing the surface",
  developer: "Writing production paths",
  integration: "Wiring external services",
  pm: "Validating the ship gate",
};

export default function Launch() {
  const reduceMotion = useReducedMotion();
  const stats = coverageStats();

  return (
    <div className="launch-os w-full scroll-smooth bg-base text-ink">
      <div className="fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div className="launch-atmosphere absolute inset-0" />
        <div className="launch-globe-stage absolute inset-0 opacity-80">
          <LaunchGlobe />
        </div>
        <div className="launch-name-veil absolute inset-0" />
      </div>

      <section
        id="top"
        className="relative z-10 flex min-h-[100dvh] w-screen flex-col overflow-hidden"
      >
        <div className="h-16 shrink-0 md:h-[4.25rem]" aria-hidden="true" />

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 pointer-events-none sm:px-8">
          <motion.div
            className="flex w-full max-w-3xl flex-col items-center text-center"
            initial={reduceMotion ? false : "hidden"}
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
            }}
          >
            <motion.p
              className="mb-5 text-[13px] font-medium tracking-[0.04em] text-muted"
              variants={{
                hidden: { opacity: 0, y: 12 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
              }}
            >
              Multi-agent software engineering
            </motion.p>

            <motion.h1
              className="launch-brand font-brand text-[clamp(3.5rem,12vw,72px)] font-semibold leading-[1.05] tracking-[-0.04em] text-ink"
              variants={{
                hidden: { opacity: 0, y: 24, filter: "blur(8px)" },
                visible: {
                  opacity: 1,
                  y: 0,
                  filter: "blur(0px)",
                  transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
                },
              }}
            >
              Forge.
            </motion.h1>

            <motion.p
              className="mt-5 max-w-xl text-[19px] leading-relaxed text-muted sm:text-[21px]"
              variants={{
                hidden: { opacity: 0, y: 14 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.55 } },
              }}
            >
              Six agents. One prompt. Production software.
            </motion.p>

            <motion.div
              className="w-full max-w-2xl"
              variants={{
                hidden: { opacity: 0, y: 18 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.55 } },
              }}
            >
              <PromptBar />
            </motion.div>
          </motion.div>
        </div>

        <AgentPipelineDock fullVisuals={stats.full} />
      </section>

      <SiteNav />
      <div className="relative z-10 bg-base">
        <main id="main-content">
          <LandingPageBody />
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}

function AgentPipelineDock({ fullVisuals }: { fullVisuals: number }) {
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(0);
  const railRef = useRef<HTMLUListElement>(null);
  const LiveIcon = AGENTS[active].icon;

  useEffect(() => {
    if (reduceMotion) return;
    const id = window.setInterval(() => setActive((i) => (i + 1) % AGENTS.length), 2800);
    return () => window.clearInterval(id);
  }, [reduceMotion]);

  useEffect(() => {
    if (reduceMotion || !railRef.current) return;
    const nodes = railRef.current.querySelectorAll("[data-fleet-node]");
    const ctx = gsap.context(() => {
      gsap.from(nodes, {
        opacity: 0,
        y: 16,
        stagger: 0.05,
        duration: 0.45,
        ease: "power3.out",
        delay: 0.25,
      });
    }, railRef);
    return () => ctx.revert();
  }, [reduceMotion]);

  const live = AGENTS[active];
  const progress = (active / Math.max(AGENTS.length - 1, 1)) * 100;

  return (
    <motion.footer
      className="relative z-10 mx-3 mb-4 rounded-apple-xl apple-glass-strong px-4 py-4 sm:mx-6 sm:px-6 sm:py-5"
      initial={reduceMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.25, ease: "easeOut" }}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="launch-fleet-live-icon relative mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
            style={{ background: `${live.hue}18`, color: live.hue }}
          >
            <LiveIcon size={18} aria-hidden="true" />
            {!reduceMotion && <span className="launch-fleet-live-ping rounded-2xl" aria-hidden="true" />}
          </span>
          <div className="min-w-0 pt-0.5">
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-faint">
              Agents online · {live.credits} cr
            </p>
            <AnimatePresence mode="wait">
              <motion.div
                key={live.id}
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: 0.28 }}
              >
                <p className="mt-1 font-display text-[19px] font-semibold tracking-tight text-ink">
                  {live.label}
                </p>
                <p className="mt-0.5 text-[14px] text-muted">{AGENT_TASK[live.id]}</p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[15px] font-semibold tabular-nums text-ink">
            {String(active + 1).padStart(2, "0")}
            <span className="text-faint"> / {String(AGENTS.length).padStart(2, "0")}</span>
          </p>
          <p className="mt-1 text-[12px] text-faint">{fullVisuals} visuals</p>
        </div>
      </div>

      <div className="launch-fleet-track relative mb-5 h-[3px] w-full rounded-full bg-black/[0.06]" aria-hidden="true">
        <span
          className="launch-fleet-track-fill absolute inset-y-0 left-0 rounded-full bg-accent"
          style={{ width: `${progress}%` }}
        />
        <span
          className="launch-fleet-track-head absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 bg-accent"
          style={{ left: `${progress}%` }}
        />
      </div>

      <ul ref={railRef} aria-label="Forge build agents" className="grid grid-cols-6 gap-2 sm:gap-3">
        {AGENTS.map((agent, i) => {
          const Icon = agent.icon;
          const isActive = i === active;
          const isDone = i < active;
          const state = isActive ? "run" : isDone ? "done" : "wait";
          return (
            <li key={agent.id} data-fleet-node className="min-w-0">
              <button
                type="button"
                aria-current={isActive ? "true" : undefined}
                aria-label={`${agent.label}, ${state}`}
                onClick={() => setActive(i)}
                className={[
                  "launch-fleet-pillar group flex w-full flex-col items-center gap-2 rounded-2xl px-1 py-1 outline-none transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-accent/40",
                  isActive ? "is-active bg-accent/[0.06]" : "",
                  isDone ? "is-done" : "is-wait",
                ].join(" ")}
              >
                <span className="launch-fleet-meter relative w-full max-w-[2.5rem] sm:max-w-[3rem]" aria-hidden="true">
                  <span className="launch-fleet-meter-fill" style={isActive ? { background: `linear-gradient(180deg, ${agent.hue}, ${agent.hue}40)` } : undefined} />
                  {isActive && !reduceMotion && <span className="launch-fleet-meter-sweep" />}
                </span>
                <Icon size={15} style={{ color: isActive ? agent.hue : isDone ? "#6E6E73" : "#A1A1A6" }} aria-hidden="true" />
                <span className={["text-[11px] font-semibold tracking-wide", isActive ? "text-ink" : "text-faint"].join(" ")}>
                  {AGENT_SHORT[agent.id]}
                </span>
                <span className="hidden text-[12px] text-muted sm:block">{agent.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </motion.footer>
  );
}

function PromptBar() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const placeholder = useTypedPlaceholder(EXAMPLE_PROMPTS, value === "");
  const inputRef = useRef<HTMLInputElement>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    navigate("/signup", { state: { prompt: value.trim() } });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="pointer-events-auto mt-10 flex w-full items-center gap-2 rounded-full apple-glass-strong px-2 py-2 pl-4 text-left transition shadow-apple-lg focus-within:shadow-[0_0_0_4px_rgba(0,113,227,0.12)] sm:gap-3 sm:pl-5"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="relative min-w-0 flex-1">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Describe what you want to build"
          className="w-full bg-transparent text-[15px] text-ink placeholder-transparent focus:outline-none sm:text-[17px]"
        />
        {value === "" && (
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center truncate text-[15px] text-faint sm:text-[17px]">
            <span className="truncate">{placeholder}</span>
            <span className="ml-0.5 animate-[blink_1s_step-end_infinite] text-accent motion-reduce:animate-none">|</span>
          </span>
        )}
      </div>
      <motion.button
        type="submit"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-[15px] font-medium text-white transition hover:bg-[#0077ED] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        {...presets.button}
      >
        Build <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </motion.button>
    </form>
  );
}

function useTypedPlaceholder(examples: string[], active: boolean) {
  const [text, setText] = useState("");

  useEffect(() => {
    if (!active) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setText(examples[0]);
      return;
    }

    let example = 0;
    let chars = 0;
    let deleting = false;
    let timer: number;

    const tick = () => {
      const current = examples[example];
      chars += deleting ? -1 : 1;
      setText(current.slice(0, chars));

      let delay = deleting ? 18 : 40 + Math.random() * 40;
      if (!deleting && chars === current.length) {
        deleting = true;
        delay = 2200;
      } else if (deleting && chars === 0) {
        deleting = false;
        example = (example + 1) % examples.length;
        delay = 400;
      }
      timer = window.setTimeout(tick, delay);
    };

    timer = window.setTimeout(tick, 500);
    return () => window.clearTimeout(timer);
  }, [examples, active]);

  return text;
}
