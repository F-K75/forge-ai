import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { AGENTS } from "../lib/agents";

// Public entry page at "/": a full hero (nav, headline, CTAs, agent lineup)
// over the revolving globe. Pure CSS/SVG — no 3D library — kept lightweight
// and dependency-free. Already-authenticated visitors never see this:
// PublicRoute bounces them to /projects.
export default function Launch() {
  return (
    <div className="relative min-h-screen w-screen overflow-hidden bg-base text-ink flex flex-col">
      <Globe />

      {/* Soft accent wash behind the hero so the text side has depth too */}
      <div
        aria-hidden="true"
        className="absolute -top-40 -left-40 w-[36rem] h-[36rem] rounded-full bg-accent/10 blur-3xl pointer-events-none"
      />

      <header className="relative z-10">
        <nav aria-label="Primary" className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <div className="w-6 h-6 border border-ink flex items-center justify-center">
              <Sparkles className="w-3 h-3" aria-hidden="true" />
            </div>
            <span className="font-display font-medium tracking-tight">Forge</span>
          </Link>

          <div className="flex items-center gap-4">
            <Link
              to="/login"
              className="text-sm text-muted hover:text-ink transition rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Sign in
            </Link>
            <Link
              to="/signup"
              className="inline-flex items-center px-3.5 py-2 rounded-md text-sm font-medium bg-accent text-white hover:bg-accent/90 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base"
            >
              Get started
            </Link>
          </div>
        </nav>
      </header>

      <main className="relative z-10 flex-1 flex items-center">
        <div className="max-w-6xl mx-auto px-6 w-full py-16">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs text-muted mb-8">
              <span className="relative flex w-1.5 h-1.5" aria-hidden="true">
                <span className="absolute inline-flex w-full h-full rounded-full bg-ok animate-ping motion-reduce:animate-none opacity-75" />
                <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-ok" />
              </span>
              Multi-agent build pipeline — live
            </div>

            <h1 className="font-display text-5xl md:text-7xl font-medium leading-[1.02] tracking-tight">
              Ship production software.
              <br />
              <span className="text-muted">Powered by AI agents.</span>
            </h1>

            <p className="mt-8 text-lg text-muted max-w-xl leading-relaxed">
              Describe what you want to build. Six specialist agents plan, design, code, wire up
              integrations, and validate a working app — then ship it to GitHub.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-3">
              <Link
                to="/signup"
                className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent/90 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base"
              >
                Start building free <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
              <Link
                to="/home"
                className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-md border border-border text-sm font-medium text-ink hover:bg-panel transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Explore Forge
              </Link>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10">
        <div className="max-w-6xl mx-auto px-6 py-8 border-t border-border-soft">
          <ul className="flex flex-wrap items-center gap-x-8 gap-y-3" aria-label="Forge build agents">
            {AGENTS.map((agent) => {
              const Icon = agent.icon;
              return (
                <li key={agent.id} className="flex items-center gap-2 text-sm text-muted">
                  <Icon className="w-4 h-4" strokeWidth={1.5} style={{ color: agent.hue }} aria-hidden="true" />
                  {agent.label}
                </li>
              );
            })}
            <li className="ml-auto text-xs text-faint">© {new Date().getFullYear()} Forge</li>
          </ul>
        </div>
      </footer>
    </div>
  );
}

function Globe() {
  const parallels = [-60, -30, 0, 30, 60];
  const meridianCount = 8;

  return (
    <div
      aria-hidden="true"
      className="absolute pointer-events-none top-1/2 -translate-y-1/2 left-[55%] md:left-[58%] opacity-70 md:opacity-100"
      style={{ width: "min(85vh, 85vw)", height: "min(85vh, 85vw)" }}
    >
      <div className="w-full h-full rounded-full bg-[radial-gradient(circle_at_32%_28%,hsl(0_0%_20%),hsl(0_0%_5%)_72%)] border border-muted/40" />

      {/* Meridians — vertical ellipses rotating around the sphere's Y axis */}
      <div className="absolute inset-0 [transform-style:preserve-3d] animate-[spin-globe_50s_linear_infinite] motion-reduce:animate-none">
        {Array.from({ length: meridianCount }).map((_, i) => (
          <div
            key={i}
            className="absolute inset-0 rounded-full border border-muted/25"
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
              className="absolute left-0 right-0 rounded-full border border-muted/20"
              style={{ top: `${offset}%`, height: `${scale * 100}%` }}
            />
          );
        })}
      </div>

      {/* Equator, drawn brighter as a fixed reference line */}
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 border-t border-accent/30" />

      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_50%,transparent_60%,hsl(0_0%_4%)_88%)]" />
    </div>
  );
}
