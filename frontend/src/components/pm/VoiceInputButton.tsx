import React, { useState } from 'react';
import { Mic, MicOff, Square, Loader2, Sparkles, Volume2, AlertCircle } from 'lucide-react';
import { useVoiceToText } from '../../lib/useVoiceToText';

export interface VoiceInputButtonProps {
  id?: string;
  /**
   * The current text in the input or textarea.
   */
  currentValue?: string;
  /**
   * Callback fired when voice transcription produces new text.
   * By default, it either appends or replaces based on user choice or default append mode.
   */
  onTextCaptured: (newText: string) => void;
  /**
   * Optional custom label for the button. Defaults to "Voice Input".
   */
  label?: string;
  /**
   * Display variant:
   * 'inline-sm': compact small button for dense toolbars
   * 'button': standard brutalist button with label
   * 'prominent': larger action bar with waveform visualizer
   */
  variant?: 'inline-sm' | 'button' | 'prominent';
  /**
   * Placeholder or question description for context
   */
  contextHint?: string;
  /**
   * Whether to append captured text to existing text or replace. Defaults to 'append'.
   */
  defaultMode?: 'append' | 'replace';
  className?: string;
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  id = 'voice-input-button',
  currentValue = '',
  onTextCaptured,
  label = 'Voice Input',
  variant = 'button',
  contextHint,
  defaultMode = 'append',
  className = '',
}) => {
  const [insertMode, setInsertMode] = useState<'append' | 'replace'>(defaultMode);
  const [showLivePanel, setShowLivePanel] = useState(false);

  const {
    isListening,
    isTranscribing,
    interimTranscript,
    error,
    audioLevel,
    audioBars,
    isSupported,
    engine,
    startListening,
    stopListening,
  } = useVoiceToText({
    onTranscriptChange: (textChunk, isFinal) => {
      if (isFinal && textChunk.trim()) {
        const cleaned = textChunk.trim();
        if (insertMode === 'append' && currentValue.trim()) {
          onTextCaptured(`${currentValue.trim()} ${cleaned}`);
        } else {
          onTextCaptured(cleaned);
        }
      }
    },
  });

  const handleToggle = async () => {
    if (isListening) {
      stopListening();
      setShowLivePanel(false);
    } else {
      setShowLivePanel(true);
      const started = await startListening();
      if (!started) {
        // Will show error banner
      }
    }
  };

  const handleCancel = () => {
    stopListening();
    setShowLivePanel(false);
  };

  if (!isSupported) {
    return (
      <button
        id={id}
        type="button"
        disabled
        title="Microphone / Speech recognition is not supported in this browser"
        className="h-8 px-3 rounded-pill bg-ink/[0.04] text-faint border border-border-soft text-xs font-medium cursor-not-allowed flex items-center gap-1.5 opacity-70"
      >
        <MicOff className="w-3 h-3" />
        <span>Voice Unavailable</span>
      </button>
    );
  }

  return (
    <div className="relative inline-block">
      {/* Primary Trigger Button */}
      {variant === 'inline-sm' ? (
        <button
          id={id}
          type="button"
          onClick={handleToggle}
          disabled={isTranscribing}
          title={isListening ? 'Stop listening' : 'Dictate verbally with microphone'}
          className={`h-7 px-2.5 rounded-pill text-[11px] font-medium border transition-all flex items-center gap-1 ${
            isListening
              ? 'bg-error/15 text-error border-error/30 animate-pulse motion-reduce:animate-none'
              : 'bg-glass hover:bg-ink/10 text-ink border-glass-border'
          } ${className}`}
        >
          {isListening ? (
            <>
              <Square className="w-2.5 h-2.5 fill-current" />
              <span>Listening…</span>
            </>
          ) : isTranscribing ? (
            <>
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              <span>Transcribing…</span>
            </>
          ) : (
            <>
              <Mic className="w-2.5 h-2.5 text-muted" />
              <span>{label || 'Dictate'}</span>
            </>
          )}
        </button>
      ) : variant === 'prominent' ? (
        <button
          id={id}
          type="button"
          onClick={handleToggle}
          disabled={isTranscribing}
          className={`h-9 px-4 rounded-pill text-xs font-medium border transition-all flex items-center gap-2 ${
            isListening
              ? 'bg-error/15 text-error border-error/30'
              : 'bg-glass hover:bg-ink/10 text-ink border-glass-border backdrop-blur-[5px]'
          } ${className}`}
        >
          {isListening ? (
            <>
              <span className="w-2 h-2 rounded-full bg-error animate-ping motion-reduce:animate-none" />
              <span>Recording Voice… (Click to Finish)</span>
              <Square className="w-3.5 h-3.5 fill-current ml-1" />
            </>
          ) : isTranscribing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-warn" />
              <span>Transcribing Audio…</span>
            </>
          ) : (
            <>
              <Mic className="w-3.5 h-3.5 text-muted" />
              <span>{label}</span>
              <span className="font-mono text-[10px] px-1.5 rounded-pill bg-ink/[0.06] text-muted">
                MIC
              </span>
            </>
          )}
        </button>
      ) : (
        /* Standard glass pill */
        <button
          id={id}
          type="button"
          onClick={handleToggle}
          disabled={isTranscribing}
          className={`h-9 px-3.5 rounded-pill text-xs font-medium border transition-all flex items-center gap-1.5 ${
            isListening
              ? 'bg-error/15 text-error border-error/30'
              : 'bg-glass hover:bg-ink/10 text-ink border-glass-border backdrop-blur-[5px]'
          } ${className}`}
        >
          {isListening ? (
            <>
              <span className="w-2 h-2 rounded-full bg-error animate-pulse motion-reduce:animate-none shrink-0" />
              <span>Recording…</span>
              <Square className="w-3 h-3 fill-current ml-0.5" />
            </>
          ) : isTranscribing ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin text-warn" />
              <span>Transcribing…</span>
            </>
          ) : (
            <>
              <Mic className="w-3 h-3 text-muted shrink-0" />
              <span>{label}</span>
            </>
          )}
        </button>
      )}

      {/* Real-time Voice Recording Visualizer / Live Transcription Panel */}
      {(isListening || showLivePanel || isTranscribing || error) && (
        <div
          id={`${id}-live-panel`}
          className="absolute right-0 top-full mt-2 z-50 w-72 sm:w-88 p-3 rounded-xl bg-glass-strong border border-glass-strong-border backdrop-blur-md shadow-brutal-lg space-y-2.5 text-left"
        >
          {/* Header & Status */}
          <div className="flex items-center justify-between border-b border-border pb-1.5">
            <div className="flex items-center gap-1.5">
              {isListening ? (
                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-error/10 text-error border border-error/30 text-[10px] font-semibold uppercase">
                  <span className="w-2 h-2 rounded-full bg-error animate-pulse" />
                  Live Listening
                </span>
              ) : isTranscribing ? (
                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-warn/10 text-warn border border-warn/30 text-[10px] font-semibold uppercase">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  Processing Audio
                </span>
              ) : error ? (
                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-error/10 text-error border border-error/30 text-[10px] font-semibold uppercase">
                  <AlertCircle className="w-2.5 h-2.5" />
                  Notice
                </span>
              ) : (
                <span className="text-[10px] font-semibold uppercase text-muted">
                  Voice Dictation
                </span>
              )}

              <span className="text-[9px] text-faint uppercase font-semibold">
                {engine === 'native' ? 'Web Speech API' : 'Gemini Multimodal Audio'}
              </span>
            </div>

            <button
              type="button"
              onClick={handleCancel}
              className="text-[10px] font-semibold text-faint hover:text-ink uppercase"
            >
              ✕
            </button>
          </div>

          {/* Context directive hint */}
          {contextHint && (
            <div className="text-[10px] text-muted italic bg-panel p-1 border border-border line-clamp-2">
              &ldquo;{contextHint}&rdquo;
            </div>
          )}

          {/* Equalizer Frequency Wave Bars while listening */}
          {isListening && (
            <div className="bg-panel-alt p-2 border border-border flex items-center justify-between gap-3">
              <div className="flex items-center gap-1 text-[10px] text-ok font-semibold">
                <Volume2 className="w-3 h-3 text-ok" />
                <span>{audioLevel > 5 ? 'VOICE DETECTED' : 'AWAITING SPEECH…'}</span>
              </div>

              {/* 5 animated audio frequency equalizer bars */}
              <div className="flex items-end gap-1 h-5">
                {audioBars.map((h, i) => (
                  <span
                    key={i}
                    className="w-1.5 bg-ok border border-ok/30 transition-all duration-75"
                    style={{ height: `${Math.max(4, Math.round((h / 100) * 20))}px` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Live Interim Transcript Stream */}
          {interimTranscript && (
            <div className="p-2 bg-warn/10 border border-warn/30 text-xs font-semibold text-warn italic">
              <span className="text-[9px] font-semibold uppercase text-warn block not-italic mb-0.5">
                Hearing right now:
              </span>
              &ldquo;{interimTranscript}&rdquo;
            </div>
          )}

          {/* Error notice if any */}
          {error && (
            <div className="p-2 bg-error/10 border border-error/30 text-[11px] font-semibold text-error">
              {error}
            </div>
          )}

          {/* Action options & Done button */}
          <div className="pt-1 flex flex-wrap items-center justify-between gap-2 border-t border-border text-[10px]">
            {/* Insert Mode Toggle */}
            <div className="flex items-center gap-1 font-semibold text-muted">
              <span>Mode:</span>
              <button
                type="button"
                onClick={() => setInsertMode('append')}
                className={`px-1.5 py-0.5 border ${
                  insertMode === 'append'
                    ? 'bg-ink text-on-ink border-border'
                    : 'bg-panel-alt text-ink border-border'
                }`}
              >
                Append
              </button>
              <button
                type="button"
                onClick={() => setInsertMode('replace')}
                className={`px-1.5 py-0.5 border ${
                  insertMode === 'replace'
                    ? 'bg-ink text-on-ink border-border'
                    : 'bg-panel-alt text-ink border-border'
                }`}
              >
                Replace
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5">
              {isListening ? (
                <button
                  type="button"
                  onClick={() => {
                    stopListening();
                    setShowLivePanel(false);
                  }}
                  className="px-2.5 py-1 rounded-pill bg-ink text-on-ink font-medium flex items-center gap-1 hover:bg-ink/90"
                >
                  <Square className="w-2.5 h-2.5 fill-current" />
                  <span>Done Speaking</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleToggle}
                  className="px-2.5 py-1 rounded-pill bg-accent/[0.12] text-accent font-medium border border-accent/25 flex items-center gap-1"
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>Resume Dictation</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoiceInputButton;
