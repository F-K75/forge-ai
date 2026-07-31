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
    }, 2200);
    return () => window.clearInterval(id);
  }, [reduceMotion]);

  useEffect(() => {
    if (reduceMotion || !railRef.current) return;
    const nodes = railRef.current.querySelectorAll("[data-fleet-node]");
    const ctx = gsap.context(() => {
      gsap.from(nodes, {
        opacity: 0,
        y: 16,
        scale: 0.88,
        stagger: 0.07,
        duration: 0.5,
        ease: "power3.out",
        delay: 0.35,
      });
    }, railRef);
    return () => ctx.revert();
  }, [reduceMotion]);

  const live = AGENTS[active];

  return (
    <motion.footer
      className="launch-fleet relative z-10 border-t border-white/10 bg-black/55 px-3 py-3 backdrop-blur-md sm:px-5 sm:py-3.5"
      initial={reduceMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.35, ease: "easeOut" }}
    >
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="launch-fleet-live relative flex h-1.5 w-1.5 shrink-0 rounded-full bg-ink" aria-hidden="true" />
          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-faint">
            Pipeline · {live.label}
          </p>
          <p className="hidden truncate font-mono text-[9px] uppercase tracking-wide text-muted sm:block">
            {AGENT_TASK[live.id]}
          </p>
        </div>
        <p className="font-mono text-[9px] uppercase tracking-wide text-faint">
          {String(active + 1).padStart(2, "0")}/{String(AGENTS.length).padStart(2, "0")} · {fullVisuals} visuals
        </p>
      </div>

      <ul
        ref={railRef}
        aria-label="Forge build agents"
        className="launch-fleet-rail relative flex items-stretch justify-between gap-0 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {AGENTS.map((agent, i) => {
          const Icon = agent.icon;
          const isActive = i === active;
          const isDone = !reduceMotion && i < active;
          return (
            <li key={agent.id} data-fleet-node className="relative flex min-w-0 flex-1 items-center">
              <button
                type="button"
                aria-current={isActive ? "true" : undefined}
                aria-label={`${agent.label}${isActive ? ", running" : isDone ? ", complete" : ", standby"}`}
                onClick={() => setActive(i)}
                className={[
                  "launch-fleet-node group relative z-[1] flex w-full flex-col items-center gap-1.5 px-1 py-1 outline-none",
                  "focus-visible:ring-1 focus-visible:ring-ink/50",
                  isActive ? "text-ink" : "text-muted",
                ].join(" ")}
              >
                <span
                  className={[
                    "launch-fleet-glyph relative flex h-11 w-11 items-center justify-center sm:h-12 sm:w-12",
                    isActive ? "is-active" : "",
                    isDone ? "is-done" : "",
                  ].join(" ")}
                  style={{ ["--fleet-hue" as string]: agent.hue }}
                >
                  {isActive && !reduceMotion && <span className="launch-fleet-ring" aria-hidden="true" />}
                  <Icon
                    size={18}
                    className="relative z-[1]"
                    style={{ color: isActive ? "#09090B" : agent.hue }}
                    aria-hidden="true"
                  />
                </span>
                <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em]">
                  {AGENT_SHORT[agent.id]}
                </span>
                <span className="hidden max-w-full truncate text-[10px] font-medium sm:block">
                  {agent.label}
                </span>
              </button>

              {i < AGENTS.length - 1 && (
                <span
                  className="launch-fleet-link pointer-events-none absolute right-0 top-[1.375rem] z-0 h-px w-[calc(50%+0.25rem)] translate-x-1/2 sm:top-[1.5rem]"
                  aria-hidden="true"
                >
                  <span
                    className={[
                      "launch-fleet-beam block h-full w-full",
                      i < active ? "is-passed" : "",
                      i === active ? "is-handoff" : "",
                    ].join(" ")}
                  />
                </span>
              )}
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
