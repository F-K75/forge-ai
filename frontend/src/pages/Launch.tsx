import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import gsap from "gsap";
import { AGENTS } from "../lib/agents";
import { coverageStats } from "../lib/skillVisuals";
import { presets } from "../lib/animationPresets";
import LaunchGlobe from "../components/LaunchGlobe";
import { LandingPageBody, Nav as SiteNav, Footer as SiteFooter } from "./LandingPage";

// Public entry at "/": one full-bleed composition — globe, brand, prompt, pipeline.

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
  architect: "mapping system topology",
  business_improver: "stress-testing the model",
  designer: "composing the surface",
  developer: "writing production paths",
  integration: "wiring external services",
  pm: "validating the ship gate",
};

export default function Launch() {
  const reduceMotion = useReducedMotion();
  const stats = coverageStats();

  return (
    <div className="launch-os w-full scroll-smooth bg-base text-ink">
      {/* Full-bleed visual plane */}
      <div className="fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div className="launch-atmosphere absolute inset-0" />
        <Grain />
        <div className="launch-globe-stage absolute inset-0">
          <LaunchGlobe />
          <OrbitingAgents />
        </div>
        <div className="launch-name-veil absolute inset-0" />
        <div className="launch-horizon absolute inset-x-0 bottom-0" />
      </div>

      <section
        id="top"
        className="relative z-10 flex h-[100dvh] w-screen flex-col overflow-hidden text-ink"
      >
        <div className="h-14 shrink-0 md:h-16" aria-hidden="true" />

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pointer-events-none sm:px-6">
          <motion.div
            className="flex w-full max-w-3xl flex-col items-center text-center"
            initial={reduceMotion ? false : "hidden"}
            animate="visible"
            variants={{
              hidden: {},
              visible: {
                transition: { staggerChildren: 0.12, delayChildren: 0.15 },
              },
            }}
          >
            <motion.h1
              className="launch-brand font-brand text-[clamp(4.25rem,16vw,8.5rem)] font-extrabold uppercase leading-[0.82] tracking-[-0.055em] text-ink"
              variants={{
                hidden: { opacity: 0, y: 28, filter: "blur(8px)" },
                visible: {
                  opacity: 1,
                  y: 0,
                  filter: "blur(0px)",
                  transition: { duration: 0.85, ease: [0.22, 1, 0.36, 1] },
                },
              }}
            >
              Forge
            </motion.h1>

            <motion.p
              className="mt-5 max-w-md text-base text-muted md:text-lg [text-shadow:0_1px_16px_rgba(9,9,11,0.9)]"
              variants={{
                hidden: { opacity: 0, y: 14 },
                visible: {
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.55, ease: "easeOut" },
                },
              }}
            >
              Six agents. One prompt. Production software.
            </motion.p>

            <motion.div
              className="w-full"
              variants={{
                hidden: { opacity: 0, y: 18 },
                visible: {
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.55, ease: "easeOut" },
                },
              }}
            >
              <PromptBar />
            </motion.div>
          </motion.div>
        </div>

        <AgentPipelineDock fullVisuals={stats.full} />
      </section>

      <SiteNav />
      <div className="relative z-10">
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

  useEffect(() => {
    if (reduceMotion) return;
    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % AGENTS.length);
    }, 2400);
    return () => window.clearInterval(id);
  }, [reduceMotion]);

  useEffect(() => {
    if (reduceMotion || !railRef.current) return;
    const nodes = railRef.current.querySelectorAll("[data-fleet-node]");
    const ctx = gsap.context(() => {
      gsap.from(nodes, {
        opacity: 0,
        y: 22,
        stagger: 0.06,
        duration: 0.5,
        ease: "power3.out",
        delay: 0.3,
      });
    }, railRef);
    return () => ctx.revert();
  }, [reduceMotion]);

  const live = AGENTS[active];
  const progress = ((active + 1) / AGENTS.length) * 100;

  return (
    <motion.footer
      className="launch-fleet relative z-10 border-t border-white/12 bg-gradient-to-t from-black/80 via-black/55 to-black/35 px-3 pt-3 pb-3.5 backdrop-blur-md sm:px-6"
      initial={reduceMotion ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.3, ease: "easeOut" }}
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="launch-fleet-live relative flex h-1.5 w-1.5 shrink-0 rounded-full bg-ink" aria-hidden="true" />
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.28em] text-faint">
              Agents online
            </p>
          </div>
          <p className="mt-1 font-display text-sm font-medium tracking-tight text-ink sm:text-base">
            {live.label}
          </p>
          <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
            {AGENT_TASK[live.id]}
          </p>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint tabular-nums">
          Step {String(active + 1).padStart(2, "0")} / {String(AGENTS.length).padStart(2, "0")}
          <span className="mx-2 text-white/20">·</span>
          {fullVisuals} visuals
        </p>
      </div>

      <div className="launch-fleet-track mb-3 h-px w-full overflow-hidden bg-white/10" aria-hidden="true">
        <span
          className="launch-fleet-track-fill block h-full bg-ink"
          style={{ width: `${progress}%` }}
        />
      </div>

      <ul
        ref={railRef}
        aria-label="Forge build agents"
        className="grid grid-cols-6 gap-1 sm:gap-2"
      >
        {AGENTS.map((agent, i) => {
          const Icon = agent.icon;
          const isActive = i === active;
          const isDone = i < active;
          return (
            <li key={agent.id} data-fleet-node className="min-w-0">
              <button
                type="button"
                aria-current={isActive ? "true" : undefined}
                aria-label={`${agent.label}${isActive ? ", running" : isDone ? ", complete" : ", standby"}`}
                onClick={() => setActive(i)}
                className={[
                  "launch-fleet-pillar group relative flex w-full flex-col items-center gap-2 px-0.5 py-1 outline-none",
                  "focus-visible:ring-1 focus-visible:ring-ink/50",
                  isActive ? "is-active" : "",
                  isDone ? "is-done" : "",
                ].join(" ")}
              >
                <span className="relative z-[1] flex h-8 w-8 items-center justify-center sm:h-9 sm:w-9">
                  <Icon
                    size={16}
                    className="transition-colors duration-300"
                    style={{ color: isActive ? "#F4F4F5" : isDone ? "#A1A1AA" : "#52525B" }}
                    aria-hidden="true"
                  />
                  {isActive && !reduceMotion && (
                    <span className="launch-fleet-scan" aria-hidden="true" />
                  )}
                </span>

                <span className="launch-fleet-meter relative w-full max-w-[2.75rem] sm:max-w-[3.25rem]" aria-hidden="true">
                  <span className="launch-fleet-meter-fill" />
                </span>

                <span className="flex w-full flex-col items-center gap-0.5">
                  <span
                    className={[
                      "font-mono text-[9px] font-bold uppercase tracking-[0.2em]",
                      isActive ? "text-ink" : "text-faint",
                    ].join(" ")}
                  >
                    {AGENT_SHORT[agent.id]}
                  </span>
                  <span
                    className={[
                      "hidden w-full truncate text-center text-[10px] sm:block",
                      isActive ? "text-muted" : "text-faint/80",
                    ].join(" ")}
                  >
                    {agent.label}
                  </span>
                </span>

                <span
                  className={[
                    "font-mono text-[8px] tabular-nums tracking-wider",
                    isActive ? "text-ink/70" : "text-faint/50",
                  ].join(" ")}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
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
      className="pointer-events-auto mt-8 flex w-full items-center gap-2 border border-white/18 bg-black/50 px-3 py-2.5 text-left backdrop-blur-md transition-[border-color,box-shadow] focus-within:border-ink/45 focus-within:shadow-[0_0_0_1px_rgba(244,244,245,0.12)] sm:gap-3 sm:px-4"
      onClick={() => inputRef.current?.focus()}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center border border-white/15 bg-white/[0.04] font-mono text-sm text-ink"
        aria-hidden="true"
      >
        $
      </span>
      <div className="relative min-w-0 flex-1">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Describe what you want to build"
          className="w-full bg-transparent font-mono text-sm text-ink placeholder-transparent focus:outline-none"
        />
        {value === "" && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center truncate font-mono text-sm text-faint"
          >
            <span className="mr-1.5 hidden text-muted sm:inline">forge build</span>
            <span className="truncate">{placeholder}</span>
            <span className="ml-px animate-[blink_1s_step-end_infinite] text-muted motion-reduce:animate-none">
              ▋
            </span>
          </span>
        )}
      </div>
      <motion.button
        type="submit"
        className="inline-flex shrink-0 items-center gap-1.5 bg-ink px-3.5 py-2 text-sm font-bold uppercase tracking-wide text-base transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/60 sm:px-5"
        {...presets.button}
      >
        Build <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
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

function OrbitingAgents() {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
    >
      {AGENTS.map((agent, i) => {
        const diameter = 72 + i * 12;
        const duration = 28 + i * 6;
        return (
          <div
            key={agent.id}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-orbit-spin rounded-full motion-reduce:animate-none"
            style={{
              width: `min(${diameter}vh, ${diameter}vw)`,
              height: `min(${diameter}vh, ${diameter}vw)`,
              animationDuration: `${duration}s`,
              animationDirection: i % 2 === 1 ? "reverse" : "normal",
            }}
          >
            <span
              className="absolute left-1/2 top-0 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ backgroundColor: agent.hue, opacity: 0.7 }}
            />
          </div>
        );
      })}
    </div>
  );
}

function Grain() {
  const dots = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        id: i,
        top: ((i * 47) % 100) + (i % 7) * 0.3,
        left: ((i * 73) % 100) + (i % 5) * 0.4,
        size: i % 11 === 0 ? 2 : 1,
        opacity: 0.08 + (i % 5) * 0.05,
      })),
    [],
  );

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {dots.map((s) => (
        <span
          key={s.id}
          className="absolute rounded-full bg-ink"
          style={{
            top: `${s.top}%`,
            left: `${s.left}%`,
            width: s.size,
            height: s.size,
            opacity: s.opacity,
          }}
        />
      ))}
    </div>
  );
}
