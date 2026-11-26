import React, { useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  CornerDownLeft,
  Terminal,
  X,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Box,
  Layers,
  Cpu,
  CheckCircle2,
} from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { ThemeToggle } from "../components/ThemeToggle";
import { ForgeScene3D } from "../components/three/ForgeScene3D";
import type { StudioFinish } from "../components/three/proceduralModels";

interface ForgeEngineConfig {
  id: string;
  name: string;
  subtitle: string;
  stackName: string;
  finish: StudioFinish;
  activeAgentId: string;
  tasksResolved: string;
  buildsDeployed: string;
  activeAgents: string;
  avgSynthesisTime: string;
  specCode: string;
  clusterRegion: string;
  barsBuilds: number[];
}

const FORGE_CONFIGS: ForgeEngineConfig[] = [
  {
    id: "01",
    name: "Forge Core",
    subtitle: "Autonomous Full-Stack Runtime",
    stackName: "Next.js 15 · Tailwind CSS · PostgreSQL",
    finish: "obsidian",
    activeAgentId: "backend",
    tasksResolved: "2,628",
    buildsDeployed: "1,628",
    activeAgents: "6 specialists",
    avgSynthesisTime: "18.4s",
    specCode: "FG-9000",
    clusterRegion: "us-east",
    barsBuilds: [38, 56, 74, 48, 86, 68, 82],
  },
  {
    id: "02",
    name: "Swarm Mesh",
    subtitle: "Multi-Agent Orchestration Pipeline",
    stackName: "FastAPI · React · Distributed Workers",
    finish: "blueprint",
    activeAgentId: "planner",
    tasksResolved: "3,842",
    buildsDeployed: "2,190",
    activeAgents: "8 pods",
    avgSynthesisTime: "12.1s",
    specCode: "SW-V4",
    clusterRegion: "eu-west",
    barsBuilds: [52, 68, 60, 84, 58, 78, 92],
  },
  {
    id: "03",
    name: "Apex Cluster",
    subtitle: "Enterprise Distributed Codegen",
    stackName: "Go · Kubernetes · Redis · AST Engine",
    finish: "titanium",
    activeAgentId: "devops",
    tasksResolved: "4,950",
    buildsDeployed: "3,440",
    activeAgents: "12 agents",
    avgSynthesisTime: "9.8s",
    specCode: "APEX-99",
    clusterRegion: "ap-south",
    barsBuilds: [64, 78, 72, 92, 68, 86, 96],
  },
];

const QUICK_STACKS = [
  "Next.js SaaS with Stripe & Auth",
  "FastAPI AI Agent with Background Tasks",
  "Production PRD to Code Pipeline",
  "Real-Time Analytics & Telemetry Dashboard",
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function Launch() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [configIndex, setConfigIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentConfig = FORGE_CONFIGS[configIndex] ?? FORGE_CONFIGS[0];

  const handleNextConfig = () => {
    setConfigIndex((prev) => (prev + 1) % FORGE_CONFIGS.length);
  };

  const handlePrevConfig = () => {
    setConfigIndex((prev) => (prev - 1 + FORGE_CONFIGS.length) % FORGE_CONFIGS.length);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = prompt.trim();
    if (!query) {
      navigate("/build/demo-project");
      return;
    }
    navigate(`/build/demo-project?prompt=${encodeURIComponent(query)}`);
  };

  return (
    <div className="min-h-screen bg-base text-ink flex flex-col justify-between transition-colors font-sans antialiased">
      {/* 1. Three-Zone Studio Navigation Bar */}
      <header className="sticky top-0 z-30 h-16 border-b border-border bg-panel/95 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <Link
            to="/home"
            className="flex items-center gap-2.5 text-ink hover:opacity-85 transition-opacity"
          >
            <BrandLogo size="sm" />
            <div className="flex flex-col">
              <span className="font-display font-semibold text-sm tracking-tight leading-none">
                Forge AI
              </span>
              <span className="text-[11px] text-muted leading-tight mt-0.5">
                Launchpad
              </span>
            </div>
          </Link>

          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-6 text-[13px] font-medium text-muted"
          >
            <Link to="/home" className="hover:text-ink transition-colors">
              Overview
            </Link>
            <Link to="/projects" className="hover:text-ink transition-colors">
              Projects
            </Link>
            <Link to="/studio-3d" className="hover:text-ink transition-colors">
              3D Studio
            </Link>
            <Link to="/flow" className="hover:text-ink transition-colors">
              Flow Engine
            </Link>
            <Link to="/marketplace" className="hover:text-ink transition-colors">
              Marketplace
            </Link>
          </nav>

          <div className="flex items-center gap-2.5">
            <ThemeToggle compact />
            <Link
              to="/login"
              className="hidden sm:inline-flex items-center justify-center h-9 px-3.5 rounded-md text-[13px] font-medium text-ink hover:bg-panel-alt transition-colors"
            >
              Sign in
            </Link>
            <Link
              to="/build/demo-project"
              className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-pill bg-ink hover:bg-ink/90 text-on-ink text-[13px] font-semibold transition-colors shadow-apple"
            >
              <span>Open Workspace</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </header>

      {/* 2. Main Studio Stage */}
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-10 space-y-8">
        {/* Top Section: Headline + Prompt Compiler */}
        <section className="space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div className="space-y-2 max-w-2xl">
              <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.14em] text-accent">
                01. Specification Compiler
              </p>
              <h1 className="font-display text-3xl sm:text-4xl lg:text-[42px] font-semibold tracking-tight text-ink leading-[1.08]">
                Compile architecture into production code.
              </h1>
              <p className="text-sm sm:text-[15px] text-muted leading-relaxed">
                Describe a system, choose a runtime profile below, and dispatch the 6-specialist swarm directly into the cloud IDE.
              </p>
            </div>

            <div className="flex items-center gap-6 text-xs font-mono text-muted tabular">
              <div>
                <div className="text-[10px] uppercase tracking-wider">Cluster</div>
                <div className="text-sm font-semibold text-ink mt-0.5">
                  {currentConfig.specCode} · {currentConfig.clusterRegion}
                </div>
              </div>
              <div className="h-8 w-px bg-border" />
              <div>
                <div className="text-[10px] uppercase tracking-wider">Median Synthesis</div>
                <div className="text-sm font-semibold text-ink mt-0.5">
                  {currentConfig.avgSynthesisTime}
                </div>
              </div>
            </div>
          </div>

          {/* Prompt Bar */}
          <div className="rounded-lg border border-border bg-panel p-4 sm:p-5 shadow-apple space-y-3.5">
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-stretch gap-3">
              <div className="relative flex-1 min-w-0">
                <Terminal
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                />
                <label htmlFor="launch-primary-input" className="sr-only">
                  Software specification prompt
                </label>
                <input
                  id="launch-primary-input"
                  ref={inputRef}
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe your application requirement (e.g. Next.js SaaS with Stripe checkout, auth, and agent copilot)..."
                  aria-label="Software specification prompt"
                  className="w-full h-11 rounded-md border border-border bg-panel-alt pl-10 pr-9 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
                />
                {prompt && (
                  <button
                    type="button"
                    onClick={() => setPrompt("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors cursor-pointer"
                    aria-label="Clear prompt"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-pill bg-ink hover:bg-ink/90 text-on-ink text-sm font-semibold transition-colors shadow-apple shrink-0 cursor-pointer"
              >
                <span>Build project</span>
                <CornerDownLeft size={15} />
              </button>
            </form>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] font-medium text-muted mr-1">
                Starter blueprints:
              </span>
              {QUICK_STACKS.map((stack) => (
                <button
                  key={stack}
                  type="button"
                  onClick={() => {
                    setPrompt(stack);
                    inputRef.current?.focus();
                  }}
                  className="px-2.5 py-1 rounded-sm border border-border bg-panel-alt hover:border-accent hover:text-accent text-xs font-medium text-muted transition-colors cursor-pointer"
                >
                  {stack}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Bottom 12-Column Stage: Runtime Profiles (4) + Interactive 3D Engine Rig (8) */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Column: Runtime Selector & Throughput Metrics */}
          <div className="lg:col-span-4 flex flex-col justify-between gap-5">
            <div className="rounded-lg border border-border bg-panel p-5 shadow-apple space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.12em] text-muted">
                    02. Runtime Profile
                  </p>
                  <h2 className="font-display text-lg font-semibold text-ink mt-0.5">
                    {currentConfig.name}
                  </h2>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handlePrevConfig}
                    aria-label="Previous runtime profile"
                    className="h-8 w-8 rounded-sm border border-border bg-panel-alt hover:border-accent text-ink flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={handleNextConfig}
                    aria-label="Next runtime profile"
                    className="h-8 w-8 rounded-sm border border-border bg-panel-alt hover:border-accent text-ink flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {FORGE_CONFIGS.map((cfg, idx) => {
                  const active = idx === configIndex;
                  return (
                    <button
                      key={cfg.id}
                      type="button"
                      onClick={() => setConfigIndex(idx)}
                      className={`w-full text-left p-3.5 rounded-md border transition-all cursor-pointer ${
                        active
                          ? "border-accent bg-accent-soft"
                          : "border-border bg-panel-alt/60 hover:border-faint"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] font-semibold text-muted">
                            {cfg.id}
                          </span>
                          <span className="font-display text-sm font-semibold text-ink">
                            {cfg.name}
                          </span>
                        </div>
                        {active && <CheckCircle2 size={15} className="text-accent shrink-0" />}
                      </div>
                      <p className="text-xs text-muted mt-1">{cfg.stackName}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Weekly Synthesis Cadence Card */}
            <div className="rounded-lg border border-border bg-panel p-5 shadow-apple space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[11px] font-medium text-muted">
                    Tasks Delivered
                  </span>
                  <div className="font-mono text-2xl font-semibold text-ink tabular mt-0.5">
                    {currentConfig.tasksResolved}
                  </div>
                </div>
                <div>
                  <span className="text-[11px] font-medium text-muted">
                    Builds Deployed
                  </span>
                  <div className="font-mono text-2xl font-semibold text-ink tabular mt-0.5">
                    {currentConfig.buildsDeployed}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-border">
                <div className="flex items-center justify-between text-[11px] text-muted mb-2.5">
                  <span>7-day deployment cadence</span>
                  <span className="font-mono text-ink font-semibold">
                    {currentConfig.activeAgents}
                  </span>
                </div>
                <div className="grid grid-cols-7 gap-2 items-end h-20">
                  {currentConfig.barsBuilds.map((pct, i) => (
                    <div key={DAYS[i]} className="flex flex-col items-center gap-1.5 h-full justify-end">
                      <div className="w-full bg-panel-alt rounded-t-[3px] flex items-end h-14 overflow-hidden">
                        <div
                          style={{ height: `${pct}%` }}
                          className={`w-full rounded-t-[3px] transition-all duration-300 ${
                            i === 6 ? "bg-accent" : "bg-ink/25"
                          }`}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-muted">{DAYS[i]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Live Interactive 3D Architecture Rig */}
          <div className="lg:col-span-8 flex flex-col rounded-lg border border-border bg-panel shadow-apple-lg overflow-hidden min-h-[460px] lg:min-h-[540px]">
            <div className="px-5 py-3.5 border-b border-border flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Box size={16} className="text-accent shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink truncate">
                    {currentConfig.name} — {currentConfig.subtitle}
                  </div>
                  <div className="text-xs font-mono text-muted truncate">
                    {currentConfig.stackName}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  to="/studio-3d"
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-sm border border-border bg-panel-alt hover:border-accent text-xs font-medium text-ink transition-colors"
                >
                  <Layers size={13} />
                  <span>Full 3D Studio</span>
                </Link>
                <button
                  type="button"
                  onClick={() => navigate("/build/demo-project")}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-pill bg-ink text-panel hover:opacity-90 text-xs font-medium transition-opacity cursor-pointer"
                >
                  <Cpu size={13} />
                  <span>Open IDE</span>
                </button>
              </div>
            </div>

            <div className="flex-1 relative min-h-[400px]">
              <ForgeScene3D
                mode="embedded"
                initialFinish={currentConfig.finish}
                activeAgentId={currentConfig.activeAgentId}
                showControls
                className="w-full h-full min-h-[400px]"
              />
            </div>
          </div>
        </section>
      </main>

      {/* 3. Quiet Architectural Footer */}
      <footer className="border-t border-border bg-panel">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-4 text-xs text-muted">
          <div className="flex items-center gap-3 font-mono">
            <span className="font-semibold text-ink">Forge AI</span>
            <span>·</span>
            <span>{currentConfig.specCode}</span>
            <span>·</span>
            <span>{currentConfig.clusterRegion}</span>
          </div>
          <div className="flex items-center gap-5">
            <Link to="/projects" className="hover:text-ink transition-colors">
              Projects
            </Link>
            <Link to="/initiatives" className="hover:text-ink transition-colors">
              Initiatives
            </Link>
            <Link to="/studio-3d" className="hover:text-ink transition-colors">
              3D Studio
            </Link>
            <Link to="/build/demo-project" className="text-accent font-medium hover:underline">
              Workspace IDE
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
