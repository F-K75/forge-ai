import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  CornerDownLeft,
  Terminal,
  ChevronRight,
  X,
  RotateCw,
  FolderGit2,
  Cpu,
  Layers,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import BrandLogo from "../components/BrandLogo";
import { ForgeWorkstationVisual, ForgeSwarmVisual } from "../components/CyberpunkVehicleVisual";

// Audio telemetry sound generator via Web Audio API (safe, zero external dependencies)
class CyberAudioSynth {
  private ctx: AudioContext | null = null;

  private init() {
 if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
  }

  playClick(pitch = 880) {
    try {
      this.init();
      if (!this.ctx) return;
 if (this.ctx.state === "suspended") {
        this.ctx.resume();
      }
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
 osc.type = "sine";
      osc.frequency.setValueAtTime(pitch, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(pitch * 1.8, this.ctx.currentTime + 0.04);

      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.045);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch {
      // Audio fallback
    }
  }

  playSwitch() {
    try {
      this.init();
      if (!this.ctx) return;
 if (this.ctx.state === "suspended") {
        this.ctx.resume();
      }
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
 osc.type = "triangle";
      osc.frequency.setValueAtTime(220, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, this.ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.09);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.1);
    } catch {
      // Audio fallback
    }
  }
}

const synth = new CyberAudioSynth();

/**
 * Standardized industrial corner bracket lines across cards and HUD modules
 */
function CornerLines({
 color = "border-black/70 dark:border-white/50",
 size = "w-2.5 h-2.5",
 thickness = "border-t-2 border-l-2",
 inset = "p-0",
}: {
  color?: string;
  size?: string;
  thickness?: string;
  inset?: string;
}) {
  return (
 <div className={`absolute inset-0 pointer-events-none ${inset}`} aria-hidden="true">
      {/* Top Left */}
      <span className={`absolute top-0 left-0 ${size} ${color} border-t-2 border-l-2`} />
      {/* Top Right */}
      <span className={`absolute top-0 right-0 ${size} ${color} border-t-2 border-r-2`} />
      {/* Bottom Left */}
      <span className={`absolute bottom-0 left-0 ${size} ${color} border-b-2 border-l-2`} />
      {/* Bottom Right */}
      <span className={`absolute bottom-0 right-0 ${size} ${color} border-b-2 border-r-2`} />
    </div>
  );
}

interface ForgeEngineConfig {
  id: string;
  name: string;
  subtitle: string;
  stackName: string;
 variant: "orange" | "cyan" | "lime";
  tasksResolved: string;
  buildsDeployed: string;
  activeAgents: string;
  avgSynthesisTime: string;
  specCode: string;
  clusterRegion: string;
  serial: string;
  barsTasks: number[];
  barsBuilds: number[];
}

const FORGE_CONFIGS: ForgeEngineConfig[] = [
  {
 id: "001",
 name: "FORGE",
 subtitle: "AUTONOMOUS SOFTWARE RUNTIME",
 stackName: "Next.js 15 · Tailwind CSS · PostgreSQL",
 variant: "orange",
 tasksResolved: "2,628",
 buildsDeployed: "1,628",
 activeAgents: "6 active agents",
 avgSynthesisTime: "18.4s",
 specCode: "Cluster FG-9000",
 clusterRegion: "US-EAST",
 serial: "FG-89D7",
    barsTasks: [45, 65, 85, 55, 95, 75, 90],
    barsBuilds: [30, 50, 70, 40, 80, 60, 75],
  },
  {
 id: "002",
 name: "SWARM",
 subtitle: "MULTI-AGENT ORCHESTRATION PIPELINE",
 stackName: "FastAPI · React · Distributed Workers",
 variant: "cyan",
 tasksResolved: "3,842",
 buildsDeployed: "2,190",
 activeAgents: "8 active pods",
 avgSynthesisTime: "12.1s",
 specCode: "Pipeline SW-V4",
 clusterRegion: "EU-WEST",
 serial: "SW-44X9",
    barsTasks: [60, 80, 70, 95, 65, 90, 100],
    barsBuilds: [45, 60, 55, 75, 50, 70, 85],
  },
  {
 id: "003",
 name: "APEX",
 subtitle: "DISTRIBUTED ENTERPRISE CODEGEN",
 stackName: "Go · Kubernetes · Redis · AST Parser",
 variant: "lime",
 tasksResolved: "4,950",
 buildsDeployed: "3,440",
 activeAgents: "12 active agents",
 avgSynthesisTime: "9.8s",
 specCode: "Engine APEX-99",
 clusterRegion: "AP-SOUTH",
 serial: "AP-9901",
    barsTasks: [75, 90, 85, 100, 80, 95, 90],
    barsBuilds: [55, 70, 65, 85, 60, 80, 90],
  },
];

const QUICK_STACKS = [
 "Next.js SaaS with Stripe & Auth",
 "FastAPI AI Agent with Background Tasks",
 "Production PRD to Code Pipeline",
 "Real-Time Analytics & Telemetry Dashboard",
];

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

export default function Launch() {
  const navigate = useNavigate();
 const [prompt, setPrompt] = useState("");
  const [configIndex, setConfigIndex] = useState(0);
  const [soundEnabled] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pipelineLoads, setPipelineLoads] = useState([85, 92, 78, 96]);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentConfig = FORGE_CONFIGS[configIndex];

 const handleSound = (type: "click" | "switch" = "click") => {
    if (!soundEnabled) return;
 if (type === "switch") {
      synth.playSwitch();
    } else {
      synth.playClick();
    }
  };

  const handleNextConfig = () => {
 handleSound("switch");
    setConfigIndex((prev) => (prev + 1) % FORGE_CONFIGS.length);
  };

  const handlePrevConfig = () => {
 handleSound("switch");
    setConfigIndex((prev) => (prev - 1 + FORGE_CONFIGS.length) % FORGE_CONFIGS.length);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
 handleSound("click");
    const query = prompt.trim();
    if (!query) {
 navigate("/build/demo-project");
      return;
    }
    navigate(`/build/demo-project?prompt=${encodeURIComponent(query)}`);
  };

  const handleChannelClick = (idx: number) => {
 handleSound("click");
    setPipelineLoads((prev) => {
      const next = [...prev];
      next[idx] = Math.floor(Math.random() * 35) + 65;
      return next;
    });
  };

  return (
 <div className="min-h-screen bg-base dark:bg-[#0F1115] text-[#0A0C0E] dark:text-[#E6EDF3] flex flex-col justify-between selection:bg-[#FF5522] selection:text-white transition-colors font-sans antialiased overflow-x-hidden">
      {/* ========================================================================= */}
      {/* 1. SUB-HEADER TECHNICAL HUD TELEMETRY LAYER (FORGE WORKSPACE SPECS)       */}
      {/* ========================================================================= */}
 <section className="w-full max-w-[1720px] mx-auto px-4 sm:px-8 py-3 sm:py-4">
 <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6 items-center">
          {/* Left: Industrial Spec Label Badge for Forge System */}
 <div className="md:col-span-3 flex items-center">
 <div className="relative w-full max-w-xs border border-black/80 dark:border-white/30 bg-white/30 dark:bg-black/30 p-2.5 font-mono">
 <CornerLines color="border-black/50 dark:border-white/40" size="w-1.5 h-1.5" />
 <div className="flex items-center justify-between text-[11px] font-black text-black dark:text-white border-b border-black/40 dark:border-white/20 pb-1 mb-1">
                <span>Cluster region</span>
 <span className="font-bold text-[#FF5522]">{currentConfig.clusterRegion}</span>
              </div>
 <div className="flex items-center justify-between py-0.5">
 <span className="text-xs font-black tracking-wider text-black dark:text-white">Autonomous engine</span>
 <div className="border border-black/60 dark:border-white/40 px-1.5 py-0.5 text-[9px] font-bold text-[#FF5522]">
                  v2.4
                </div>
              </div>
              {/* Barcode Graphic */}
 <div className="pt-1.5 border-t border-black/40 dark:border-white/20 flex items-center justify-between">
 <div className="flex items-center gap-0.5 h-5" aria-hidden="true">
                  {[2, 4, 1, 3, 5, 2, 1, 4, 2, 3, 1, 4, 3, 2, 5, 1, 3].map((w, i) => (
                    <span
                      key={i}
                      style={{ width: `${w * 1.4}px` }}
 className="h-full bg-black dark:bg-white inline-block"
                    />
                  ))}
                </div>
 <span className="text-[10px] font-mono font-bold tracking-widest text-black dark:text-white">
                  {currentConfig.serial}
                </span>
              </div>
            </div>
          </div>

          {/* Center: Monolithic Brand Display Logo */}
 <div className="md:col-span-5 flex items-center justify-center gap-3">
 <h1 className="text-5xl sm:text-7xl md:text-8xl font-black tracking-tighter text-black dark:text-white leading-none select-none uppercase">
              {currentConfig.name}
            </h1>
 <div className="flex flex-col justify-center">
              <span
 className="font-mono text-[9px] sm:text-[10px] font-black tracking-widest uppercase text-black dark:text-white select-none whitespace-nowrap"
                style={{
 writingMode: "vertical-lr",
 transform: "rotate(180deg)",
                }}
              >
                {currentConfig.subtitle}
              </span>
            </div>
          </div>

          {/* Right: Agent Swarm Pipeline Load & Core Specs */}
 <div className="md:col-span-4 flex items-center justify-end gap-3 font-mono">
            {/* Pipeline Equalizer */}
 <div className="relative border border-black/80 dark:border-white/30 bg-white/30 dark:bg-black/30 p-2 sm:p-2.5">
 <CornerLines color="border-black/50 dark:border-white/40" size="w-1.5 h-1.5" />
 <div className="flex items-end gap-1.5 h-10 mb-1 px-1">
                {pipelineLoads.map((val, idx) => {
 const channelLabels = ["Architecture", "Engineering", "Testing & QA", "Deployment & Ops"];
                  return (
                    <button
                      key={idx}
 type="button"
                      onClick={() => handleChannelClick(idx)}
 className="w-3.5 bg-black/20 dark:bg-white/20 h-full flex items-end justify-center hover:opacity-80 transition cursor-pointer"
 title={`${channelLabels[idx] || "Pipeline channel"}: ${val}% load capacity`}
 aria-label={`${channelLabels[idx] || "Pipeline channel"}: ${val}% load capacity`}
                    >
                      <span
                        style={{ height: `${val}%` }}
 className={`w-full ${idx === 0 ? "bg-[#FF5522]" : "bg-black dark:bg-white"} transition-all duration-300`}
                      />
                    </button>
                  );
                })}
              </div>
 <div className="flex items-center justify-between text-[9px] font-black tracking-wider text-black dark:text-white border-t border-black/40 dark:border-white/20 pt-1">
 <span title="Architecture specialist">ARC</span>
 <span title="Engineering specialist">DEV</span>
 <span title="Quality assurance & test suite">QA</span>
 <span title="DevOps and continuous deployment">OPS</span>
              </div>
            </div>

            {/* Forge Engine Status Box */}
 <div className="relative border border-black/80 dark:border-white/30 bg-white/30 dark:bg-black/30 p-2 sm:p-2.5 min-w-[170px] text-xs">
 <CornerLines color="border-black/50 dark:border-white/40" size="w-1.5 h-1.5" />
 <div className="flex items-center justify-between text-[10px] font-black border-b border-black/40 dark:border-white/20 pb-1 mb-1 text-black dark:text-white">
                <span>{currentConfig.specCode}</span>
 <span className="w-2 h-2 rounded-full bg-[#FF5522] animate-pulse" title="Engine operational" />
              </div>
 <div className="space-y-1">
 <div className="flex items-center justify-between text-[9px]">
 <span className="text-black/70 dark:text-white/70">Agent fleet</span>
 <span className="font-black text-black dark:text-white border border-black/40 dark:border-white/30 px-1 py-0.5">
                    {currentConfig.activeAgents}
                  </span>
                </div>
 <div className="flex items-center justify-between text-[9px]">
 <span className="text-black/70 dark:text-white/70">Average synthesis</span>
 <span className="font-black text-black dark:text-white border border-black/40 dark:border-white/30 px-1 py-0.5">
                    {currentConfig.avgSynthesisTime}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2.5 PRIMARY PROMPT WRITER (PLACED PROMINENTLY ABOVE SHOWCASE CARDS)        */}
      {/* ========================================================================= */}
 <section className="w-full max-w-[1720px] mx-auto px-4 sm:px-8 py-2 z-20">
 <div className="relative border border-border bg-white/70 dark:bg-black/70 backdrop-blur-md p-3 sm:p-4">
 <CornerLines color="border-black dark:border-white/70" size="w-3 h-3" />

          {/* Main Input Form with Rock-Solid Flex & Alignment */}
 <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-stretch gap-2.5 w-full">
            {/* Lead Prompt Badge */}
 <div className="flex items-center justify-center gap-2 bg-black text-white px-4 py-2.5 border border-black shrink-0">
 <Terminal size={15} className="text-[#FF5522]" strokeWidth={2.5} />
 <label htmlFor="launch-primary-input" className="text-xs font-mono font-black tracking-wider uppercase whitespace-nowrap cursor-pointer">
                Prompt
              </label>
            </div>

            {/* Input Container: explicitly flex-1 min-w-0 to prevent shrinking/squishing */}
 <div className="relative flex-1 min-w-0">
              <input
 id="launch-primary-input"
                ref={inputRef}
 type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
 placeholder="Describe your application requirement (e.g. Next.js SaaS with Stripe checkout, auth, and agent copilot)..."
 aria-label="Software specification prompt"
 className="w-full h-full bg-white dark:bg-[#12151B] border border-border/80 dark:border-white/30 px-4 py-2.5 text-xs sm:text-sm font-mono font-bold text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#FF5522]"
              />
              {prompt && (
                <button
 type="button"
 onClick={() => setPrompt("")}
 className="absolute right-3 top-1/2 -translate-y-1/2 text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white cursor-pointer"
 title="Clear prompt input"
 aria-label="Clear prompt"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Execute Button */}
            <button
 type="submit"
 onClick={() => handleSound("click")}
 className="flex items-center justify-center gap-2 px-6 py-2.5 bg-[#FF5522] hover:bg-black hover:text-white text-black font-mono font-black text-xs uppercase tracking-wider border border-border active:translate-x-[2px] active:translate-y-[2px] transition shrink-0 cursor-pointer"
 title="Generate application in Workspace IDE"
            >
              <span>Build project</span>
              <CornerDownLeft size={14} strokeWidth={2.5} />
            </button>
          </form>

          {/* Preset Buttons Grid */}
 <div className="flex flex-wrap items-center gap-2 mt-3 pt-2.5 border-t border-black/20 dark:border-white/20">
 <span className="text-[10px] font-mono font-black uppercase text-black/70 dark:text-white/70 mr-1 select-none">
              Quick templates:
            </span>
            {QUICK_STACKS.map((stack) => (
              <button
                key={stack}
 type="button"
                onClick={() => {
 handleSound("click");
                  setPrompt(stack);
                  inputRef.current?.focus();
                }}
 className="px-3 py-1 bg-black/5 dark:bg-white/10 hover:bg-[#FF5522] hover:text-black text-black dark:text-white border border-black/50 dark:border-white/30 text-[10px] font-mono font-bold uppercase transition cursor-pointer"
                title={`Use template: ${stack}`}
              >
                [{stack}]
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. MAIN SHOWCASE STAGE: CARD 002 (SWARM) & CARD 001 (AUTONOMOUS RIG)       */}
      {/* ========================================================================= */}
 <main className="w-full max-w-[1720px] mx-auto px-4 sm:px-8 flex-1 flex flex-col justify-center my-2">
 <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch min-h-[380px] sm:min-h-[440px]">
          {/* =================== CARD 002: AUTONOMOUS AGENT SWARM =================== */}
 <div className="lg:col-span-4 bg-black text-white relative flex flex-col justify-between p-5 sm:p-6 overflow-hidden border border-border select-none">
 <CornerLines color="border-white/70" size="w-3.5 h-3.5" />

            {/* Giant Rotated Vertical Number 002 on Right Edge */}
 <div className="absolute right-4 top-1/2 -translate-y-1/2 font-mono font-black text-6xl sm:text-7xl md:text-8xl tracking-tighter text-white select-none pointer-events-none opacity-90 z-20" aria-hidden="true">
              <span
                style={{
 writingMode: "vertical-rl",
 transform: "rotate(180deg)",
                }}
              >
                002
              </span>
            </div>

            {/* Neural Agent Swarm Topology Visual */}
 <div className="relative z-10 my-auto -mr-4">
              <ForgeSwarmVisual variant={currentConfig.variant} />
            </div>

            {/* Bottom Floating Translucent Glass Card */}
 <div className="relative z-20 bg-white/10 backdrop-blur-md border border-white/30 p-3.5 sm:p-4 max-w-[260px]">
 <CornerLines color="border-white/60" size="w-2 h-2" />
 <div className="flex items-baseline gap-2 mb-2">
 <span className="text-2xl sm:text-3xl font-mono font-black text-white leading-none">
                  {currentConfig.buildsDeployed}
                </span>
 <span className="text-[11px] font-mono text-white/70 uppercase">Builds deployed</span>
              </div>

              {/* 7-Day Mini Bar Equalizer Chart & Radial Gauge */}
 <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/20">
                {/* Mini Weekly Bars */}
 <div className="flex items-end gap-1.5 h-7">
                  {currentConfig.barsBuilds.map((height, i) => (
 <div key={i} className="flex flex-col items-center gap-0.5">
                      <span
                        style={{ height: `${height * 0.24}px` }}
 className={`w-1.5 ${i === 4 ? "bg-[#FF5522]" : "bg-white"} rounded-none transition-all duration-300`}
                      />
 <span className="text-[8px] font-mono text-white/60">{DAYS[i]}</span>
                    </div>
                  ))}
                </div>

                {/* Circular Gauge */}
 <div className="relative w-8 h-8 rounded-full border-2 border-white/30 flex items-center justify-center" title="99% test success rate">
 <div className="absolute inset-0 rounded-full border-2 border-t-[#FF5522] border-r-transparent border-b-transparent border-l-transparent animate-spin" />
 <span className="text-[9px] font-mono font-bold text-white">
                    99%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* =================== CARD 001: FULLSTACK IDE RIG =================== */}
          <div
            className={`lg:col-span-8 ${
 currentConfig.variant === "cyan"
 ? "bg-[#00F0FF] text-black"
 : currentConfig.variant === "lime"
 ? "bg-[#00F59B] text-black"
 : "bg-[#FF5522] text-black"
            } relative flex flex-col justify-between p-5 sm:p-6 overflow-hidden border border-border select-none transition-colors duration-500`}
          >
 <CornerLines color="border-black" size="w-3.5 h-3.5" />

            {/* Giant Rotated Vertical Number 001 on Right Edge */}
 <div className="absolute right-4 top-1/2 -translate-y-1/2 font-mono font-black text-6xl sm:text-7xl md:text-8xl tracking-tighter text-black select-none pointer-events-none opacity-90 z-20" aria-hidden="true">
              <span
                style={{
 writingMode: "vertical-rl",
 transform: "rotate(180deg)",
                }}
              >
                001
              </span>
            </div>

            {/* Top Row Controls: [ ← ] Next Stack & Open Workspace Shortcut */}
 <div className="relative z-30 flex items-center justify-between">
 <div className="flex items-center gap-2">
                <button
 type="button"
                  onClick={handleNextConfig}
 className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white/90 hover:bg-white text-black font-mono font-black text-xs uppercase tracking-wider border border-black hover:scale-105 active:scale-95 transition cursor-pointer"
 title="Switch to next architecture template"
                >
 <span className="text-sm">←</span>
                  <span>Next stack</span>
                </button>
                <button
 type="button"
                  onClick={handlePrevConfig}
 className="px-2 py-1.5 bg-white/60 hover:bg-white text-black font-mono font-bold text-xs uppercase border border-black transition cursor-pointer"
 title="Switch to previous architecture template"
                >
                  →
                </button>
 <span className="hidden sm:inline-block px-2.5 py-1 bg-black/15 text-black font-mono font-bold text-[11px] uppercase border border-black/30">
                  {currentConfig.stackName}
                </span>
              </div>

              {/* Direct Workspace IDE Link */}
              <button
 type="button"
                onClick={() => {
 handleSound("click");
 navigate("/build/demo-project");
                }}
 className="hidden sm:inline-flex items-center gap-2 px-3.5 py-1.5 bg-black text-white font-mono font-black text-xs uppercase tracking-wider hover:bg-white hover:text-black border border-black transition cursor-pointer"
 title="Open Cloud Workspace IDE"
              >
                <Terminal size={13} strokeWidth={2.5} />
                <span>Open IDE</span>
              </button>
            </div>

            {/* Centerpiece: The High-Tech Autonomous Workstation & Code Synthesis Engine */}
 <div className="relative z-10 my-auto py-2">
              <ForgeWorkstationVisual
                variant={currentConfig.variant}
 modelName={currentConfig.name.replace(".", "")}
                activeStack={currentConfig.stackName}
              />
            </div>

            {/* Bottom Floating Translucent Glass Card */}
 <div className="relative z-20 bg-black/15 backdrop-blur-md border border-black/30 p-3.5 sm:p-4 max-w-[280px]">
 <CornerLines color="border-black/60" size="w-2 h-2" />
 <div className="flex items-baseline gap-2 mb-2">
 <span className="text-2xl sm:text-3xl font-mono font-black text-black leading-none">
                  {currentConfig.tasksResolved}
                </span>
 <span className="text-[11px] font-mono text-black/80 uppercase font-bold">Tasks delivered</span>
              </div>

              {/* 7-Day Mini Bar Equalizer Chart & Radial Gauge */}
 <div className="flex items-center justify-between gap-3 pt-2 border-t border-black/20">
                {/* Mini Weekly Bars */}
 <div className="flex items-end gap-1.5 h-7">
                  {currentConfig.barsTasks.map((height, i) => (
 <div key={i} className="flex flex-col items-center gap-0.5">
                      <span
                        style={{ height: `${height * 0.24}px` }}
 className={`w-1.5 ${i === 4 ? "bg-black" : "bg-white"} rounded-none transition-all duration-300`}
                      />
 <span className="text-[8px] font-mono text-black/80 font-bold">{DAYS[i]}</span>
                    </div>
                  ))}
                </div>

                {/* Circular Radial Gauge */}
 <div className="relative w-8 h-8 rounded-full border border-border/40 flex items-center justify-center" title="Active sprint velocity">
 <div className="absolute inset-0 rounded-full border-2 border-t-white border-r-transparent border-b-transparent border-l-transparent animate-spin" />
 <span className="text-[9px] font-mono font-bold text-black">
                    {currentConfig.tasksResolved.slice(0, 2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ========================================================================= */}
      {/* 4. FOOTER SPECIFICATIONS & TELEMETRY                                      */}
      {/* ========================================================================= */}
 <footer className="w-full border-t border-black/80 dark:border-white/20 bg-base dark:bg-[#0F1115] px-4 sm:px-8 py-3 text-xs font-mono">
 <div className="max-w-[1720px] mx-auto flex flex-wrap items-center justify-between gap-4">
 <div className="flex items-center gap-4 text-black/70 dark:text-white/70 text-[11px] font-bold">
            <span>Engine: {currentConfig.specCode}</span>
            <span>•</span>
            <span>Status: Healthy (autonomous multi-agent swarm)</span>
            <span>•</span>
 <span className="text-[#FF5522]">Telemetry active</span>
          </div>

 <div className="flex items-center gap-3 text-[11px]">
            <button
 type="button"
              onClick={() => {
                handleSound();
 navigate("/projects");
              }}
 className="hover:underline font-bold text-black dark:text-white cursor-pointer"
            >
              Projects
            </button>
            <span>/</span>
            <button
 type="button"
              onClick={() => {
                handleSound();
 navigate("/initiatives");
              }}
 className="hover:underline font-bold text-black dark:text-white cursor-pointer"
            >
              Initiatives
            </button>
            <span>/</span>
            <button
 type="button"
              onClick={() => {
                handleSound();
 navigate("/build/demo-project");
              }}
 className="hover:underline font-bold text-[#FF5522] cursor-pointer"
            >
              Workspace IDE
            </button>
            <span>/</span>
            <button
 type="button"
              onClick={() => {
                handleSound();
 navigate("/home");
              }}
 className="hover:underline font-bold text-black dark:text-white cursor-pointer"
            >
              Overview
            </button>
          </div>
        </div>
      </footer>

      {/* ========================================================================= */}
      {/* 6. SLIDE-OUT HUD SYSTEM CONTROL DRAWER (ALL WEBSITE PAGES)                */}
      {/* ========================================================================= */}
      {menuOpen && (
 <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
 <div className="w-full max-w-md bg-base dark:bg-[#12151A] border-l-2 border-black dark:border-white/30 h-full p-6 sm:p-8 flex flex-col justify-between font-mono">
            <div>
              {/* Drawer Header */}
 <div className="flex items-center justify-between border-b border-black dark:border-white/20 pb-4 mb-6">
 <div className="flex items-center gap-3">
 <BrandLogo size="xs" />
                  <div>
 <h2 className="font-mono font-black text-sm uppercase tracking-widest text-black dark:text-white leading-tight">
                      System navigation
                    </h2>
 <span className="text-[10px] text-[#FF5522] font-bold tracking-wider uppercase">
                      Live cluster telemetry
                    </span>
                  </div>
                </div>
                <button
 type="button"
                  onClick={() => {
                    handleSound();
                    setMenuOpen(false);
                  }}
 className="p-1.5 border border-black dark:border-white/40 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition cursor-pointer"
 title="Close navigation drawer"
 aria-label="Close navigation drawer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Navigation Items to Real Website Pages */}
 <div className="space-y-3">
                <button
 type="button"
                  onClick={() => {
                    handleSound();
                    setMenuOpen(false);
 navigate("/projects");
                  }}
 className="w-full flex items-center justify-between p-3 border border-black dark:border-white/30 bg-white/40 dark:bg-black/40 hover:bg-[#FF5522] hover:text-black transition text-left font-black text-xs uppercase cursor-pointer"
                >
 <div className="flex items-center gap-2">
                    <FolderGit2 size={15} />
                    <span>01 · Projects & repositories</span>
                  </div>
                  <ChevronRight size={14} />
                </button>
                <button
 type="button"
                  onClick={() => {
                    handleSound();
                    setMenuOpen(false);
 navigate("/build/demo-project");
                  }}
 className="w-full flex items-center justify-between p-3 border border-black dark:border-white/30 bg-white/40 dark:bg-black/40 hover:bg-[#FF5522] hover:text-black transition text-left font-black text-xs uppercase cursor-pointer"
                >
 <div className="flex items-center gap-2">
                    <Terminal size={15} />
                    <span>02 · Workspace & code IDE</span>
                  </div>
                  <ChevronRight size={14} />
                </button>
                <button
 type="button"
                  onClick={() => {
                    handleSound();
                    setMenuOpen(false);
 navigate("/initiatives");
                  }}
 className="w-full flex items-center justify-between p-3 border border-black dark:border-white/30 bg-white/40 dark:bg-black/40 hover:bg-[#FF5522] hover:text-black transition text-left font-black text-xs uppercase cursor-pointer"
                >
 <div className="flex items-center gap-2">
                    <Layers size={15} />
                    <span>03 · Initiatives & roadmaps</span>
                  </div>
                  <ChevronRight size={14} />
                </button>
                <button
 type="button"
                  onClick={() => {
                    handleSound();
                    setMenuOpen(false);
 navigate("/marketplace");
                  }}
 className="w-full flex items-center justify-between p-3 border border-black dark:border-white/30 bg-white/40 dark:bg-black/40 hover:bg-[#FF5522] hover:text-black transition text-left font-black text-xs uppercase cursor-pointer"
                >
 <div className="flex items-center gap-2">
                    <Sparkles size={15} />
                    <span>04 · Agent marketplace</span>
                  </div>
                  <ChevronRight size={14} />
                </button>
                <button
 type="button"
                  onClick={() => {
                    handleSound();
                    setMenuOpen(false);
 navigate("/flow");
                  }}
 className="w-full flex items-center justify-between p-3 border border-black dark:border-white/30 bg-white/40 dark:bg-black/40 hover:bg-[#FF5522] hover:text-black transition text-left font-black text-xs uppercase cursor-pointer"
                >
 <div className="flex items-center gap-2">
                    <Cpu size={15} />
                    <span>05 · Flow architecture</span>
                  </div>
                  <ChevronRight size={14} />
                </button>
                <button
 type="button"
                  onClick={() => {
                    handleSound();
                    setMenuOpen(false);
 navigate("/home");
                  }}
 className="w-full flex items-center justify-between p-3 border border-black dark:border-white/30 bg-white/40 dark:bg-black/40 hover:bg-[#FF5522] hover:text-black transition text-left font-black text-xs uppercase cursor-pointer"
                >
 <div className="flex items-center gap-2">
                    <ExternalLink size={15} />
                    <span>06 · Documentation & guide</span>
                  </div>
                  <ChevronRight size={14} />
                </button>
              </div>

              {/* Hardware / Engine Spec Box in Drawer */}
 <div className="mt-8 border border-black/60 dark:border-white/30 p-4 bg-white/20 dark:bg-black/20 text-xs">
 <div className="font-black mb-2 text-black dark:text-white uppercase tracking-wider">
                  Active runtime: {currentConfig.name}
                </div>
 <div className="space-y-1 text-[11px] text-black/70 dark:text-white/70">
                  <div>Stack: {currentConfig.stackName}</div>
                  <div>Average speed: {currentConfig.avgSynthesisTime}</div>
                  <div>Fleet: {currentConfig.activeAgents}</div>
                  <div>Serial ID: {currentConfig.serial}</div>
                </div>
              </div>
            </div>

 <div className="pt-4 border-t border-black/40 dark:border-white/20 flex items-center justify-between text-[11px]">
 <span className="font-bold text-black/60 dark:text-white/60">Forge CLI v2.4</span>
              <button
 type="button"
                onClick={handleNextConfig}
 className="flex items-center gap-1 font-bold text-[#FF5522] hover:underline cursor-pointer"
 title="Cycle to next engine stack"
              >
                <RotateCw size={12} />
                <span>Next engine</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
