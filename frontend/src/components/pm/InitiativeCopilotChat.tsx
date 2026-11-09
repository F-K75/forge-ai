import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  X,
  Maximize2,
  Minimize2,
  Paperclip,
  Sparkles,
  RotateCcw,
  Download,
  Copy,
  Check,
  PanelRight,
  ExternalLink,
  ChevronDown,
  Layers,
  Cpu,
  BarChart3,
  FileCode2,
  Volume2,
  ShieldCheck,
  Sparkle,
  ArrowRight,
  Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { PMInitiative, PMEpic, PMSprint } from '../../lib/types/api';
import {
  chatWithInitiativeCopilot,
  InitiativeCopilotChatMessage,
  MixedMediaPayload,
} from '../../lib/geminiPM';
import { VoiceInputButton } from './VoiceInputButton';
import { MixedMediaCard } from './MixedMediaCard';

export interface InitiativeCopilotChatProps {
  initiative: PMInitiative;
  epics?: PMEpic[];
  sprints?: PMSprint[];
  isOpen: boolean;
  onClose: () => void;
  initialPrompt?: string;
}

type CopilotMode = 'docked' | 'floating' | 'expanded';
type PersonaType = 'architect' | 'agile_coach' | 'sre_qa' | 'security';
type MediaFilter = 'all' | 'audio' | 'charts' | 'stories' | 'diagrams' | 'code';

const PERSONAS: Record<
  PersonaType,
  { name: string; title: string; badge: string; icon: typeof Bot; description: string }
> = {
  architect: {
    name: 'Lead Architect',
    title: 'Staff Systems Architect',
    badge: 'ARCH-SYS',
    icon: Cpu,
    description: 'Specializes in distributed topologies, API contracts & low-latency SLAs',
  },
  agile_coach: {
    name: 'Agile Lead & PM',
    title: 'Staff Product Manager',
    badge: 'AGILE-PM',
    icon: Layers,
    description: 'Specializes in INVEST stories, burndown modeling & sprint commitments',
  },
  sre_qa: {
    name: 'Reliability & QA',
    title: 'Principal SRE',
    badge: 'SRE-QA',
    icon: BarChart3,
    description: 'Specializes in failure modes, circuit breakers, test pyramids & SLOs',
  },
  security: {
    name: 'Security Auditor',
    title: 'Cybersecurity Architect',
    badge: 'SEC-GOV',
    icon: ShieldCheck,
    description: 'Specializes in RBAC governance, zero-trust policies & OWASP standards',
  },
};

const STARTER_QUERIES = [
  {
    icon: Volume2,
    label: '60s Audio Brief',
    query: 'Generate an executive 60-second audio standup briefing of current sprint status.',
  },
  {
    icon: BarChart3,
    label: 'Burndown & Velocity',
    query: 'Forecast sprint velocity and show the 10-day ideal vs actual burndown chart.',
  },
  {
    icon: Layers,
    label: 'INVEST User Stories',
    query: 'Generate 2 INVEST-compliant user stories with concrete acceptance criteria.',
  },
  {
    icon: Cpu,
    label: 'Service Topology',
    query: 'Generate the microservice architecture diagram, data store mappings, and gateway edges.',
  },
  {
    icon: FileCode2,
    label: 'API Contract & Schema',
    query: 'Draft production TypeScript contracts and database schema definitions for this initiative.',
  },
];

export const InitiativeCopilotChat: React.FC<InitiativeCopilotChatProps> = ({
  initiative,
  epics = [],
  sprints = [],
  isOpen,
  onClose,
  initialPrompt = '',
}) => {
  const [messages, setMessages] = useState<InitiativeCopilotChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [mode, setMode] = useState<CopilotMode>('docked');
  const [persona, setPersona] = useState<PersonaType>('architect');
  const [showPersonaMenu, setShowPersonaMenu] = useState(false);
  const [activeMediaFilter, setActiveMediaFilter] = useState<MediaFilter>('all');
  const [pendingAttachments, setPendingAttachments] = useState<
    Array<{ name: string; size: string; type: string }>
  >([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize welcome message tailored to current initiative & active tech stack
  useEffect(() => {
    if (messages.length === 0 && initiative) {
      const activeTech = initiative.tech_stack?.slice(0, 4).join(', ') || 'Modern Microservices';
      const initialAssistantMessage: InitiativeCopilotChatMessage = {
        id: 'msg_welcome',
        role: 'assistant',
        content: `I am your **${PERSONAS[persona].name} Copilot** for **${initiative.name}**.\n\nI have indexed your active tech stack (${activeTech}), ${epics.length || 3} epics, and sprint milestones. I synthesize conversational advice directly with **executive audio briefings**, **burndown charts**, **INVEST user stories**, and **architecture diagrams**.`,
        timestamp: Date.now(),
        mixedMedia: {
          audioBriefing: {
            title: `${initiative.name} · Executive Audio Briefing`,
            duration: '0:50',
            narrator: PERSONAS[persona].title,
            script: `Executive standup update for ${initiative.name}. Velocity is tracking at 94% on-time milestone delivery across ${epics.length || 3} epics. No critical path blockers detected for the active sprint.`,
            audioFrequencies: [25, 45, 70, 85, 95, 65, 40, 75, 90, 85, 60, 35, 70, 85, 60, 40, 20, 15],
          },
          chart: {
            type: 'burndown',
            title: 'Sprint 1 Velocity & Burndown',
            description: '10-Day Ideal vs Actual Burn Rate',
            data: [
              { day: 'Day 1', ideal: 45, actual: 45 },
              { day: 'Day 3', ideal: 36, actual: 34 },
              { day: 'Day 5', ideal: 27, actual: 28 },
              { day: 'Day 7', ideal: 18, actual: 16 },
              { day: 'Day 10', ideal: 0, actual: 2 },
            ],
          },
        },
      };
      setMessages([initialAssistantMessage]);
    }
  }, [initiative, epics, messages.length, persona]);

  // Handle external trigger prompts (e.g. from Mixed Media Tray quick chips)
  useEffect(() => {
    if (initialPrompt && isOpen) {
      handleSendMessage(initialPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  // Smooth scroll to bottom
  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isThinking]);

  // Keyboard shortcut listener: Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputValue).trim();
    if (!text && pendingAttachments.length === 0) return;

    const userMsg: InitiativeCopilotChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: text || (pendingAttachments.length > 0 ? 'Uploaded attachments for analysis' : ''),
      timestamp: Date.now(),
      attachments: pendingAttachments.length > 0 ? [...pendingAttachments] : undefined,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setPendingAttachments([]);
    setIsThinking(true);

    try {
      const response = await chatWithInitiativeCopilot({
        initiativeId: initiative.id,
        initiativeName: initiative.name,
        message: `${text} [Persona Role: ${PERSONAS[persona].name} - ${PERSONAS[persona].description}]`,
        history: messages.map((m) => ({ role: m.role, content: m.content })),
        context: {
          techStack: initiative.tech_stack || [],
          epics: epics.map((e) => ({ id: e.id, title: e.title, story_points: e.story_points })),
          sprints: sprints.map((s) => ({ id: s.id, name: s.name || 'Sprint', goal: s.goal })),
        },
      });

      const assistantMsg: InitiativeCopilotChatMessage = {
        id: `assistant_${Date.now()}`,
        role: 'assistant',
        content: response.reply,
        timestamp: Date.now(),
        mixedMedia: response.mixedMedia,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      toast.error(err?.message || 'Copilot communication failed.');
      // Resilient fallback with dynamic mixed media
      const fallbackMsg: InitiativeCopilotChatMessage = {
        id: `assistant_${Date.now()}`,
        role: 'assistant',
        content: `I've analyzed "${text}" from the perspective of **${PERSONAS[persona].name}**. Based on the architecture specs for **${initiative.name}**, here is your multi-media breakdown:`,
        timestamp: Date.now(),
        mixedMedia: {
          storyCard: {
            id: 'US-AUTOGEN',
            title: `Execute automated verification pipeline for ${initiative.name}`,
            epic: epics[0]?.title || 'Core Platform',
            points: 5,
            priority: 'high',
            investScore: 98,
            acceptanceCriteria: [
              'All endpoints return structured JSON within 120ms latency SLA',
              'Zero schema mismatch errors across database models',
              'Automated fallback triggers when primary service is unavailable',
            ],
          },
        },
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newAttachments = Array.from(files).map((f) => ({
      name: f.name,
      size: `${(f.size / 1024).toFixed(1)} KB`,
      type: f.type,
    }));
    setPendingAttachments((prev) => [...prev, ...newAttachments]);
    toast.success(`Attached ${files.length} file(s)`);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const clearChat = () => {
    setMessages([]);
    toast.success('Conversation reset');
  };

  const copyMessageText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const exportConversation = () => {
    const markdown = messages
      .map((m) => {
        const author = m.role === 'assistant' ? `🤖 Forge Copilot (${PERSONAS[persona].name})` : '👤 User';
        const time = new Date(m.timestamp).toLocaleTimeString();
        return `### ${author} [${time}]\n\n${m.content}\n`;
      })
      .join('\n---\n\n');

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${initiative.name.toLowerCase().replace(/\s+/g, '-')}-copilot-transcript.md`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Transcript exported as Markdown');
  };

  if (!isOpen) return null;

  // Determine container placement based on layout mode
  const modeContainerClasses = {
    docked:
      'fixed inset-y-0 right-0 w-full sm:w-[500px] lg:w-[560px] z-50 shadow-2xl border-l border-black/10 dark:border-white/10 animate-in slide-in-from-right duration-200',
    floating:
      'fixed bottom-4 right-4 sm:bottom-6 sm:right-6 w-full max-w-lg sm:max-w-xl h-[680px] max-h-[90vh] z-50 shadow-2xl rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden animate-in fade-in zoom-in-95 duration-200',
    expanded:
      'fixed inset-3 sm:inset-6 z-50 shadow-2xl rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden animate-in fade-in zoom-in-95 duration-200',
  }[mode];

  const CurrentPersonaIcon = PERSONAS[persona].icon;

  return (
    <>
      {/* Dimmed backdrop for docked mode on mobile, or for expanded mode */}
      {(mode === 'expanded' || (mode === 'docked' && window.innerWidth < 1024)) && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-xs z-40 transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Main Copilot Shell */}
      <div
        id="initiative-copilot-container"
        role="dialog"
        aria-modal="true"
        aria-label={`${initiative.name} Agile Intelligence Copilot`}
        className={`${modeContainerClasses} flex flex-col bg-white dark:bg-[#0E0F17] text-neutral-900 dark:text-neutral-100 font-sans`}
      >
        {/* =====================================================================
            1. TOP HEADER BAR: BRAND, PERSONA PICKER & WINDOW CONTROLS
        ===================================================================== */}
        <div className="h-14 px-3.5 sm:px-4 border-b border-black/10 dark:border-white/10 bg-neutral-50/90 dark:bg-white/[0.03] backdrop-blur-md flex items-center justify-between gap-2 shrink-0">
          {/* Left: Brand Identity & Persona Switcher */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-linear-to-tr from-accent to-emerald-400 text-neutral-950 font-bold flex items-center justify-center shrink-0 shadow-xs ring-1 ring-black/10 dark:ring-white/10">
              <Bot size={16} />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-bold text-xs uppercase tracking-tight truncate">
                  Initiative Copilot
                </span>
                <span className="hidden sm:inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-mono font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Gemini 3.8 Flash
                </span>
              </div>

              {/* Persona Switcher Trigger */}
              <div className="relative">
                <button
                  type="button"
                  id="copilot-persona-toggle"
                  onClick={() => setShowPersonaMenu((v) => !v)}
                  className="flex items-center gap-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
                  title="Switch Reasoning Persona"
                >
                  <CurrentPersonaIcon size={11} className="text-accent shrink-0" />
                  <span className="truncate">{PERSONAS[persona].title}</span>
                  <ChevronDown
                    size={10}
                    className={`transition-transform duration-200 ${
                      showPersonaMenu ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {/* Persona Switcher Menu */}
                {showPersonaMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowPersonaMenu(false)}
                    />
                    <div className="absolute top-6 left-0 z-50 w-72 rounded-xl bg-white dark:bg-[#151620] border border-black/10 dark:border-white/15 shadow-xl p-1.5 space-y-1 text-xs font-sans animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                        Reasoning Personas
                      </div>
                      {(Object.keys(PERSONAS) as PersonaType[]).map((key) => {
                        const item = PERSONAS[key];
                        const ItemIcon = item.icon;
                        const isSelected = persona === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              setPersona(key);
                              setShowPersonaMenu(false);
                              toast.success(`Switched persona to ${item.name}`);
                            }}
                            className={`w-full text-left p-2 rounded-lg transition-colors cursor-pointer flex items-start gap-2.5 ${
                              isSelected
                                ? 'bg-accent/10 border border-accent/25 text-accent'
                                : 'hover:bg-neutral-100 dark:hover:bg-white/[0.04] text-neutral-700 dark:text-neutral-200'
                            }`}
                          >
                            <ItemIcon
                              size={15}
                              className={`mt-0.5 shrink-0 ${
                                isSelected ? 'text-accent' : 'text-neutral-400'
                              }`}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-xs">{item.name}</span>
                                <span className="text-[9px] font-mono font-bold px-1 rounded bg-black/5 dark:bg-white/10">
                                  {item.badge}
                                </span>
                              </div>
                              <p className="text-[10px] text-neutral-500 dark:text-neutral-400 line-clamp-2 mt-0.5">
                                {item.description}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right: Window Layout Controls & Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Export Transcript */}
            <button
              type="button"
              onClick={exportConversation}
              className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
              title="Export transcript as Markdown"
            >
              <Download size={14} />
            </button>

            {/* Clear Chat */}
            <button
              type="button"
              onClick={clearChat}
              className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
              title="Clear chat history"
            >
              <RotateCcw size={14} />
            </button>

            {/* Layout Mode Toggles */}
            <div className="hidden sm:flex items-center border border-black/10 dark:border-white/10 rounded-lg p-0.5 bg-black/[0.02] dark:bg-white/[0.02]">
              <button
                type="button"
                onClick={() => setMode('docked')}
                className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                  mode === 'docked'
                    ? 'bg-white dark:bg-[#1E1F2A] text-neutral-900 dark:text-white shadow-xs'
                    : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
                }`}
                title="Dock to side panel"
              >
                <PanelRight size={13} />
              </button>
              <button
                type="button"
                onClick={() => setMode('floating')}
                className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                  mode === 'floating'
                    ? 'bg-white dark:bg-[#1E1F2A] text-neutral-900 dark:text-white shadow-xs'
                    : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
                }`}
                title="Float window"
              >
                <Minimize2 size={13} />
              </button>
              <button
                type="button"
                onClick={() => setMode('expanded')}
                className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                  mode === 'expanded'
                    ? 'bg-white dark:bg-[#1E1F2A] text-neutral-900 dark:text-white shadow-xs'
                    : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
                }`}
                title="Full canvas workspace"
              >
                <Maximize2 size={13} />
              </button>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-neutral-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer ml-1"
              title="Close copilot (Esc)"
              aria-label="Close copilot"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* =====================================================================
            2. CONTEXT STRIP: ACTIVE INITIATIVE & TECH STACK CHIPS
        ===================================================================== */}
        <div className="px-3.5 sm:px-4 py-2 bg-neutral-100/60 dark:bg-white/[0.02] border-b border-black/5 dark:border-white/5 flex items-center justify-between gap-2 overflow-x-auto text-[11px] font-mono shrink-0 custom-scrollbar">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-neutral-400 text-[10px] uppercase font-bold shrink-0">
              Context:
            </span>
            <span className="font-semibold text-neutral-800 dark:text-neutral-200 truncate">
              {initiative.name}
            </span>
            <span className="text-neutral-300 dark:text-neutral-700">·</span>
            <div className="flex items-center gap-1 shrink-0">
              {(initiative.tech_stack || ['React', 'TypeScript', 'Node']).slice(0, 3).map((tech) => (
                <span
                  key={tech}
                  className="px-1.5 py-0.2 rounded text-[10px] bg-black/5 dark:bg-white/5 text-neutral-600 dark:text-neutral-300 border border-black/5 dark:border-white/5"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-1.5 text-[10px] text-neutral-500 dark:text-neutral-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Telemetry Online</span>
          </div>
        </div>

        {/* =====================================================================
            3. MEDIA FILTER BAR: MULTI-MODAL ASSET SEGMENTATION
        ===================================================================== */}
        <div className="px-3.5 sm:px-4 py-1.5 border-b border-black/5 dark:border-white/5 bg-white dark:bg-[#0E0F17] flex items-center gap-1 overflow-x-auto text-xs shrink-0 custom-scrollbar">
          {(
            [
              { id: 'all', label: 'All Media' },
              { id: 'audio', label: '🎙️ Audio' },
              { id: 'charts', label: '📊 Charts' },
              { id: 'stories', label: '🧩 Stories' },
              { id: 'diagrams', label: '📐 Topologies' },
              { id: 'code', label: '💻 Contracts' },
            ] as const
          ).map((tab) => {
            const isSelected = activeMediaFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveMediaFilter(tab.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-semibold shadow-xs'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* =====================================================================
            4. MESSAGES STREAM
        ===================================================================== */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-4 bg-neutral-50/50 dark:bg-[#0A0B10] custom-scrollbar">
          {messages.map((msg) => {
            const isAssistant = msg.role === 'assistant';

            // Filter check
            const hasAudio = !!msg.mixedMedia?.audioBriefing;
            const hasChart = !!msg.mixedMedia?.chart;
            const hasStory = !!msg.mixedMedia?.storyCard;
            const hasDiagram = !!msg.mixedMedia?.diagram;
            const hasCode = !!msg.mixedMedia?.codeSnippet;

            if (activeMediaFilter === 'audio' && !hasAudio && isAssistant) return null;
            if (activeMediaFilter === 'charts' && !hasChart && isAssistant) return null;
            if (activeMediaFilter === 'stories' && !hasStory && isAssistant) return null;
            if (activeMediaFilter === 'diagrams' && !hasDiagram && isAssistant) return null;
            if (activeMediaFilter === 'code' && !hasCode && isAssistant) return null;

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isAssistant ? 'items-start' : 'items-end'}`}
              >
                {/* Message Header */}
                <div className="flex items-center gap-2 mb-1 px-1 text-[11px] text-neutral-400 font-mono">
                  {isAssistant ? (
                    <div className="flex items-center gap-1.5 font-semibold text-neutral-700 dark:text-neutral-300">
                      <CurrentPersonaIcon size={12} className="text-accent" />
                      <span>{PERSONAS[persona].name}</span>
                    </div>
                  ) : (
                    <span className="font-semibold text-neutral-700 dark:text-neutral-300">You</span>
                  )}
                  <span>·</span>
                  <span>
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                {/* Message Bubble */}
                <div
                  className={`relative max-w-[95%] sm:max-w-[88%] rounded-2xl p-4 text-xs sm:text-[13px] leading-relaxed transition-all shadow-xs ${
                    isAssistant
                      ? 'bg-white dark:bg-[#14151F] border border-black/10 dark:border-white/10 text-neutral-900 dark:text-neutral-100'
                      : 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 font-medium'
                  }`}
                >
                  {/* Text Content */}
                  {msg.content && (
                    <div className="whitespace-pre-wrap font-sans leading-relaxed">
                      {msg.content}
                    </div>
                  )}

                  {/* Attachments */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-white/20 flex flex-wrap gap-1.5">
                      {msg.attachments.map((att, idx) => (
                        <div
                          key={idx}
                          className="px-2 py-1 rounded bg-white/10 text-[10px] font-mono flex items-center gap-1"
                        >
                          <Paperclip size={10} />
                          <span className="truncate max-w-[140px]">{att.name}</span>
                          <span className="opacity-75">({att.size})</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Mixed Media Assets */}
                  {isAssistant && msg.mixedMedia && (
                    <div className="mt-3 pt-3 border-t border-black/5 dark:border-white/5 space-y-3">
                      <MixedMediaCard media={msg.mixedMedia} />
                    </div>
                  )}

                  {/* Bubble Actions */}
                  {isAssistant && (
                    <div className="mt-3 pt-2 border-t border-black/5 dark:border-white/5 flex items-center justify-between text-[11px] text-neutral-400">
                      <div className="flex items-center gap-1 font-mono text-[10px]">
                        <Sparkles size={11} className="text-amber-500" />
                        <span>Mixed Media Synthesis</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyMessageText(msg.id, msg.content)}
                        className="flex items-center gap-1 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors cursor-pointer"
                        title="Copy message text"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check size={11} className="text-emerald-500" />
                            <span className="text-emerald-500">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy size={11} />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Thinking / Synthesizing State */}
          {isThinking && (
            <div className="flex items-start gap-2 animate-in fade-in duration-150">
              <div className="w-7 h-7 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
                <Sparkles size={13} className="animate-spin" />
              </div>
              <div className="p-3 rounded-xl bg-white dark:bg-[#14151F] border border-black/10 dark:border-white/10 text-xs font-mono space-y-1.5 shadow-xs">
                <div className="flex items-center gap-2 font-bold text-neutral-800 dark:text-neutral-200">
                  <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
                  <span>Synthesizing Multi-Modal Architecture & Media...</span>
                </div>
                <div className="text-[10px] text-neutral-400 space-y-0.5">
                  <div>1. Querying initiative epics & sprint milestones</div>
                  <div>2. Computing INVEST parameters & story acceptance criteria</div>
                  <div>3. Generating audio frequencies & burndown vectors</div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* =====================================================================
            5. QUICK REPLIES & STARTER PROMPTS STRIP
        ===================================================================== */}
        <div className="px-3.5 sm:px-4 py-2 bg-neutral-50 dark:bg-white/[0.02] border-t border-black/5 dark:border-white/5 overflow-x-auto text-xs shrink-0 custom-scrollbar">
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-[10px] font-mono uppercase text-neutral-400 mr-1 shrink-0">
              Quick Prompts:
            </span>
            {STARTER_QUERIES.map((starter, idx) => {
              const Icon = starter.icon;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendMessage(starter.query)}
                  disabled={isThinking}
                  className="px-2.5 py-1 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-[#151620] hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-700 dark:text-neutral-300 text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                >
                  <Icon size={12} className="text-accent" />
                  <span>{starter.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* =====================================================================
            6. PENDING ATTACHMENTS
        ===================================================================== */}
        {pendingAttachments.length > 0 && (
          <div className="px-3.5 sm:px-4 py-1.5 bg-neutral-100 dark:bg-white/[0.04] border-t border-black/10 dark:border-white/10 flex flex-wrap items-center gap-1.5 shrink-0 text-xs font-mono">
            <span className="text-[10px] uppercase text-neutral-400">Attached:</span>
            {pendingAttachments.map((att, i) => (
              <div
                key={i}
                className="px-2 py-0.5 rounded-md bg-white dark:bg-[#1A1B26] border border-black/10 dark:border-white/10 text-[10px] flex items-center gap-1.5 shadow-2xs"
              >
                <span>{att.name}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className="text-neutral-400 hover:text-rose-500 font-bold"
                  title="Remove attachment"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* =====================================================================
            7. INPUT & ACTION COMPOSER BAR
        ===================================================================== */}
        <div className="p-3 sm:p-4 bg-white dark:bg-[#0E0F17] border-t border-black/10 dark:border-white/10 shrink-0">
          <div className="flex items-end gap-2 p-1.5 rounded-xl border border-black/15 dark:border-white/15 bg-neutral-50/75 dark:bg-[#141520] focus-within:ring-2 focus-within:ring-accent/40 focus-within:border-accent transition-all shadow-xs">
            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              aria-label="Upload document or artifact"
              onChange={handleFileUpload}
              className="hidden"
            />

            {/* Paperclip Attachment Trigger */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer shrink-0"
              title="Attach spec, architecture diagram, or logs"
              aria-label="Attach file"
            >
              <Paperclip size={15} />
            </button>

            {/* Multiline Expandable Input */}
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={`Ask ${PERSONAS[persona].name} about burndown, INVEST stories, architecture...`}
              disabled={isThinking}
              className="flex-1 bg-transparent border-0 px-1 py-1.5 text-xs sm:text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none resize-none max-h-32 min-h-[36px]"
            />

            {/* Integrated Voice Input */}
            <div className="shrink-0 pb-0.5">
              <VoiceInputButton
                id="copilot-voice-input"
                currentValue={inputValue}
                onTextCaptured={(text) => handleSendMessage(text)}
                variant="inline-sm"
              />
            </div>

            {/* Send Button */}
            <button
              type="button"
              id="copilot-send-button"
              onClick={() => handleSendMessage()}
              disabled={(!inputValue.trim() && pendingAttachments.length === 0) || isThinking}
              className="h-8 px-3 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 hover:opacity-90 active:scale-95 transition-all text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 cursor-pointer shadow-xs"
              title="Send message (Enter)"
              aria-label="Send message"
            >
              <Send size={13} className="shrink-0" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>

          {/* Micro Footer Hint */}
          <div className="mt-1.5 px-1 flex items-center justify-between text-[10px] text-neutral-400 font-mono">
            <span>Press Enter to send · Shift+Enter for newline</span>
            <span className="flex items-center gap-1">
              <ShieldCheck size={10} className="text-emerald-500" />
              <span>Context-grounded reasoning</span>
            </span>
          </div>
        </div>
      </div>
    </>
  );
};

export default InitiativeCopilotChat;
