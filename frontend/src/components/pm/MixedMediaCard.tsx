import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Copy,
  Check,
  CheckSquare,
  Square,
  FileText,
  ChevronDown,
  ChevronUp,
  Sparkles,
  BarChart3,
  Layers,
  Code2,
  BookmarkPlus,
  ArrowRight,
  ShieldCheck,
  Cpu,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type {
  MixedMediaPayload,
  AudioBriefingMedia,
  ChartMedia,
  StoryCardMedia,
  DiagramMedia,
  CodeSnippetMedia,
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

/* =========================================================================
   1. AUDIO BRIEFING PLAYER CARD
   ========================================================================= */
export const AudioBriefingCard: React.FC<{
  audio: AudioBriefingMedia;
  compact?: boolean;
}> = ({ audio, compact = false }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [speed, setSpeed] = useState<number>(1.0);
  const [progress, setProgress] = useState(0); // 0 to 100
  const [showTranscript, setShowTranscript] = useState(false);
  const [copied, setCopied] = useState(false);

  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      stopSpeaking();
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, []);

  const handleTogglePlay = () => {
    if (isPlaying) {
      stopSpeaking();
      setIsPlaying(false);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    } else {
      setIsPlaying(true);
      if (!isMuted) {
        speakText(audio.script || audio.title, speed, () => {
          setIsPlaying(false);
          setProgress(100);
          if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
        });
      }

      // Simulate progress over roughly 40 seconds
      const totalSteps = 40;
      let currentStep = progress >= 95 ? 0 : Math.floor((progress / 100) * totalSteps);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = setInterval(() => {
        currentStep++;
        const pct = Math.min(100, Math.floor((currentStep / totalSteps) * 100));
        setProgress(pct);
        if (pct >= 100) {
          setIsPlaying(false);
          if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
        }
      }, 1000 / speed);
    }
  };

  const cycleSpeed = () => {
    const nextSpeed = speed === 1.0 ? 1.25 : speed === 1.25 ? 1.5 : 1.0;
    setSpeed(nextSpeed);
    if (isPlaying) {
      stopSpeaking();
      speakText(audio.script || audio.title, nextSpeed, () => {
        setIsPlaying(false);
        setProgress(100);
      });
    }
  };

  const copyTranscript = () => {
    navigator.clipboard.writeText(audio.script);
    setCopied(true);
    toast.success('Audio briefing transcript copied');
    setTimeout(() => setCopied(false), 2000);
  };

  const frequencies = audio.audioFrequencies || [
    25, 45, 70, 85, 95, 65, 40, 75, 90, 85, 60, 35, 70, 85, 60, 40, 20, 15,
  ];

  return (
    <div className="rounded-2xl border border-border bg-panel p-4 text-ink shadow-xs transition-all">
      {/* Header Row */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-warn/10 text-warn border border-warn/20 shadow-2xs">
            <Volume2 size={16} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold text-ink truncate">
                {audio.title}
              </span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-warn/10 text-warn border border-warn/20">
                VOICE BRIEF
              </span>
            </div>
            <span className="text-[11px] text-muted block truncate">
              Narrator: <strong className="text-ink">{audio.narrator}</strong> · {audio.duration}
            </span>
          </div>
        </div>

        {/* Speed & Mute Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={cycleSpeed}
            className="h-7 px-2.5 rounded-pill border border-border bg-panel hover:bg-ink/5 text-xs font-semibold transition-all cursor-pointer shadow-2xs"
            title="Cycle playback speed"
          >
            {speed}x
          </button>
          <button
            type="button"
            onClick={() => setIsMuted(!isMuted)}
            className="h-7 w-7 rounded-lg border border-border bg-panel hover:bg-ink/5 flex items-center justify-center text-ink transition-all cursor-pointer shadow-2xs"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX size={13} className="text-error" /> : <Volume2 size={13} />}
          </button>
        </div>
      </div>

      {/* Reactive Frequency Equalizer */}
      <div className="flex items-end gap-1 h-10 px-3 py-1.5 bg-warn/10 rounded-xl border border-warn/20 my-2.5 overflow-hidden">
        {frequencies.map((f, i) => {
          const dynamicHeight = isPlaying
            ? Math.max(18, Math.min(100, f + Math.sin(Date.now() / 150 + i * 0.8) * 30))
            : Math.max(14, f * 0.35);
          return (
            <div
              key={i}
              className={`flex-1 rounded-t-sm transition-all duration-150 ${
                isPlaying ? 'bg-warn' : 'bg-surface-high'
              }`}
              style={{
                height: `${dynamicHeight}%`,
                opacity: isPlaying ? 0.95 : 0.45,
              }}
            />
          );
        })}
      </div>

      {/* Progress Bar & Status */}
      <div className="space-y-1 mb-3">
        <div className="w-full h-1.5 bg-surface-high rounded-full overflow-hidden">
          <div
            className="h-full bg-warn rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] font-semibold text-muted">
          <span className="flex items-center gap-1">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isPlaying ? 'bg-ok animate-pulse' : 'bg-ink/30'
              }`}
            />
            {isPlaying ? 'Playing briefing' : progress > 0 ? 'Paused' : 'Ready to stream'}
          </span>
          <span>{audio.duration}</span>
        </div>
      </div>

      {/* Control Actions */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
        <button
          type="button"
          onClick={handleTogglePlay}
          className={`h-8 px-4 rounded-pill flex items-center gap-2 text-xs font-semibold transition-all cursor-pointer shadow-xs active:scale-98 ${
            isPlaying
              ? 'bg-error hover:bg-error/90 text-on-ink'
              : 'bg-warn hover:bg-warn/90 text-on-ink font-semibold'
          }`}
        >
          {isPlaying ? (
            <>
              <Pause size={13} />
              <span>Pause Audio</span>
            </>
          ) : (
            <>
              <Play size={13} fill="currentColor" />
              <span>{progress > 0 ? 'Resume Audio' : 'Play Audio Briefing'}</span>
            </>
          )}
        </button>

        {!compact && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowTranscript(!showTranscript)}
              className="h-8 px-3 rounded-pill border border-border bg-panel hover:bg-ink/5 text-xs font-semibold flex items-center gap-1.5 text-ink transition-all cursor-pointer shadow-2xs"
            >
              <FileText size={12} />
              <span>{showTranscript ? 'Hide Script' : 'Transcript'}</span>
              {showTranscript ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
            <button
              type="button"
              onClick={copyTranscript}
              className="h-8 w-8 rounded-xl border border-border bg-panel hover:bg-ink/5 flex items-center justify-center text-ink transition-all cursor-pointer shadow-2xs"
              title="Copy transcript text"
            >
              {copied ? <Check size={13} className="text-ok" /> : <Copy size={13} />}
            </button>
          </div>
        )}
      </div>

      {/* Transcript Accordion */}
      {showTranscript && (
        <div className="mt-3 p-3.5 bg-panel dark:bg-neutral-850 rounded-xl border border-border dark:border-neutral-750 text-xs leading-relaxed space-y-1.5 shadow-2xs">
          <div className="flex items-center justify-between text-[10px] font-semibold text-muted uppercase pb-1 border-b border-border-soft">
            <span>Narrated Intelligence Script</span>
            <span className="text-ok font-semibold">VOICE SYNTHESIZED</span>
          </div>
          <p className="text-ink whitespace-pre-wrap text-xs font-normal">
            {audio.script}
          </p>
        </div>
      )}
    </div>
  );
};

/* =========================================================================
   2. INTERACTIVE CHART CARD
   ========================================================================= */
export const ChartMediaCard: React.FC<{
  chart: ChartMedia;
}> = ({ chart }) => {
  const [selectedPoint, setSelectedPoint] = useState<any | null>(null);

  return (
    <div className="rounded-2xl border border-border bg-panel p-4 text-ink shadow-xs transition-all">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-border-soft">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-info/10 text-info border border-info/20">
            <BarChart3 size={15} />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-ink">
              {chart.title}
            </h4>
            <p className="text-[11px] text-muted">{chart.description}</p>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-ok/10 text-ok border border-ok/20 text-[10px] font-semibold uppercase">
          Live Telemetry
        </span>
      </div>

      {/* SVG-based interactive chart */}
      <div className="h-44 w-full relative pt-3 pb-6 px-3 bg-panel rounded-xl border border-border my-2.5">
        {chart.type === 'burndown' ? (
          <div className="h-full flex items-end justify-between gap-2 pt-4 relative">
            {/* Target 0 baseline */}
            <div className="absolute left-0 right-0 bottom-6 border-b border-dashed border-border" />

            {chart.data.map((item, idx) => {
              const maxVal = 50;
              const idealH = Math.min(100, Math.max(8, (item.ideal / maxVal) * 100));
              const actualH = Math.min(100, Math.max(8, (item.actual / maxVal) * 100));
              const isSelected = selectedPoint?.day === item.day;

              return (
                <div
                  key={idx}
                  onClick={() => setSelectedPoint(item)}
                  className={`flex-1 flex flex-col items-center justify-end h-full cursor-pointer group transition-transform ${
                    isSelected ? 'scale-105' : 'hover:opacity-90'
                  }`}
                >
                  <div className="w-full flex items-end justify-center gap-1.5 h-[80%]">
                    {/* Ideal bar */}
                    <div
                      style={{ height: `${idealH}%` }}
                      className="w-2 sm:w-3 bg-surface-high rounded-t-xs transition-all group-hover:bg-ink/30"
                      title={`Ideal: ${item.ideal} pts`}
                    />
                    {/* Actual bar */}
                    <div
                      style={{ height: `${actualH}%` }}
                      className={`w-3 sm:w-4 rounded-t-xs transition-all ${
                        item.actual <= item.ideal
                          ? 'bg-ok shadow-xs'
                          : 'bg-warn shadow-xs'
                      }`}
                      title={`Actual: ${item.actual} pts`}
                    />
                  </div>
                  <span className="text-[10px] font-semibold mt-1.5 truncate max-w-full text-center text-muted">
                    {item.day}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          /* Points Distribution Chart */
          <div className="h-full flex items-end justify-around gap-2 pt-4">
            {chart.data.map((item, idx) => {
              const maxVal = 40;
              const val = item.points || item.count || 20;
              const heightPct = Math.min(100, Math.max(12, (val / maxVal) * 100));
              return (
                <div
                  key={idx}
                  onClick={() => setSelectedPoint(item)}
                  className="flex-1 flex flex-col items-center justify-end h-full cursor-pointer group"
                >
                  <div
                    style={{ height: `${heightPct}%` }}
                    className="w-8 sm:w-10 rounded-t-md bg-ink group-hover:bg-ink/90 transition-all flex items-center justify-center text-[10px] font-semibold text-on-ink shadow-xs"
                  >
                    {val}
                  </div>
                  <span className="text-[10px] font-semibold mt-1.5 truncate max-w-full text-center text-muted">
                    {item.name || item.epic || `Epic ${idx + 1}`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Chart Legend & Selected Point Inspector */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-medium text-ink">
            <span className="h-2 w-2 bg-ok rounded-full inline-block" />
            Actual Burn
          </span>
          <span className="flex items-center gap-1.5 font-medium text-muted">
            <span className="h-2 w-2 bg-surface-high rounded-full inline-block" />
            Ideal Trajectory
          </span>
        </div>

        {selectedPoint ? (
          <span className="px-2.5 py-0.5 rounded-full bg-info/10 text-info border border-info/30 text-xs font-semibold">
            {selectedPoint.day}: {selectedPoint.actual} pts remaining ({selectedPoint.ideal} ideal)
          </span>
        ) : (
          <span className="text-faint text-[11px]">Click any sprint day to inspect status</span>
        )}
      </div>
    </div>
  );
};

/* =========================================================================
   3. INVEST AGILE USER STORY CARD
   ========================================================================= */
export const StoryMediaCard: React.FC<{
  story: StoryCardMedia;
}> = ({ story }) => {
  const [checkedCriteria, setCheckedCriteria] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState(false);

  const toggleCheck = (idx: number) => {
    setCheckedCriteria((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const copyStoryMarkdown = () => {
    const md = `### ${story.id}: ${story.title}
**Epic**: ${story.epic} | **Points**: ${story.points} | **Priority**: ${story.priority.toUpperCase()}
**INVEST Score**: ${story.investScore}%

#### Acceptance Criteria:
${story.acceptanceCriteria.map((c) => `- [ ] ${c}`).join('\n')}
`;
    navigator.clipboard.writeText(md);
    setCopied(true);
    toast.success('INVEST User Story copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const completedCount = Object.values(checkedCriteria).filter(Boolean).length;
  const totalCount = story.acceptanceCriteria.length;

  return (
    <div className="rounded-2xl border border-border bg-panel p-4 text-ink shadow-xs transition-all">
      {/* Top Header */}
      <div className="flex items-start justify-between gap-2 mb-2.5 pb-2.5 border-b border-border-soft">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded-md bg-ink text-on-ink text-[10px] font-semibold">
              {story.id}
            </span>
            <span className="text-[11px] font-semibold text-muted truncate max-w-[160px]">
              {story.epic}
            </span>
          </div>
          <h4 className="text-sm font-semibold text-ink leading-snug">
            {story.title}
          </h4>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="px-2.5 py-0.5 rounded-full bg-ok/10 text-ok border border-ok/30 text-[11px] font-semibold">
            {story.investScore}% INVEST
          </span>
          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded-md bg-warn/10 text-warn border border-warn/30 text-[10px] font-semibold">
              {story.points} PTS
            </span>
            <span className="px-2 py-0.5 rounded-md bg-error/10 text-error border border-error/30 text-[10px] font-semibold uppercase">
              {story.priority}
            </span>
          </div>
        </div>
      </div>

      {/* Acceptance Criteria Checklist */}
      <div className="space-y-2 my-3">
        <div className="flex items-center justify-between text-[11px] font-semibold text-muted uppercase">
          <span>Acceptance Criteria:</span>
          <span className="text-ok">
            {completedCount}/{totalCount} Completed
          </span>
        </div>

        <div className="space-y-1.5">
          {story.acceptanceCriteria.map((criterion, idx) => {
            const isChecked = !!checkedCriteria[idx];
            return (
              <div
                key={idx}
                onClick={() => toggleCheck(idx)}
                className={`flex items-start gap-2.5 p-2 rounded-xl border cursor-pointer transition-all ${
                  isChecked
                    ? 'bg-ok/20 border-ok/60 line-through opacity-75'
                    : 'bg-panel border-border hover:bg-ink/5'
                }`}
              >
                <button
                  type="button"
                  className="mt-0.5 shrink-0 text-ink cursor-pointer"
                  aria-label={isChecked ? 'Uncheck criterion' : 'Check criterion'}
                >
                  {isChecked ? (
                    <CheckSquare size={15} className="text-ok" />
                  ) : (
                    <Square size={15} />
                  )}
                </button>
                <span className="text-xs text-ink leading-relaxed font-normal">
                  {criterion}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
        <button
          type="button"
          onClick={() => toast.success(`Task ${story.id} queued for sprint board execution`)}
          className="h-8 px-3.5 rounded-pill bg-ink text-on-ink hover:opacity-90 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
        >
          <BookmarkPlus size={13} />
          <span>Add to Sprint Board</span>
        </button>

        <button
          type="button"
          onClick={copyStoryMarkdown}
          className="h-8 px-3 rounded-pill border border-border bg-panel hover:bg-ink/5 text-xs font-semibold flex items-center gap-1.5 text-ink transition-all cursor-pointer shadow-2xs"
        >
          {copied ? <Check size={13} className="text-ok" /> : <Copy size={13} />}
          <span>{copied ? 'Copied' : 'Copy Story'}</span>
        </button>
      </div>
    </div>
  );
};

/* =========================================================================
   4. INTERACTIVE ARCHITECTURE DIAGRAM CARD
   ========================================================================= */
export const DiagramMediaCard: React.FC<{
  diagram: DiagramMedia;
}> = ({ diagram }) => {
  const [activeNode, setActiveNode] = useState<string | null>(null);

  const getNodeBadge = (type: string) => {
    switch (type) {
      case 'client':
        return 'bg-info/10 text-info border-info/20';
      case 'gateway':
        return 'bg-warn/10 text-warn border-warn/20';
      case 'service':
        return 'bg-ok/10 text-ok border-ok/20';
      case 'storage':
        return 'bg-agent-business-improver/10 text-agent-business-improver border-agent-business-improver/20';
      default:
        return 'bg-panel-alt text-ink border-border';
    }
  };

  const selectedNodeObj = diagram.nodes.find((n) => n.id === activeNode) || diagram.nodes[0];

  return (
    <div className="rounded-2xl border border-border bg-panel p-4 text-ink shadow-xs transition-all">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2.5 pb-2.5 border-b border-border-soft">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-agent-business-improver/10 text-agent-business-improver border border-agent-business-improver/20">
            <Layers size={15} />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-ink">
              {diagram.title}
            </h4>
            <p className="text-[11px] text-muted">{diagram.description}</p>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-agent-business-improver/10 text-agent-business-improver border border-agent-business-improver/30 text-[10px] font-semibold uppercase">
          Topology Mesh
        </span>
      </div>

      {/* Visual Service Mesh Nodes Flow */}
      <div className="my-2.5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
          {diagram.nodes.map((node) => {
            const isSelected = activeNode === node.id || (!activeNode && node.id === diagram.nodes[0]?.id);
            return (
              <div
                key={node.id}
                onClick={() => setActiveNode(node.id)}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'border-agent-business-improver/30 ring-2 ring-agent-business-improver/20 bg-agent-business-improver/20 shadow-xs'
                    : 'border-border hover:border-border bg-panel'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-semibold uppercase mb-1">
                  <span className={`px-1.5 py-0.2 rounded border text-[9px] ${getNodeBadge(node.type)}`}>
                    {node.type}
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full bg-ok" />
                </div>
                <span className="block text-xs font-semibold text-ink leading-tight truncate">
                  {node.label}
                </span>
                {node.tech && (
                  <span className="text-[11px] text-muted block mt-1 truncate">
                    {node.tech}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Selected Node Spec Details Sheet */}
        {selectedNodeObj && (
          <div className="p-3 rounded-xl bg-panel dark:bg-neutral-850 border border-border dark:border-neutral-750 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-ink">
                <Cpu size={13} className="text-agent-business-improver" />
                <span>Active Layer: {selectedNodeObj.label}</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-high text-ink font-semibold">
                {selectedNodeObj.tech || 'Standard Protocol'}
              </span>
            </div>
            <p className="text-[11px] text-muted leading-relaxed">
              Target SLA: <strong>&lt; 50ms p99 latency</strong> · High-availability multi-zone deployment with circuit breakers and automated health checks.
            </p>
          </div>
        )}

        {/* Communication Channels Ribbon */}
        <div className="p-2.5 rounded-xl bg-panel dark:bg-neutral-850 border border-border dark:border-neutral-750 text-xs">
          <span className="font-semibold text-[10px] uppercase text-muted block mb-1.5">
            Inter-Service Data Channels:
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {diagram.edges.map((edge, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded-md border border-border bg-panel text-[10px] font-mono font-medium text-ink flex items-center gap-1"
              >
                <span>{edge.from}</span>
                <ArrowRight size={10} className="text-faint" />
                <span>{edge.to}</span>
                {edge.label && <span className="opacity-70 text-[9px]">[{edge.label}]</span>}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   5. CODE & SPEC SNIPPET CARD
   ========================================================================= */
export const CodeSnippetMediaCard: React.FC<{
  code: CodeSnippetMedia;
}> = ({ code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code.code);
    setCopied(true);
    toast.success('Code copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-border bg-base text-ink p-4 font-mono text-xs">
      <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-panel-alt text-warn border border-border text-[10px]">
            <Code2 size={13} />
          </div>
          <span className="px-2 py-0.5 rounded bg-panel-alt text-[10px] font-semibold uppercase text-warn">
            {code.language}
          </span>
          <span className="font-semibold text-xs truncate text-muted">
            {code.title}
          </span>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="h-7 px-2.5 rounded-pill border border-border bg-ink hover:bg-ink/90 text-muted text-[10px] font-semibold uppercase flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
        >
          {copied ? <Check size={11} className="text-ok" /> : <Copy size={11} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      <pre className="overflow-x-auto p-3 rounded-xl bg-base/60 border border-neutral-850 text-[11px] leading-relaxed text-ok font-mono scrollbar-thin">
        <code>{code.code}</code>
      </pre>

      {code.description && (
        <p className="mt-2.5 text-[11px] text-faint font-sans leading-relaxed">
          {code.description}
        </p>
      )}
    </div>
  );
};

/* =========================================================================
   MASTER MIXED MEDIA CARD RENDERER
   ========================================================================= */
export const MixedMediaCard: React.FC<{
  media?: MixedMediaPayload;
  compact?: boolean;
}> = ({ media, compact = false }) => {
  if (!media) return null;

  return (
    <div className="space-y-3.5 my-2.5 w-full">
      {/* 1. Audio Briefing */}
      {media.audioBriefing && (
        <AudioBriefingCard audio={media.audioBriefing} compact={compact} />
      )}

      {/* 2. Charts */}
      {media.chart && <ChartMediaCard chart={media.chart} />}

      {/* 3. INVEST Stories */}
      {media.storyCard && <StoryMediaCard story={media.storyCard} />}

      {/* 4. Architecture Diagrams */}
      {media.diagram && <DiagramMediaCard diagram={media.diagram} />}

      {/* 5. Code & Contract Specs */}
      {media.codeSnippet && <CodeSnippetMediaCard code={media.codeSnippet} />}

      {/* 6. Attachments */}
      {media.attachments && media.attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {media.attachments.map((att, i) => (
            <div
              key={i}
              className="px-2.5 py-1 rounded-lg bg-panel-alt border border-border text-xs font-medium flex items-center gap-1.5 shadow-2xs"
            >
              <FileText size={12} className="text-warn" />
              <span className="font-semibold text-ink">{att.name}</span>
              <span className="text-[10px] text-muted">({att.size})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MixedMediaCard;
