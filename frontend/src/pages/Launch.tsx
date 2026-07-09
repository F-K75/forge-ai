import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { AGENTS } from "../lib/agents";
import LaunchGlobe from "../components/LaunchGlobe";

// Public entry splash at "/": an immersive, globe-centered portal with a
// terminal-style prompt bar as the single CTA. Deliberately distinct from
// the marketing page at /home (which carries the full hero/pricing/FAQ) —
// this screen is the "front door", /home is the brochure. The earth is a
// WebGL render (see LaunchGlobe) and can be dragged to spin. Already-
// authenticated visitors never see this: PublicRoute bounces them to
// /projects.

const EXAMPLE_PROMPTS = [
  "a habit tracker with streaks and reminders",
  "an invoicing app for freelancers",
  "a booking site for my yoga studio",
  "an internal tool to triage support tickets",
  "a marketplace for vintage synthesizers",
];

export default function Launch() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-base text-ink flex flex-col">
      <Starfield />
      <LaunchGlobe />

      <header className="relative z-10">
        <nav aria-label="Primary" className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 border border-ink flex items-center justify-center">
              <Sparkles className="w-3 h-3" aria-hidden="true" />
            </div>
            <span className="font-display font-medium tracking-tight">Forge</span>
          </div>

          <div className="flex items-center gap-6 text-sm">
            <Link
              to="/home"
              className="text-muted hover:text-ink transition rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/60"
            >
              What is Forge?
            </Link>
            <Link
              to="/login"
              className="text-muted hover:text-ink transition rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/60"
            >
              Sign in
            </Link>
          </div>
        </nav>
      </header>

      {/* pointer-events-none lets drag gestures in the empty space reach the
          globe canvas below; interactive children re-enable their own events */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-6 pointer-events-none">
        <div className="w-full max-w-xl flex flex-col items-center text-center">
          <p className="text-[11px] uppercase tracking-[0.3em] text-faint mb-6 [text-shadow:0_1px_10px_rgba(10,10,15,0.9)]">The software foundry</p>

          <h1 className="font-display text-7xl md:text-8xl font-medium tracking-tight leading-none [text-shadow:0_2px_24px_rgba(10,10,15,0.8)]">Forge</h1>

          <p className="mt-5 text-muted [text-shadow:0_1px_10px_rgba(10,10,15,0.9)]">
            Six agents. One prompt. Working software.
          </p>

          <PromptBar />

          <Link
            to="/home"
            className="pointer-events-auto mt-8 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/60"
          >
            or explore the platform <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>
      </main>

      <footer className="relative z-10 pb-8">
        <ul aria-label="Forge build agents" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-6">
          {AGENTS.map((agent) => (
            <li key={agent.id} className="flex items-center gap-1.5 text-xs text-faint">
              <span className="w-1 h-1 rounded-full bg-faint" aria-hidden="true" />
              {agent.label}
            </li>
          ))}
        </ul>
      </footer>
    </div>
  );
}

// Terminal-style prompt input. Typing is optional — submitting (with or
// without text) heads to signup, carrying the draft prompt in router state
// so a future onboarding step can pre-fill it.
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
      className="pointer-events-auto mt-10 w-full flex items-center gap-3 rounded-lg border border-border bg-panel/80 backdrop-blur px-4 py-3 text-left focus-within:border-muted/60 focus-within:shadow-[0_0_0_1px_rgba(232,232,240,0.12),0_0_40px_rgba(232,232,240,0.06)] transition-shadow"
      onClick={() => inputRef.current?.focus()}
    >
      <span className="font-mono text-sm text-muted select-none" aria-hidden="true">
        $
      </span>
      <div className="relative flex-1 min-w-0">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Describe what you want to build"
          className="w-full bg-transparent font-mono text-sm text-ink placeholder-transparent focus:outline-none"
        />
        {value === "" && (
          <span aria-hidden="true" className="absolute inset-0 flex items-center pointer-events-none font-mono text-sm text-faint truncate">
            <span className="text-muted mr-1.5">forge build</span>
            <span className="truncate">{placeholder}</span>
            <span className="text-muted animate-[blink_1s_step-end_infinite] motion-reduce:animate-none ml-px">▋</span>
          </span>
        )}
      </div>
      <button
        type="submit"
        className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-ink text-base text-sm font-medium px-4 py-1.5 hover:bg-ink/90 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/60 focus-visible:ring-offset-2 focus-visible:ring-offset-base"
      >
        Build <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </form>
  );
}

// Types out each example prompt, holds it, deletes it, moves to the next.
// Paused while the user has typed their own text; static first example when
// the visitor prefers reduced motion.
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

// A sparse, static field of faint stars so the void around the globe reads
// as space rather than empty page. Positions are randomized once per mount.
function Starfield() {
  const stars = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        id: i,
        top: Math.random() * 100,
        left: Math.random() * 100,
        size: Math.random() < 0.2 ? 2 : 1,
        opacity: 0.15 + Math.random() * 0.35,
      })),
    [],
  );

  return (
    <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
      {stars.map((s) => (
        <span
          key={s.id}
          className="absolute rounded-full bg-ink"
          style={{ top: `${s.top}%`, left: `${s.left}%`, width: s.size, height: s.size, opacity: s.opacity }}
        />
      ))}
    </div>
  );
}

