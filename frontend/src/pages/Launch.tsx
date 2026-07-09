import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { AGENTS } from "../lib/agents";

// Public entry splash at "/": an immersive, globe-centered portal with a
// terminal-style prompt bar as the single CTA. Deliberately distinct from
// the marketing page at /home (which carries the full hero/pricing/FAQ) —
// this screen is the "front door", /home is the brochure. Pure CSS/SVG,
// no 3D library. Already-authenticated visitors never see this: PublicRoute
// bounces them to /projects.

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
      <Globe />

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
              className="text-muted hover:text-ink transition rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              What is Forge?
            </Link>
            <Link
              to="/login"
              className="text-muted hover:text-ink transition rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Sign in
            </Link>
          </div>
        </nav>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-xl flex flex-col items-center text-center">
          <p className="text-[11px] uppercase tracking-[0.3em] text-faint mb-6">The software foundry</p>

          <h1 className="font-display text-7xl md:text-8xl font-medium tracking-tight leading-none">Forge</h1>

          <p className="mt-5 text-muted">
            Six agents. One prompt. Working software.
          </p>

          <PromptBar />

          <Link
            to="/home"
            className="mt-8 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            or explore the platform <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>
      </main>

      <footer className="relative z-10 pb-8">
        <ul aria-label="Forge build agents" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-6">
          {AGENTS.map((agent) => (
            <li key={agent.id} className="flex items-center gap-1.5 text-xs text-faint">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: agent.hue }}
                aria-hidden="true"
              />
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
      className="mt-10 w-full flex items-center gap-3 rounded-lg border border-border bg-panel/80 backdrop-blur px-4 py-3 text-left focus-within:border-accent/60 focus-within:shadow-[0_0_0_1px_rgba(124,92,255,0.3),0_0_40px_rgba(124,92,255,0.15)] transition-shadow"
      onClick={() => inputRef.current?.focus()}
    >
      <span className="font-mono text-sm text-accent select-none" aria-hidden="true">
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
            <span className="cursor truncate">{placeholder}</span>
          </span>
        )}
      </div>
      <button
        type="submit"
        className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-accent text-white text-sm font-medium px-4 py-1.5 hover:bg-accent/90 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base"
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

function Globe() {
  const parallels = [-60, -30, 0, 30, 60];
  const meridianCount = 8;

  return (
    <div
      aria-hidden="true"
      className="absolute pointer-events-none top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ width: "min(92vh, 92vw)", height: "min(92vh, 92vw)" }}
    >
      <div className="w-full h-full rounded-full bg-[radial-gradient(circle_at_32%_28%,hsl(0_0%_16%),hsl(0_0%_4%)_72%)] border border-muted/30" />

      {/* Meridians — vertical ellipses rotating around the sphere's Y axis */}
      <div className="absolute inset-0 [transform-style:preserve-3d] animate-[spin-globe_50s_linear_infinite] motion-reduce:animate-none">
        {Array.from({ length: meridianCount }).map((_, i) => (
          <div
            key={i}
            className="absolute inset-0 rounded-full border border-muted/20"
            style={{ transform: `rotateY(${(i * 180) / meridianCount}deg)` }}
          />
        ))}
      </div>

      {/* Parallels — horizontal rings for latitude lines */}
      <div className="absolute inset-0">
        {parallels.map((deg) => {
          const scale = Math.cos((deg * Math.PI) / 180);
          const offset = 50 - scale * 50;
          return (
            <div
              key={deg}
              className="absolute left-0 right-0 rounded-full border border-muted/15"
              style={{ top: `${offset}%`, height: `${scale * 100}%` }}
            />
          );
        })}
      </div>

      {/* Equator, drawn brighter as a fixed reference line */}
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 border-t border-accent/25" />

      {/* Vignette so the center stays dark enough for the overlaid content */}
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_50%,hsl(0_0%_4%/0.55)_0%,transparent_45%,hsl(0_0%_4%)_88%)]" />
    </div>
  );
}
