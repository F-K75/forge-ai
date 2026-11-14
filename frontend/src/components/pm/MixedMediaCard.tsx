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
    <div className="rounded-2xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-[#12141D] p-4 text-neutral-900 dark:text-neutral-100 shadow-xs transition-all">
      {/* Header Row */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shadow-2xs">
            <Volume2 size={16} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100 truncate">
                {audio.title}
              </span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                VOICE BRIEF
              </span>
            </div>
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400 block truncate">
              Narrator: <strong className="text-neutral-700 dark:text-neutral-300">{audio.narrator}</strong> · {audio.duration}
            </span>
          </div>
        </div>

        {/* Speed & Mute Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={cycleSpeed}
            className="h-7 px-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-xs font-bold transition-all cursor-pointer shadow-2xs"
            title="Cycle playback speed"
          >
            {speed}x
          </button>
          <button
            type="button"
            onClick={() => setIsMuted(!isMuted)}
            className="h-7 w-7 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 flex items-center justify-center text-neutral-700 dark:text-neutral-300 transition-all cursor-pointer shadow-2xs"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX size={13} className="text-rose-500" /> : <Volume2 size={13} />}
          </button>
        </div>
      </div>

      {/* Reactive Frequency Equalizer */}
      <div className="flex items-end gap-1 h-10 px-3 py-1.5 bg-amber-500/10 dark:bg-neutral-950/60 rounded-xl border border-amber-500/20 my-2.5 overflow-hidden">
        {frequencies.map((f, i) => {
          const dynamicHeight = isPlaying
            ? Math.max(18, Math.min(100, f + Math.sin(Date.now() / 150 + i * 0.8) * 30))
            : Math.max(14, f * 0.35);
          return (
            <div
              key={i}
              className={`flex-1 rounded-t-sm transition-all duration-150 ${
                isPlaying ? 'bg-amber-500 dark:bg-amber-400' : 'bg-neutral-300 dark:bg-neutral-700'
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
        <div className="w-full h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] font-semibold text-neutral-500 dark:text-neutral-400">
          <span className="flex items-center gap-1">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isPlaying ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400'
              }`}
            />
            {isPlaying ? 'Playing briefing' : progress > 0 ? 'Paused' : 'Ready to stream'}
          </span>
          <span>{audio.duration}</span>
        </div>
      </div>

      {/* Control Actions */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
        <button
          type="button"
          onClick={handleTogglePlay}
          className={`h-8 px-4 rounded-xl flex items-center gap-2 text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-98 ${
            isPlaying
              ? 'bg-rose-600 hover:bg-rose-700 text-white'
              : 'bg-amber-500 hover:bg-amber-600 text-neutral-950 font-black'
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
              className="h-8 px-3 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-xs font-semibold flex items-center gap-1.5 text-neutral-700 dark:text-neutral-200 transition-all cursor-pointer shadow-2xs"
            >
              <FileText size={12} />
              <span>{showTranscript ? 'Hide Script' : 'Transcript'}</span>
              {showTranscript ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
            <button
              type="button"
              onClick={copyTranscript}
              className="h-8 w-8 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 flex items-center justify-center text-neutral-700 dark:text-neutral-200 transition-all cursor-pointer shadow-2xs"
              title="Copy transcript text"
            >
              {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
            </button>
          </div>
        )}
      </div>

      {/* Transcript Accordion */}
      {showTranscript && (
        <div className="mt-3 p-3.5 bg-white dark:bg-neutral-850 rounded-xl border border-neutral-200 dark:border-neutral-750 text-xs leading-relaxed space-y-1.5 shadow-2xs">
          <div className="flex items-center justify-between text-[10px] font-bold text-neutral-500 uppercase pb-1 border-b border-neutral-100 dark:border-neutral-800">
            <span>Narrated Intelligence Script</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">VOICE SYNTHESIZED</span>
          </div>
          <p className="text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap text-xs font-normal">
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
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 text-neutral-900 dark:text-neutral-100 shadow-xs transition-all">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-neutral-100 dark:border-neutral-800">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <BarChart3 size={15} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
              {chart.title}
            </h4>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{chart.description}</p>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 text-[10px] font-bold uppercase">
          Live Telemetry
        </span>
      </div>

      {/* SVG-based interactive chart */}
      <div className="h-44 w-full relative pt-3 pb-6 px-3 bg-neutral-50 dark:bg-neutral-950/60 rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 my-2.5">
        {chart.type === 'burndown' ? (
          <div className="h-full flex items-end justify-between gap-2 pt-4 relative">
            {/* Target 0 baseline */}
            <div className="absolute left-0 right-0 bottom-6 border-b border-dashed border-neutral-300 dark:border-neutral-700" />

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
                      className="w-2 sm:w-3 bg-neutral-300 dark:bg-neutral-700 rounded-t-xs transition-all group-hover:bg-neutral-400"
                      title={`Ideal: ${item.ideal} pts`}
                    />
                    {/* Actual bar */}
                    <div
                      style={{ height: `${actualH}%` }}
                      className={`w-3 sm:w-4 rounded-t-xs transition-all ${
                        item.actual <= item.ideal
                          ? 'bg-emerald-500 shadow-xs'
                          : 'bg-amber-500 shadow-xs'
                      }`}
                      title={`Actual: ${item.actual} pts`}
                    />
                  </div>
                  <span className="text-[10px] font-semibold mt-1.5 truncate max-w-full text-center text-neutral-600 dark:text-neutral-400">
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
                    className="w-8 sm:w-10 rounded-t-md bg-blue-500 group-hover:bg-blue-600 transition-all flex items-center justify-center text-[10px] font-bold text-white shadow-xs"
                  >
                    {val}
                  </div>
                  <span className="text-[10px] font-semibold mt-1.5 truncate max-w-full text-center text-neutral-600 dark:text-neutral-400">
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
          <span className="flex items-center gap-1.5 font-medium text-neutral-700 dark:text-neutral-300">
            <span className="h-2 w-2 bg-emerald-500 rounded-full inline-block" />
            Actual Burn
          </span>
          <span className="flex items-center gap-1.5 font-medium text-neutral-500 dark:text-neutral-400">
            <span className="h-2 w-2 bg-neutral-300 dark:bg-neutral-700 rounded-full inline-block" />
            Ideal Trajectory
          </span>
        </div>

        {selectedPoint ? (
          <span className="px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-bold">
            {selectedPoint.day}: {selectedPoint.actual} pts remaining ({selectedPoint.ideal} ideal)
          </span>
        ) : (
          <span className="text-neutral-400 text-[11px]">Click any sprint day to inspect status</span>
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
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 text-neutral-900 dark:text-neutral-100 shadow-xs transition-all">
      {/* Top Header */}
      <div className="flex items-start justify-between gap-2 mb-2.5 pb-2.5 border-b border-neutral-100 dark:border-neutral-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded-md bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-950 text-[10px] font-bold">
              {story.id}
            </span>
            <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 truncate max-w-[160px]">
              {story.epic}
            </span>
          </div>
          <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 leading-snug">
            {story.title}
          </h4>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 text-[11px] font-bold">
            {story.investScore}% INVEST
          </span>
          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/50 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800 text-[10px] font-bold">
              {story.points} PTS
            </span>
            <span className="px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950/50 text-rose-900 dark:text-rose-300 border border-rose-300 dark:border-rose-800 text-[10px] font-bold uppercase">
              {story.priority}
            </span>
          </div>
        </div>
      </div>

      {/* Acceptance Criteria Checklist */}
      <div className="space-y-2 my-3">
        <div className="flex items-center justify-between text-[11px] font-bold text-neutral-500 uppercase">
          <span>Acceptance Criteria:</span>
          <span className="text-emerald-600 dark:text-emerald-400">
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
                    ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300/60 dark:border-emerald-800/60 line-through opacity-75'
                    : 'bg-neutral-50 dark:bg-neutral-800/40 border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                <button
                  type="button"
                  className="mt-0.5 shrink-0 text-neutral-700 dark:text-neutral-300 cursor-pointer"
                  aria-label={isChecked ? 'Uncheck criterion' : 'Check criterion'}
                >
                  {isChecked ? (
                    <CheckSquare size={15} className="text-emerald-600" />
                  ) : (
                    <Square size={15} />
                  )}
                </button>
                <span className="text-xs text-neutral-800 dark:text-neutral-200 leading-relaxed font-normal">
                  {criterion}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
        <button
          type="button"
          onClick={() => toast.success(`Task ${story.id} queued for sprint board execution`)}
          className="h-8 px-3.5 rounded-xl bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-950 hover:opacity-90 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
        >
          <BookmarkPlus size={13} />
          <span>Add to Sprint Board</span>
        </button>

        <button
          type="button"
          onClick={copyStoryMarkdown}
          className="h-8 px-3 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-xs font-semibold flex items-center gap-1.5 text-neutral-700 dark:text-neutral-200 transition-all cursor-pointer shadow-2xs"
        >
          {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
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
        return 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20';
      case 'gateway':
        return 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20';
      case 'service':
        return 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/20';
      case 'storage':
        return 'bg-purple-500/10 text-purple-800 dark:text-purple-300 border-purple-500/20';
      default:
        return 'bg-neutral-100 text-neutral-800 border-neutral-300';
    }
  };

  const selectedNodeObj = diagram.nodes.find((n) => n.id === activeNode) || diagram.nodes[0];

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 text-neutral-900 dark:text-neutral-100 shadow-xs transition-all">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2.5 pb-2.5 border-b border-neutral-100 dark:border-neutral-800">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
            <Layers size={15} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
              {diagram.title}
            </h4>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{diagram.description}</p>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800 text-[10px] font-bold uppercase">
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
                    ? 'border-purple-500 ring-2 ring-purple-500/20 bg-purple-50/40 dark:bg-purple-950/30 shadow-xs'
                    : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/40'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-bold uppercase mb-1">
                  <span className={`px-1.5 py-0.2 rounded border text-[9px] ${getNodeBadge(node.type)}`}>
                    {node.type}
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </div>
                <span className="block text-xs font-bold text-neutral-900 dark:text-neutral-100 leading-tight truncate">
                  {node.label}
                </span>
                {node.tech && (
                  <span className="text-[11px] text-neutral-500 dark:text-neutral-400 block mt-1 truncate">
                    {node.tech}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Selected Node Spec Details Sheet */}
        {selectedNodeObj && (
          <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200 dark:border-neutral-750 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-neutral-900 dark:text-neutral-100">
                <Cpu size={13} className="text-purple-600 dark:text-purple-400" />
                <span>Active Layer: {selectedNodeObj.label}</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-bold">
                {selectedNodeObj.tech || 'Standard Protocol'}
              </span>
            </div>
            <p className="text-[11px] text-neutral-600 dark:text-neutral-400 leading-relaxed">
              Target SLA: <strong>&lt; 50ms p99 latency</strong> · High-availability multi-zone deployment with circuit breakers and automated health checks.
            </p>
          </div>
        )}

        {/* Communication Channels Ribbon */}
        <div className="p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-850 border border-neutral-200 dark:border-neutral-750 text-xs">
          <span className="font-bold text-[10px] uppercase text-neutral-500 block mb-1.5">
            Inter-Service Data Channels:
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {diagram.edges.map((edge, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-[10px] font-mono font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1"
              >
                <span>{edge.from}</span>
                <ArrowRight size={10} className="text-neutral-400" />
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
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 text-neutral-100 p-4 shadow-xs font-mono text-xs">
      <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-neutral-800">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-neutral-800 text-amber-400 border border-neutral-700 text-[10px]">
            <Code2 size={13} />
          </div>
          <span className="px-2 py-0.5 rounded bg-neutral-800 text-[10px] font-bold uppercase text-amber-400">
            {code.language}
          </span>
          <span className="font-bold text-xs truncate text-neutral-200">
            {code.title}
          </span>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="h-7 px-2.5 rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[10px] font-bold uppercase flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
        >
          {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      <pre className="overflow-x-auto p-3 rounded-xl bg-black/60 border border-neutral-850 text-[11px] leading-relaxed text-emerald-400 font-mono scrollbar-thin">
        <code>{code.code}</code>
      </pre>

      {code.description && (
        <p className="mt-2.5 text-[11px] text-neutral-400 font-sans leading-relaxed">
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
              className="px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs font-medium flex items-center gap-1.5 shadow-2xs"
            >
              <FileText size={12} className="text-amber-500" />
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">{att.name}</span>
              <span className="text-[10px] text-neutral-500">({att.size})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MixedMediaCard;
