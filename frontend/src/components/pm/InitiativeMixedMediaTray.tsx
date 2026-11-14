import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Volume2,
  VolumeX,
  Play,
  Pause,
  Sparkles,
  Bot,
  ChevronDown,
  ChevronUp,
  Layers,
  Maximize2,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  FileCode2,
  Zap,
  Activity,
  TrendingUp,
  BookmarkPlus,
  Copy,
  Check,
  PanelRight,
  X,
  SlidersHorizontal,
  ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { PMInitiative, PMEpic, PMSprint } from '../../lib/types/api';
import type {
  AudioBriefingMedia,
  ChartMedia,
  StoryCardMedia,
  DiagramMedia,
} from '../../lib/geminiPM';

// Helper for Web Speech Synthesis
function speakText(
  text: string,
  rate: number = 1.0,
  onEnd?: () => void
): SpeechSynthesisUtterance | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return null;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;
  utterance.pitch = 1.0;
  if (onEnd) {
    utterance.onend = onEnd;
    utterance.onerror = onEnd;
  }
  window.speechSynthesis.speak(utterance);
  return utterance;
}

function stopSpeaking() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export interface InitiativeMixedMediaTrayProps {
  initiative: PMInitiative;
  epics?: PMEpic[];
  sprints?: PMSprint[];
  onOpenCopilot: (initialPrompt?: string) => void;
  copilotOpen: boolean;
  isOverviewTab?: boolean;
  drawerOpen?: boolean;
  onToggleDrawer?: (open: boolean) => void;
}

type MediaTab = 'audio' | 'topology' | 'velocity' | 'stories' | 'risk';

export const InitiativeMixedMediaTray: React.FC<InitiativeMixedMediaTrayProps> = ({
  initiative,
  epics = [],
  sprints = [],
  onOpenCopilot,
  copilotOpen,
  isOverviewTab = false,
  drawerOpen: externalDrawerOpen,
  onToggleDrawer: externalOnToggleDrawer,
}) => {
  const [internalDrawerOpen, setInternalDrawerOpen] = useState(false);
  const isDrawerOpen = externalDrawerOpen !== undefined ? externalDrawerOpen : internalDrawerOpen;
  const setDrawerOpen = (open: boolean) => {
    if (externalOnToggleDrawer) {
      externalOnToggleDrawer(open);
    } else {
      setInternalDrawerOpen(open);
    }
  };

  const [isExpandedInline, setIsExpandedInline] = useState(isOverviewTab);
  const [activeTab, setActiveTab] = useState<MediaTab>('audio');
  const [activeNarrator, setActiveNarrator] = useState<'architect' | 'pm' | 'security' | 'coach'>('architect');
  const [showDiagramModal, setShowDiagramModal] = useState(false);
  const [selectedTopologyNode, setSelectedTopologyNode] = useState<string | null>(null);

  // Audio state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [audioProgress, setAudioProgress] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcriptCopied, setTranscriptCopied] = useState(false);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Checked criteria for INVEST stories
  const [checkedCriteria, setCheckedCriteria] = useState<Record<number, boolean>>({});

  // Synchronize perspective (Business vs Technical)
  const [perspective, setPerspective] = useState<'business' | 'technical'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('forge_pm_survey_perspective');
      if (stored === 'technical' || stored === 'business') return stored;
    }
    return 'business';
  });

  const handlePerspectiveToggle = (mode: 'business' | 'technical') => {
    setPerspective(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('forge_pm_survey_perspective', mode);
    }
    if (mode === 'business' && activeNarrator === 'architect') {
      setActiveNarrator('pm');
    } else if (mode === 'technical' && activeNarrator === 'pm') {
      setActiveNarrator('architect');
    }
    toast.success(
      mode === 'business'
        ? 'Business Perspective: Milestones, ROI & User Impact'
        : 'Technical Perspective: Architecture, Schemas & SLAs'
    );
  };

  useEffect(() => {
    return () => {
      stopSpeaking();
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, []);

  // 1. Audio Briefing Data
  const audioBriefing: AudioBriefingMedia = useMemo(() => {
    const techStr = initiative.tech_stack?.slice(0, 3).join(', ') || 'React, Node.js, PostgreSQL';
    const epicCount = epics.length || 3;
    const activeSprintName = sprints[0]?.name || 'Sprint 1';

    if (perspective === 'business' || activeNarrator === 'pm') {
      return {
        title: `${initiative.name} · Product Strategy Briefing`,
        duration: '0:48',
        narrator: 'Scout · Staff Product Manager',
        script: `This is Scout with the product strategy intelligence briefing for ${initiative.name}. We have decomposed delivery into ${epicCount} core milestone epics targeting high-frequency customer workflows. For ${activeSprintName}, our priority is validating customer onboarding, minimizing churn risk, and securing Day-1 product-market fit with automated user telemetry.`,
        audioFrequencies: [32, 50, 68, 85, 92, 78, 60, 84, 95, 88, 70, 52, 42, 70, 90, 75, 48, 28],
      };
    }

    if (activeNarrator === 'security') {
      return {
        title: `${initiative.name} · AppSec & Threat Model Briefing`,
        duration: '0:42',
        narrator: 'Sentinel · Lead AppSec Specialist',
        script: `Sentinel reporting on threat modeling and defense architecture for ${initiative.name}. System boundaries isolate public APIs behind an OAuth2 rate-limiting edge gateway. Data stores enforce column-level encryption, tenant row-level security, and audit log immutability. System compliance readiness is currently rated at 98%.`,
        audioFrequencies: [24, 40, 60, 72, 90, 62, 44, 76, 92, 82, 64, 50, 38, 62, 84, 68, 42, 22],
      };
    }

    if (activeNarrator === 'coach') {
      return {
        title: `${initiative.name} · Agile Velocity & Sprint Health Briefing`,
        duration: '0:45',
        narrator: 'Aria · Agile Operations Lead',
        script: `Aria here with the sprint velocity intelligence report. Team throughput is tracking at 42 story points per cycle with an 88% on-time milestone probability according to our Monte Carlo simulation. Acceptance criteria test coverage is at 96% across ${epicCount} active epics.`,
        audioFrequencies: [28, 46, 64, 80, 88, 74, 52, 78, 90, 82, 66, 48, 36, 66, 86, 70, 44, 26],
      };
    }

    // Default Architect
    return {
      title: `${initiative.name} · Systems Architecture Briefing`,
      duration: '0:55',
      narrator: 'Forge · Lead Systems Architect',
      script: `Good morning engineering team. System architecture for ${initiative.name} is configured on ${techStr}. Inter-service RPC endpoints are bound with strict Protobuf contracts and p99 latency targets under 50 milliseconds. Reviewing DAG dependencies, zero critical path deadlocks are detected for ${activeSprintName}.`,
      audioFrequencies: [26, 48, 72, 88, 98, 68, 42, 78, 94, 88, 62, 38, 72, 88, 62, 42, 22, 16],
    };
  }, [initiative, epics, sprints, activeNarrator, perspective]);

  // Audio playback controls
  const handleTogglePlay = () => {
    if (isPlaying) {
      stopSpeaking();
      setIsPlaying(false);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    } else {
      setIsPlaying(true);
      if (!isMuted) {
        speakText(audioBriefing.script || audioBriefing.title, playbackSpeed, () => {
          setIsPlaying(false);
          setAudioProgress(100);
          if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
        });
      }

      const totalSteps = 45;
      let currentStep = audioProgress >= 95 ? 0 : Math.floor((audioProgress / 100) * totalSteps);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = setInterval(() => {
        currentStep++;
        const pct = Math.min(100, Math.floor((currentStep / totalSteps) * 100));
        setAudioProgress(pct);
        if (pct >= 100) {
          setIsPlaying(false);
          if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
        }
      }, 1000 / playbackSpeed);
    }
  };

  const cycleSpeed = () => {
    const nextSpeed = playbackSpeed === 1.0 ? 1.25 : playbackSpeed === 1.25 ? 1.5 : 1.0;
    setPlaybackSpeed(nextSpeed);
    if (isPlaying) {
      stopSpeaking();
      speakText(audioBriefing.script || audioBriefing.title, nextSpeed, () => {
        setIsPlaying(false);
        setAudioProgress(100);
      });
    }
  };

  const copyTranscript = () => {
    navigator.clipboard.writeText(audioBriefing.script);
    setTranscriptCopied(true);
    toast.success('Audio transcript copied to clipboard');
    setTimeout(() => setTranscriptCopied(false), 2000);
  };

  // 2. Topology Diagram Data
  const topologyData: DiagramMedia = useMemo(() => {
    const tech = initiative.tech_stack || [];
    const uiTech = tech.find((t) => /react|next|vue|svelte|frontend|web/i.test(t)) || 'React 18 · Vite · Tailwind';
    const backendTech = tech.find((t) => /node|express|fastapi|python|go|nest/i.test(t)) || 'FastAPI Microservice Fleet';
    const dbTech = tech.find((t) => /postgres|sql|mongo|redis|database|prisma/i.test(t)) || 'PostgreSQL + Prisma';

    return {
      title: `${initiative.name} · Service Architecture Mesh`,
      description: 'Multi-tier topology depicting Presentation, Edge Gateway, Compute Services, and Data persistence.',
      nodes: [
        { id: 'client-ui', label: 'Presentation Layer', type: 'client', tech: uiTech },
        { id: 'api-gw', label: 'Edge Gateway & Auth', type: 'gateway', tech: 'Cloud Run Reverse Proxy' },
        { id: 'core-service', label: 'Compute & Orchestration', type: 'service', tech: backendTech },
        { id: 'db-storage', label: 'Data & Event Storage', type: 'storage', tech: `${dbTech} + Redis Cache` },
      ],
      edges: [
        { from: 'client-ui', to: 'api-gw', label: 'HTTPS / WSS' },
        { from: 'api-gw', to: 'core-service', label: 'gRPC / TLS' },
        { from: 'core-service', to: 'db-storage', label: 'TCP Pool (RLS)' },
      ],
    };
  }, [initiative]);

  // 3. Velocity & Burndown Chart Data
  const burndownChartData: ChartMedia = useMemo(() => {
    return {
      title: 'Sprint 1 Velocity & Burndown Trajectory',
      description: 'Ideal burn rate vs actual completed story points across the active 10-day sprint cycle.',
      type: 'burndown',
      data: [
        { day: 'Day 1', ideal: 50, actual: 50 },
        { day: 'Day 2', ideal: 45, actual: 48 },
        { day: 'Day 3', ideal: 40, actual: 41 },
        { day: 'Day 4', ideal: 35, actual: 33 },
        { day: 'Day 5', ideal: 30, actual: 30 },
        { day: 'Day 6', ideal: 25, actual: 23 },
        { day: 'Day 7', ideal: 20, actual: 18 },
        { day: 'Day 8', ideal: 15, actual: 12 },
        { day: 'Day 9', ideal: 10, actual: 8 },
        { day: 'Day 10', ideal: 0, actual: 0 },
      ],
    };
  }, []);

  // 4. Sample INVEST Story Cards Data
  const sampleStory: StoryCardMedia = useMemo(() => {
    const coreEpic = epics[0]?.title || 'Core Platform Foundations';
    return {
      id: 'STORY-101',
      title: `Implement ${initiative.name} High-Concurrency Workflow Engine`,
      epic: coreEpic,
      points: 5,
      priority: 'high',
      investScore: 96,
      acceptanceCriteria: [
        'Given an authenticated user, when initiating an execution job, then return 202 Accepted within 200ms.',
        'Zero-trust token validation verifies workspace permissions before allocating compute worker nodes.',
        'Job execution status streams in real-time over WebSocket with automated fallback polling.',
        'Unit and integration tests pass with at least 90% branch coverage including circuit breaker trip cases.',
      ],
    };
  }, [initiative, epics]);

  const quickPrompts = [
    { label: '🎙️ Audio Standup', prompt: `Summarize today's sprint standup with an audio briefing and blocker analysis for ${initiative.name}.` },
    { label: '📊 Burndown & Velocity', prompt: `Analyze the sprint velocity and story point burndown trajectory for ${initiative.name}.` },
    { label: '🧩 3 INVEST Stories', prompt: `Synthesize 3 INVEST-compliant user stories with acceptance criteria for our core epics.` },
    { label: '📐 OpenAPI Spec', prompt: `Generate the full OpenAPI 3.1 specification and TypeScript types for this architecture.` },
    { label: '⚡ Simulate Sprint Risk', prompt: `Simulate potential sprint bottleneck risks and recommend actionable mitigation tasks.` },
  ];

  const frequencies = audioBriefing.audioFrequencies || [
    25, 45, 70, 85, 95, 65, 40, 75, 90, 85, 60, 35, 70, 85, 60, 40, 20, 15,
  ];

  /* -------------------------------------------------------------------------
     RENDER CONTENT: SHARED DECK (Used in both inline-expanded and drawer modes)
     ------------------------------------------------------------------------- */
  const renderDeckContent = () => (
    <div className="space-y-4">
      {/* Sub-Tabs Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200/80 dark:border-neutral-800 pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('audio')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'audio'
                ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 shadow-xs'
                : 'bg-neutral-100 dark:bg-neutral-800/80 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
            }`}
          >
            <Volume2 size={13} className={activeTab === 'audio' ? 'text-amber-400' : 'text-neutral-400'} />
            <span>Voice Standup</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('topology')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'topology'
                ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 shadow-xs'
                : 'bg-neutral-100 dark:bg-neutral-800/80 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
            }`}
          >
            <Layers size={13} className={activeTab === 'topology' ? 'text-indigo-400' : 'text-neutral-400'} />
            <span>Architecture Mesh</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('velocity')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'velocity'
                ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 shadow-xs'
                : 'bg-neutral-100 dark:bg-neutral-800/80 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
            }`}
          >
            <BarChart3 size={13} className={activeTab === 'velocity' ? 'text-sky-400' : 'text-neutral-400'} />
            <span>Burndown & Velocity</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('stories')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'stories'
                ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 shadow-xs'
                : 'bg-neutral-100 dark:bg-neutral-800/80 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
            }`}
          >
            <CheckCircle2 size={13} className={activeTab === 'stories' ? 'text-emerald-400' : 'text-neutral-400'} />
            <span>INVEST Story Deck</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('risk')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'risk'
                ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 shadow-xs'
                : 'bg-neutral-100 dark:bg-neutral-800/80 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
            }`}
          >
            <AlertTriangle size={13} className={activeTab === 'risk' ? 'text-rose-400' : 'text-neutral-400'} />
            <span>Risk Simulation</span>
          </button>
        </div>

        {/* Narrator Voice Picker (when on Audio tab) */}
        {activeTab === 'audio' && (
          <div className="flex items-center gap-1 text-xs font-medium">
            <span className="text-neutral-400 text-[11px] font-semibold">Narrator:</span>
            <div className="flex items-center p-0.5 bg-neutral-100 dark:bg-neutral-800 rounded-lg border border-neutral-200/80 dark:border-neutral-700">
              <button
                type="button"
                onClick={() => setActiveNarrator('architect')}
                className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-all ${
                  activeNarrator === 'architect'
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-2xs'
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                Architect
              </button>
              <button
                type="button"
                onClick={() => setActiveNarrator('pm')}
                className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-all ${
                  activeNarrator === 'pm'
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-2xs'
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                Product
              </button>
              <button
                type="button"
                onClick={() => setActiveNarrator('security')}
                className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-all ${
                  activeNarrator === 'security'
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-2xs'
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                Security
              </button>
              <button
                type="button"
                onClick={() => setActiveNarrator('coach')}
                className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-all ${
                  activeNarrator === 'coach'
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-2xs'
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                Agile
              </button>
            </div>
          </div>
        )}
      </div>

      {/* TAB CONTENT PANELS */}
      <div>
        {/* TAB 1: STUDIO AUDIO STANDUP BRIEFING */}
        {activeTab === 'audio' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-8">
              <div className="rounded-xl border border-neutral-200/90 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-850/60 p-4 space-y-3.5">
                {/* Audio Header */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      <Volume2 size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100 truncate">
                          {audioBriefing.title}
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                          AI VOICED
                        </span>
                      </div>
                      <span className="text-[11px] text-neutral-500 block truncate">
                        Narrator: <strong className="text-neutral-700 dark:text-neutral-300">{audioBriefing.narrator}</strong> · {audioBriefing.duration}
                      </span>
                    </div>
                  </div>

                  {/* Speed & Mute */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={cycleSpeed}
                      className="h-7 px-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 text-xs font-bold transition-all cursor-pointer"
                      title="Playback speed"
                    >
                      {playbackSpeed}x
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsMuted(!isMuted)}
                      className="h-7 w-7 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 flex items-center justify-center text-neutral-600 dark:text-neutral-300 transition-all cursor-pointer"
                      title={isMuted ? 'Unmute' : 'Mute'}
                    >
                      {isMuted ? <VolumeX size={13} className="text-rose-500" /> : <Volume2 size={13} />}
                    </button>
                  </div>
                </div>

                {/* Animated Equalizer Waveform */}
                <div className="flex items-end gap-1 h-10 px-3 py-1.5 bg-neutral-900 dark:bg-black rounded-lg border border-neutral-800 overflow-hidden">
                  {frequencies.map((f, i) => {
                    const dynamicHeight = isPlaying
                      ? Math.max(20, Math.min(100, f + Math.sin(Date.now() / 150 + i * 0.8) * 35))
                      : Math.max(14, f * 0.35);
                    return (
                      <div
                        key={i}
                        className={`flex-1 rounded-t-xs transition-all duration-150 ${
                          isPlaying ? 'bg-amber-400' : 'bg-neutral-600'
                        }`}
                        style={{
                          height: `${dynamicHeight}%`,
                          opacity: isPlaying ? 0.95 : 0.4,
                        }}
                      />
                    );
                  })}
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="w-full h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all duration-300"
                      style={{ width: `${audioProgress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-semibold text-neutral-500">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isPlaying ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400'
                        }`}
                      />
                      {isPlaying ? 'Streaming speech briefing' : audioProgress > 0 ? 'Paused' : 'Ready'}
                    </span>
                    <span>{audioBriefing.duration}</span>
                  </div>
                </div>

                {/* Main Action Buttons */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-200/80 dark:border-neutral-800">
                  <button
                    type="button"
                    onClick={handleTogglePlay}
                    className={`h-8 px-4 rounded-lg flex items-center gap-2 text-xs font-bold transition-all cursor-pointer shadow-xs ${
                      isPlaying
                        ? 'bg-rose-600 hover:bg-rose-700 text-white'
                        : 'bg-neutral-900 hover:bg-black text-white dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200'
                    }`}
                  >
                    {isPlaying ? <Pause size={13} /> : <Play size={13} fill="currentColor" />}
                    <span>{isPlaying ? 'Pause Audio' : audioProgress > 0 ? 'Resume Audio' : 'Play Briefing'}</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowTranscript(!showTranscript)}
                      className="h-8 px-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 text-xs font-semibold flex items-center gap-1.5 text-neutral-700 dark:text-neutral-300 transition-all cursor-pointer"
                    >
                      <span>{showTranscript ? 'Hide Script' : 'Transcript'}</span>
                      {showTranscript ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    <button
                      type="button"
                      onClick={copyTranscript}
                      className="h-8 w-8 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 flex items-center justify-center text-neutral-700 dark:text-neutral-300 transition-all cursor-pointer"
                      title="Copy script"
                    >
                      {transcriptCopied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>

                {/* Collapsible Transcript */}
                {showTranscript && (
                  <div className="p-3 bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200/80 dark:border-neutral-800 text-xs space-y-1.5">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase block">Transcript</span>
                    <p className="text-neutral-800 dark:text-neutral-200 leading-relaxed font-normal">
                      {audioBriefing.script}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Standup Side Metrics */}
            <div className="lg:col-span-4 space-y-3">
              <div className="p-4 rounded-xl border border-neutral-200/90 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-850/60 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                    <Activity size={14} className="text-amber-500" />
                    <span>Executive Metrics</span>
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold border border-emerald-500/20">
                    ON TRACK
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200/80 dark:border-neutral-700">
                    <span className="text-[10px] text-neutral-400 uppercase font-medium block">Sprint Focus</span>
                    <span className="font-bold text-neutral-900 dark:text-neutral-100 truncate block mt-0.5">
                      {sprints[0]?.name || 'Sprint 1'} Scope
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200/80 dark:border-neutral-700">
                    <span className="text-[10px] text-neutral-400 uppercase font-medium block">INVEST Score</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 block mt-0.5">
                      96% Ready
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-neutral-500 leading-relaxed pt-1">
                  {perspective === 'business'
                    ? 'Highlights user journey milestones, launch runway, and beta feedback readiness.'
                    : 'Evaluates zero-trust security boundaries, database indexing, and async queue reliability.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ARCHITECTURE & SERVICE TOPOLOGY MESH */}
        {activeTab === 'topology' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-neutral-200/90 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-850/60 p-4 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-200/80 dark:border-neutral-800">
                <div>
                  <h4 className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                    {topologyData.title}
                  </h4>
                  <p className="text-[11px] text-neutral-500">
                    {topologyData.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDiagramModal(true)}
                  className="px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-semibold flex items-center gap-1 text-neutral-700 dark:text-neutral-300 cursor-pointer"
                >
                  <Maximize2 size={12} />
                  <span>Blueprint Specs</span>
                </button>
              </div>

              {/* Connected Node Pipeline */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                {topologyData.nodes.map((node, idx) => {
                  const isSelected = selectedTopologyNode === node.id;
                  return (
                    <div
                      key={node.id}
                      onClick={() => setSelectedTopologyNode(isSelected ? null : node.id)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer relative ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 shadow-xs'
                          : 'border-neutral-200/90 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-neutral-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold uppercase text-neutral-400">
                          Tier 0{idx + 1}
                        </span>
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      </div>
                      <span className="text-xs font-bold block text-neutral-900 dark:text-neutral-100">
                        {node.label}
                      </span>
                      <span className="text-[11px] text-neutral-500 dark:text-neutral-400 block mt-1">
                        {node.tech}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Protocol Connectors Legend */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs border-t border-neutral-200/80 dark:border-neutral-800">
                <div className="flex items-center gap-3 text-neutral-500 text-[11px]">
                  <span>Protocols: <strong>HTTPS / WSS</strong> → <strong>gRPC mTLS</strong> → <strong>TCP Pool</strong></span>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenCopilot('Generate complete OpenAPI 3.1 contract and database schema migration for this architecture.')}
                  className="h-7 px-3 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <FileCode2 size={12} />
                  <span>Generate OpenAPI & Schemas</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: VELOCITY & BURNDOWN */}
        {activeTab === 'velocity' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-8">
              <div className="rounded-xl border border-neutral-200/90 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-850/60 p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-neutral-200/80 dark:border-neutral-800">
                  <div>
                    <h4 className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                      {burndownChartData.title}
                    </h4>
                    <p className="text-[11px] text-neutral-500">{burndownChartData.description}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold uppercase border border-emerald-500/20">
                    Live Telemetry
                  </span>
                </div>

                {/* SVG Chart Bars */}
                <div className="h-44 w-full relative pt-3 pb-6 px-3 bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200/80 dark:border-neutral-800">
                  <div className="h-full flex items-end justify-between gap-1.5 pt-4 relative">
                    <div className="absolute left-0 right-0 bottom-6 border-b border-dashed border-neutral-200 dark:border-neutral-800" />
                    {burndownChartData.data.map((item, idx) => {
                      const maxVal = 50;
                      const idealH = Math.min(100, Math.max(8, (item.ideal / maxVal) * 100));
                      const actualH = Math.min(100, Math.max(8, (item.actual / maxVal) * 100));
                      return (
                        <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full">
                          <div className="w-full flex items-end justify-center gap-1 h-[80%]">
                            <div
                              style={{ height: `${idealH}%` }}
                              className="w-2 sm:w-2.5 bg-neutral-200 dark:bg-neutral-700 rounded-t-xs"
                              title={`Ideal: ${item.ideal} pts`}
                            />
                            <div
                              style={{ height: `${actualH}%` }}
                              className="w-2.5 sm:w-3.5 bg-emerald-500 rounded-t-xs"
                              title={`Actual: ${item.actual} pts`}
                            />
                          </div>
                          <span className="text-[10px] font-semibold mt-1.5 truncate max-w-full text-center text-neutral-500">
                            {item.day.replace('Day ', 'D')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-neutral-500 pt-1">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Actual Burn</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-neutral-300 dark:bg-neutral-700" /> Target Curve</span>
                  </div>
                  <span>100% on pace for milestone deployment</span>
                </div>
              </div>
            </div>

            {/* Velocity Metrics Panel */}
            <div className="lg:col-span-4 space-y-3">
              <div className="p-4 rounded-xl border border-neutral-200/90 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-850/60 space-y-3">
                <span className="text-xs font-bold uppercase text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                  <TrendingUp size={14} className="text-sky-500" />
                  <span>Velocity Statistics</span>
                </span>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200/80 dark:border-neutral-700">
                    <span className="text-neutral-500">Target Points:</span>
                    <strong className="text-neutral-900 dark:text-neutral-100">50 pts</strong>
                  </div>
                  <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200/80 dark:border-neutral-700">
                    <span className="text-neutral-500">Current Velocity:</span>
                    <strong className="text-emerald-600 dark:text-emerald-400">42 pts / sprint</strong>
                  </div>
                  <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200/80 dark:border-neutral-700">
                    <span className="text-neutral-500">Milestone ETA:</span>
                    <strong className="text-neutral-900 dark:text-neutral-100">Day 10 (On Schedule)</strong>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onOpenCopilot('Analyze sprint burndown velocity and suggest resource reallocations to avoid slippage.')}
                  className="w-full h-8 px-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 text-xs font-semibold text-neutral-800 dark:text-neutral-200 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Bot size={13} />
                  <span>Analyze Velocity in Copilot</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: INVEST USER STORIES */}
        {activeTab === 'stories' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-neutral-200/90 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-850/60 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-neutral-200/80 dark:border-neutral-800">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 text-[10px] font-bold">
                      {sampleStory.id}
                    </span>
                    <span className="text-[11px] font-bold text-neutral-500">
                      Epic: {sampleStory.epic}
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                      INVEST: {sampleStory.investScore}%
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                    {sampleStory.title}
                  </h4>
                </div>
                <span className="px-2 py-1 rounded-lg bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 text-xs font-bold">
                  {sampleStory.points} pts
                </span>
              </div>

              {/* Acceptance Criteria Checklist */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase text-neutral-400 block">
                  Acceptance Criteria (Checkable):
                </span>
                {sampleStory.acceptanceCriteria.map((c, idx) => {
                  const isChecked = !!checkedCriteria[idx];
                  return (
                    <div
                      key={idx}
                      onClick={() => setCheckedCriteria((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                      className="flex items-start gap-2.5 p-2 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200/80 dark:border-neutral-700 cursor-pointer hover:border-neutral-300 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="mt-0.5 h-3.5 w-3.5 rounded text-indigo-600 focus:ring-0 cursor-pointer"
                      />
                      <span className={isChecked ? 'line-through text-neutral-400' : 'text-neutral-800 dark:text-neutral-200'}>
                        {c}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-200/80 dark:border-neutral-800">
                <span className="text-xs text-neutral-500">
                  {Object.values(checkedCriteria).filter(Boolean).length} of {sampleStory.acceptanceCriteria.length} criteria satisfied
                </span>
                <button
                  type="button"
                  onClick={() => onOpenCopilot('Generate 5 more INVEST-compliant user stories with automated Gherkin test criteria.')}
                  className="h-8 px-3.5 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <BookmarkPlus size={13} />
                  <span>Generate More Stories</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: RISK & BOTTLENECK SIMULATION */}
        {activeTab === 'risk' && (
          <div className="rounded-xl border border-neutral-200/90 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-850/60 p-4 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-200/80 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                  <AlertTriangle size={15} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                    Monte Carlo Sprint Delivery Risk Simulation
                  </h4>
                  <p className="text-[11px] text-neutral-500">
                    1,000 simulated sprint paths assessing dependency bottlenecks & developer velocity
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                LOW RISK (14% Variance)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200/80 dark:border-neutral-700 space-y-1">
                <span className="text-[10px] font-bold text-neutral-400 uppercase">Schema Migration</span>
                <strong className="block text-neutral-900 dark:text-neutral-100 text-sm">Low Impact · 4%</strong>
                <p className="text-[11px] text-neutral-500">PostgreSQL migration scripts isolated with zero-downtime column additions.</p>
              </div>
              <div className="p-3 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200/80 dark:border-neutral-700 space-y-1">
                <span className="text-[10px] font-bold text-neutral-400 uppercase">API Rate Limits</span>
                <strong className="block text-amber-600 dark:text-amber-400 text-sm">Medium Impact · 18%</strong>
                <p className="text-[11px] text-neutral-500">Third-party service quotas require client-side token bucket buffering.</p>
              </div>
              <div className="p-3 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200/80 dark:border-neutral-700 space-y-1">
                <span className="text-[10px] font-bold text-neutral-400 uppercase">RBAC Policy Coverage</span>
                <strong className="block text-emerald-600 dark:text-emerald-400 text-sm">Zero Risk · 2%</strong>
                <p className="text-[11px] text-neutral-500">Zero-trust policies pre-audited and covered with integration suites.</p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-200/80 dark:border-neutral-800">
              <span className="text-[11px] text-neutral-500">
                Recommendation: Add a 2-day buffer for third-party webhook rate-limiting soak tests.
              </span>
              <button
                type="button"
                onClick={() => onOpenCopilot('Formulate an actionable risk mitigation plan and sprint buffer strategy for these bottlenecks.')}
                className="h-8 px-3.5 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Zap size={13} />
                <span>Apply Risk Mitigation in Copilot</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Row: Mixed Media Prompt Action Chips */}
      <div className="pt-2 flex flex-wrap items-center gap-2 border-t border-neutral-200/80 dark:border-neutral-800">
        <span className="text-[11px] font-bold uppercase text-neutral-400 mr-1 flex items-center gap-1">
          <Bot size={13} className="text-amber-500" />
          <span>Copilot Directives:</span>
        </span>
        {quickPrompts.map((item, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onOpenCopilot(item.prompt)}
            className="text-xs h-7 px-2.5 rounded-md bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 border border-neutral-200/80 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 cursor-pointer transition-all flex items-center gap-1"
          >
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      {/* PERSISTENT INLINE EXECUTIVE BAR */}
      <div className="rounded-xl border border-neutral-200/90 dark:border-neutral-800 bg-white/95 dark:bg-[#10121A]/95 shadow-xs p-3.5 font-sans space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-bold shrink-0">
              <Sparkles size={14} className="text-amber-400" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                <span>MEDIA INTELLIGENCE HUB</span>
              </h3>
              <p className="text-[11px] text-neutral-500">
                {initiative.name} · Executive Telemetry & Synthetic Artifacts
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Perspective Switcher */}
            <div className="flex items-center p-0.5 bg-neutral-200/70 dark:bg-neutral-800 rounded-lg border border-neutral-300 dark:border-neutral-700">
              <button
                type="button"
                onClick={() => handlePerspectiveToggle('business')}
                className={`px-2 py-0.5 text-xs font-semibold rounded transition-all cursor-pointer flex items-center gap-1 ${
                  perspective === 'business'
                    ? 'bg-white dark:bg-neutral-700 text-neutral-950 dark:text-white shadow-2xs font-bold'
                    : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-950'
                }`}
                title="Business View: Customer outcomes & milestones"
              >
                <span>💼 Business</span>
              </button>
              <button
                type="button"
                onClick={() => handlePerspectiveToggle('technical')}
                className={`px-2 py-0.5 text-xs font-semibold rounded transition-all cursor-pointer flex items-center gap-1 ${
                  perspective === 'technical'
                    ? 'bg-white dark:bg-neutral-700 text-neutral-950 dark:text-white shadow-2xs font-bold'
                    : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-950'
                }`}
                title="Technical View: Architecture, schemas & SLAs"
              >
                <span>⚙️ Tech</span>
              </button>
            </div>

            {/* Key Telemetry Badges */}
            <div className="hidden sm:flex items-center gap-2 text-xs font-semibold">
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-[11px]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                96% INVEST
              </span>
              <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20 text-[11px]">
                88% Confidence
              </span>
            </div>

            {/* Expand / Collapse Inline Button */}
            <button
              type="button"
              onClick={() => setIsExpandedInline((v) => !v)}
              className="h-8 px-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs font-bold flex items-center gap-1.5 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 cursor-pointer"
              title={isExpandedInline ? 'Collapse Intelligence Hub' : 'Expand Intelligence Hub inline'}
            >
              {isExpandedInline ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              <span>{isExpandedInline ? 'Collapse' : 'Expand'}</span>
            </button>

            {/* Open Drawer Button */}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="h-8 px-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs font-bold flex items-center gap-1.5 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 cursor-pointer"
              title="Open full slide-over drawer"
            >
              <Maximize2 size={13} />
              <span>Drawer</span>
            </button>

            {/* Copilot Trigger */}
            <button
              type="button"
              onClick={() => onOpenCopilot()}
              className={`h-8 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
                copilotOpen
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                  : 'border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50'
              }`}
              title="Ask Copilot about this initiative"
            >
              <Bot size={13} className={copilotOpen ? 'text-amber-400' : 'text-neutral-500'} />
              <span className="hidden sm:inline">Copilot</span>
            </button>
          </div>
        </div>

        {/* If expanded inline or on overview tab, render deck content */}
        {(isExpandedInline || isOverviewTab) && (
          <div className="pt-2 border-t border-neutral-200/80 dark:border-neutral-800">
            {renderDeckContent()}
          </div>
        )}
      </div>

      {/* SLIDE-OVER DRAWER MODE (Executive Mixed Media Intelligence Deck) */}
      {isDrawerOpen && (
        <div
          role="dialog"
          aria-label="Media Intelligence Deck"
          className="fixed inset-0 z-50 flex justify-end font-sans"
        >
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={() => setDrawerOpen(false)}
          />

          {/* Drawer Sheet */}
          <div className="relative w-full max-w-2xl sm:max-w-3xl bg-white dark:bg-[#10121A] text-neutral-900 dark:text-neutral-100 shadow-2xl border-l border-neutral-200/90 dark:border-neutral-800 flex flex-col h-full z-10 overflow-hidden">
            {/* Drawer Header */}
            <div className="px-5 py-3.5 border-b border-neutral-200/80 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3 bg-neutral-50/80 dark:bg-neutral-900/80">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-bold">
                  <Sparkles size={14} className="text-amber-400" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                    <span>MEDIA INTELLIGENCE HUB</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 font-bold uppercase">
                      Drawer
                    </span>
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    {initiative.name} · Executive Telemetry & Synthetic Artifacts
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Perspective Switcher */}
                <div className="flex items-center p-0.5 bg-neutral-200/70 dark:bg-neutral-800 rounded-lg border border-neutral-300 dark:border-neutral-700">
                  <button
                    type="button"
                    onClick={() => handlePerspectiveToggle('business')}
                    className={`px-2 py-0.5 text-xs font-semibold rounded transition-all cursor-pointer flex items-center gap-1 ${
                      perspective === 'business'
                        ? 'bg-white dark:bg-neutral-700 text-neutral-950 dark:text-white shadow-2xs font-bold'
                        : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-950'
                    }`}
                    title="Business View: Customer outcomes & milestones"
                  >
                    <span>💼 Business</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePerspectiveToggle('technical')}
                    className={`px-2 py-0.5 text-xs font-semibold rounded transition-all cursor-pointer flex items-center gap-1 ${
                      perspective === 'technical'
                        ? 'bg-white dark:bg-neutral-700 text-neutral-950 dark:text-white shadow-2xs font-bold'
                        : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-950'
                    }`}
                    title="Technical View: Architecture, schemas & SLAs"
                  >
                    <span>⚙️ Tech</span>
                  </button>
                </div>

                {/* Copilot Trigger */}
                <button
                  type="button"
                  onClick={() => onOpenCopilot()}
                  className={`h-8 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
                    copilotOpen
                      ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                      : 'border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50'
                  }`}
                  title="Ask Copilot about this initiative"
                >
                  <Bot size={13} className={copilotOpen ? 'text-amber-400' : 'text-neutral-500'} />
                  <span className="hidden sm:inline">Copilot</span>
                </button>

                {/* Close Drawer Button */}
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="h-8 w-8 rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 flex items-center justify-center hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                  title="Close Drawer"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Quick Voice & Telemetry Strip */}
            <div className="px-5 py-2.5 bg-neutral-100/60 dark:bg-neutral-900/40 border-b border-neutral-200/80 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              {/* Mini Audio Player */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTogglePlay}
                  className="h-6 w-6 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center cursor-pointer hover:opacity-90"
                  title={isPlaying ? 'Pause audio' : 'Play audio standup'}
                >
                  {isPlaying ? <Pause size={10} /> : <Play size={10} fill="currentColor" />}
                </button>

                {/* Dynamic 8-bar mini waveform */}
                <div className="flex items-end gap-0.5 h-3.5 w-10">
                  {[20, 50, 80, 100, 60, 40, 75, 30].map((h, i) => (
                    <div
                      key={i}
                      className={`flex-1 rounded-t-xs transition-all ${
                        isPlaying ? 'bg-amber-500 animate-pulse' : 'bg-neutral-300 dark:bg-neutral-600'
                      }`}
                      style={{
                        height: isPlaying ? `${Math.max(25, (h + (i % 3) * 15) % 100)}%` : '30%',
                      }}
                    />
                  ))}
                </div>

                <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                  Voice Standup ({audioBriefing.narrator.split('·')[0].trim()})
                </span>
              </div>

              {/* Key Telemetry Badges */}
              <div className="flex items-center gap-2 text-xs font-semibold">
                <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-[11px]">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  96% INVEST
                </span>
                <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20 text-[11px]">
                  88% Confidence
                </span>
                <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20 text-[11px]">
                  {sprints.length || 4}/{sprints.length || 4} Sprints
                </span>
              </div>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-5">
              {renderDeckContent()}
            </div>
          </div>
        </div>
      )}

      {/* FULLSCREEN BLUEPRINT SPECIFICATION MODAL */}
      {showDiagramModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-sans">
          <div className="w-full max-w-2xl rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#12141D] p-6 shadow-2xl text-neutral-900 dark:text-neutral-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200/80 dark:border-neutral-800">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 text-base font-bold">
                  🏛️
                </span>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                    {initiative.name} · Full Architecture Blueprint
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    Multi-tier service mesh specification and protocol boundaries
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDiagramModal(false)}
                className="h-8 px-3 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs font-semibold cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Close
              </button>
            </div>

            <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200/80 dark:border-neutral-750 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-center text-xs">
                <div className="p-3 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200/80 dark:border-neutral-700">
                  <span className="text-[10px] font-bold uppercase block text-neutral-400">Presentation</span>
                  <span className="font-bold text-sm block mt-1 text-neutral-900 dark:text-neutral-100">Web Client</span>
                  <span className="text-[11px] block mt-1 text-neutral-500">React 18 · Vite · Tailwind</span>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200/80 dark:border-neutral-700">
                  <span className="text-[10px] font-bold uppercase block text-neutral-400">Routing & Auth</span>
                  <span className="font-bold text-sm block mt-1 text-neutral-900 dark:text-neutral-100">API Gateway</span>
                  <span className="text-[11px] block mt-1 text-neutral-500">OAuth2 · Rate Limiting</span>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200/80 dark:border-neutral-700">
                  <span className="text-[10px] font-bold uppercase block text-neutral-400">Computation</span>
                  <span className="font-bold text-sm block mt-1 text-neutral-900 dark:text-neutral-100">Agent Fleet</span>
                  <span className="text-[11px] block mt-1 text-neutral-500">Worker Queues</span>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200/80 dark:border-neutral-700">
                  <span className="text-[10px] font-bold uppercase block text-neutral-400">Data Layer</span>
                  <span className="font-bold text-sm block mt-1 text-neutral-900 dark:text-neutral-100">PostgreSQL</span>
                  <span className="text-[11px] block mt-1 text-neutral-500">Prisma ORM · Redis Cache</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200/80 dark:border-neutral-700 text-xs leading-relaxed space-y-1">
                <span className="font-bold text-neutral-900 dark:text-neutral-100 text-[11px] block">
                  System Specifications & Protocols:
                </span>
                <ul className="list-disc list-inside space-y-1 text-neutral-600 dark:text-neutral-300 text-xs">
                  <li>Zero-trust inter-service communications over encrypted gRPC / TLS.</li>
                  <li>Target SLA: sub-50ms p99 response times on edge endpoints.</li>
                  <li>Multi-tenant row-level security enforced in the PostgreSQL connection pool.</li>
                </ul>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowDiagramModal(false);
                  onOpenCopilot('Generate complete OpenAPI specification and schema files for this architecture.');
                }}
                className="h-8 px-4 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-bold text-xs cursor-pointer shadow-xs"
              >
                Ask Copilot to Generate Specs
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const InitiativeMixedMediaDrawer = InitiativeMixedMediaTray;
export default InitiativeMixedMediaTray;
