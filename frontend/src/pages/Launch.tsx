import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { AGENTS } from "../lib/agents";
import { presets } from "../lib/animationPresets";
import LaunchGlobe from "../components/LaunchGlobe";
import Globe3D from "../components/Globe3D";
import {
  LandingPageBody,
  Nav as SiteNav,
  Footer as SiteFooter,
} from "./LandingPage";

const EXAMPLE_PROMPTS = [
  "A habit tracker with streaks and reminders",
  "An invoicing app for freelancers",
  "A booking site for a yoga studio",
  "An internal tool to triage support tickets",
  "A marketplace for vintage synthesizers",
];

export default function Launch() {
  const reduceMotion = useReducedMotion();
  const [activeAgentId, setActiveAgentId] = useState<
    (typeof AGENTS)[number]["id"]
  >(AGENTS[0].id);
  const [globeMode, setGlobeMode] = useState<"cobe" | "three">("cobe");
  const { scrollY } = useScroll();
  const globeScale = useTransform(scrollY, [0, 800], [1, 1.4]);
  const globeOpacity = useTransform(scrollY, [0, 600], [0.35, 0]);

  useEffect(() => {
    if (reduceMotion) return;
    const id = window.setInterval(() => {
      setActiveAgentId((prev) => {
        const idx = AGENTS.findIndex((a) => a.id === prev);
        return AGENTS[(idx + 1) % AGENTS.length].id;
      });
    }, 3000);
    return () => window.clearInterval(id);
  }, [reduceMotion]);

  return (
    <div className="w-full scroll-smooth bg-base text-ink min-h-screen">
      <div
        className="fixed inset-0 z-0 overflow-hidden pointer-events-none"
        aria-hidden="true"
      >
        <div className="launch-atmosphere absolute inset-0" />
        <motion.div
          className="launch-globe-stage absolute inset-0"
          style={{ scale: globeScale, opacity: globeOpacity }}
        >
          {globeMode === "cobe" ? (
            <LaunchGlobe activeAgentId={activeAgentId} />
          ) : (
            <Globe3D activeAgentId={activeAgentId} />
          )}
        </motion.div>
        <div className="launch-name-veil absolute inset-0" />
      </div>

      <section
        id="top"
        className="relative z-10 flex min-h-[100dvh] w-screen flex-col overflow-hidden"
      >
        <div className="h-16 shrink-0 md:h-[72px]" aria-hidden="true" />

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pointer-events-none sm:px-8">
          <motion.div
            className="flex w-full max-w-[800px] flex-col items-center text-center"
            initial={reduceMotion ? false : "hidden"}
            animate="visible"
            variants={{
              hidden: {},
              visible: {
                transition: { staggerChildren: 0.1, delayChildren: 0.15 },
              },
            }}
          >
            <motion.p
              className="mb-6 text-[13px] font-medium tracking-[0.08em] uppercase text-muted"
              variants={{
                hidden: { opacity: 0, y: 12 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
              }}
            >
              Software engineering, reimagined
            </motion.p>

            <motion.h1
              className="font-brand text-[clamp(3.5rem,11vw,7rem)] font-medium leading-[1.02] tracking-[-0.045em] text-ink"
              variants={{
                hidden: {
                  opacity: 0,
                  y: 28,
                  filter: "blur(8px)",
                },
                visible: {
                  opacity: 1,
                  y: 0,
                  filter: "blur(0px)",
                  transition: {
                    duration: 0.9,
                    ease: [0.22, 1, 0.36, 1],
                  },
                },
              }}
            >
              Forge.
            </motion.h1>

            <motion.p
              className="mt-7 max-w-[560px] text-[18px] leading-relaxed text-muted sm:text-[20px]"
              variants={{
                hidden: { opacity: 0, y: 14 },
                visible: {
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.6 },
                },
              }}
            >
              Turn ideas into production-ready software. Describe what you want
              to build, and let the system architect, design, and ship it.
            </motion.p>

            <motion.div
              className="w-full max-w-[640px]"
              variants={{
                hidden: { opacity: 0, y: 18 },
                visible: {
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.6 },
                },
              }}
            >
              <PromptBar />
            </motion.div>
          </motion.div>
        </div>

        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10">
          <motion.div
            className="flex flex-col items-center gap-2 text-muted/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.8 }}
          >
            <span className="text-[11px] tracking-widest uppercase">
              Scroll
            </span>
            <div className="w-px h-8 bg-gradient-to-b from-muted/25 to-transparent" />
          </motion.div>
        </div>

        <GlobeToggle
          globeMode={globeMode}
          onGlobeModeChange={setGlobeMode}
        />
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

// ─── Prompt bar ─────────────────────────────────────────────────────────────

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
    <div className="pointer-events-auto mt-10 w-full">
      <form
        onSubmit={onSubmit}
        className="flex w-full items-center gap-3 rounded-full apple-glass-strong px-2 py-2 pl-5 text-left shadow-apple-lg transition-all duration-300 focus-within:shadow-[0_0_0_3px_var(--state-focus)]"
        role="group"
        aria-label="Build prompt"
      >
        <div
          className="relative min-w-0 flex-1 cursor-text"
          onMouseDown={() => inputRef.current?.focus()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.focus();
          }}
          role="textbox"
          tabIndex={-1}
          aria-label="Click to focus input"
        >
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Tell us what you want to build"
            className="w-full bg-transparent text-[15px] text-ink placeholder-transparent focus:outline-none sm:text-[17px]"
          />
          {value === "" && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center truncate text-[15px] text-faint sm:text-[17px]"
            >
              <span className="truncate">{placeholder}</span>
              <span className="ml-0.5 animate-[blink_1s_step-end_infinite] text-muted motion-reduce:animate-none">
                |
              </span>
            </span>
          )}
        </div>
        <motion.button
          type="submit"
          className="bb-btn bb-btn-primary shrink-0 px-6"
          {...presets.button}
        >
          Start building <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </motion.button>
      </form>
      <div
        className="mt-4 flex flex-wrap justify-center gap-2"
        aria-label="Try an example"
      >
        {EXAMPLE_PROMPTS.slice(0, 3).map((example) => (
          <button
            key={example}
            type="button"
            className="bb-chip pointer-events-auto cursor-pointer"
            onClick={() => {
              setValue(example);
              inputRef.current?.focus();
            }}
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Globe toggle ───────────────────────────────────────────────────────────

function GlobeToggle({
  globeMode,
  onGlobeModeChange,
}: {
  globeMode: "cobe" | "three";
  onGlobeModeChange: (mode: "cobe" | "three") => void;
}) {
  return (
    <motion.button
      type="button"
      aria-label={
        globeMode === "cobe" ? "Switch to 3D globe" : "Switch to globe view"
      }
      onClick={() =>
        onGlobeModeChange(globeMode === "cobe" ? "three" : "cobe")
      }
      className="absolute bottom-10 right-6 sm:right-10 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-inlay-hover text-muted backdrop-blur-md transition-all duration-200 hover:bg-inlay-strong sm:h-11 sm:w-11"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1, duration: 0.6 }}
    >
      <span className="text-[12px] font-semibold">
        {globeMode === "cobe" ? "C" : "3"}
      </span>
    </motion.button>
  );
}

// ─── Typed placeholder ──────────────────────────────────────────────────────

function useTypedPlaceholder(examples: string[], active: boolean) {
  const [text, setText] = useState("");

  useEffect(() => {
    if (!active) return;
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
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
