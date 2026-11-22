import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Terminal } from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { ThemeToggle } from "../components/ThemeToggle";

const PILLARS = [
  {
    index: "01",
    title: "Architecture",
    detail: "Typed schemas, API contracts, and module boundaries planned before code.",
  },
  {
    index: "02",
    title: "Synthesis",
    detail: "Parallel frontend, backend, and test generation across specialist agents.",
  },
  {
    index: "03",
    title: "Verification",
    detail: "Automated type checks, Vitest runs, and direct standard Git export.",
  },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-base text-ink flex flex-col">
      {/* Minimal Header */}
      <header className="sticky top-0 z-40 h-14 border-b border-border bg-panel/95 backdrop-blur-sm">
        <div className="mx-auto flex h-full max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link
            to="/home"
            className="flex shrink-0 items-center gap-2 whitespace-nowrap"
          >
            <BrandLogo size="sm" />
            <span className="font-display text-sm font-semibold tracking-tight text-ink">
              Forge AI
            </span>
          </Link>

          <nav
            aria-label="Primary"
            className="hidden sm:flex items-center gap-6 text-xs font-medium text-muted"
          >
            <Link to="/projects" className="transition-colors hover:text-ink">
              Projects
            </Link>
            <Link to="/studio-3d" className="transition-colors hover:text-ink">
              3D Studio
            </Link>
            <Link to="/login" className="transition-colors hover:text-ink">
              Sign in
            </Link>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle compact />
            <button
              type="button"
              onClick={() => navigate("/p/demo-project/workspace")}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-accent px-3.5 text-xs font-medium text-white transition-colors hover:bg-ember-glow cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <span>Workspace</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Single-Viewport Focused Main */}
      <main className="flex-1 flex flex-col justify-center">
        <section className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="max-w-2xl space-y-6">
            <h1 className="font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl sm:leading-[1.08] [text-wrap:balance]">
              Plan, synthesize, and ship software with specialist agents.
            </h1>

            <p className="max-w-xl text-base leading-relaxed text-muted">
              Multi-agent architecture, full-stack synthesis, and automated QA inside a
              transparent workspace you control.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => navigate("/launch")}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-ember-glow cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <Terminal className="h-4 w-4" />
                <span>Launch New Build</span>
              </button>
              <button
                type="button"
                onClick={() => navigate("/projects")}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-panel px-4 text-sm font-medium text-ink transition-colors hover:bg-panel-alt cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <span>View Projects</span>
                <ArrowRight className="h-4 w-4 text-muted" />
              </button>
            </div>
          </div>

          {/* Minimal 3-Pillar Overview */}
          <div className="mt-14 grid grid-cols-1 gap-6 border-t border-border pt-10 sm:grid-cols-3">
            {PILLARS.map((pillar) => (
              <div key={pillar.index} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-accent tabular-nums">
                    {pillar.index}
                  </span>
                  <h2 className="font-display text-sm font-semibold text-ink">
                    {pillar.title}
                  </h2>
                </div>
                <p className="text-xs leading-relaxed text-muted">{pillar.detail}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-border bg-panel py-5">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 sm:px-6 text-xs text-muted">
          <span className="font-display font-medium text-ink">Forge AI</span>
          <nav aria-label="Footer" className="flex items-center gap-5">
            <Link to="/projects" className="hover:text-ink transition-colors">
              Projects
            </Link>
            <Link to="/studio-3d" className="hover:text-ink transition-colors">
              3D Studio
            </Link>
            <Link to="/login" className="hover:text-ink transition-colors">
              Sign in
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
