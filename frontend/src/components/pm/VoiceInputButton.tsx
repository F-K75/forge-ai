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
        className="px-2 py-1 bg-neutral-100 text-neutral-400 border border-neutral-300 text-[10px] font-mono font-bold uppercase cursor-not-allowed flex items-center gap-1 opacity-60"
      >
        <MicOff className="w-3 h-3" />
        <span>Voice Unavailable</span>
      </button>
    );
  }

  return (
    <div className="relative inline-block font-mono">
      {/* Primary Trigger Button */}
      {variant === 'inline-sm' ? (
        <button
          id={id}
          type="button"
          onClick={handleToggle}
          disabled={isTranscribing}
          title={isListening ? 'Stop listening' : 'Dictate verbally with microphone'}
          className={`px-2 py-0.5 text-[10px] font-black uppercase border transition-all flex items-center gap-1 ${
            isListening
              ? 'bg-rose-500 text-white border-black animate-pulse shadow-[1px_1px_0px_#000]'
              : 'bg-white hover:bg-brutal-yellow text-neutral-800 border-black shadow-[1px_1px_0px_#000]'
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
              <Mic className="w-2.5 h-2.5 text-neutral-700" />
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
          className={`px-3 py-1.5 text-xs font-black uppercase border-2 transition-all flex items-center gap-2 ${
            isListening
              ? 'bg-rose-600 text-white border-black shadow-[2px_2px_0px_#000]'
              : 'bg-white hover:bg-neutral-50 text-black border-black shadow-[2px_2px_0px_#000]'
          } ${className}`}
        >
          {isListening ? (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
              <span>Recording Voice… (Click to Finish)</span>
              <Square className="w-3.5 h-3.5 fill-current ml-1" />
            </>
          ) : isTranscribing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
              <span>Transcribing Audio…</span>
            </>
          ) : (
            <>
              <Mic className="w-3.5 h-3.5 text-rose-600" />
              <span>{label}</span>
              <span className="text-[10px] px-1.5 py-0.2 bg-neutral-100 text-neutral-600 border border-neutral-300">
                MIC
              </span>
            </>
          )}
        </button>
      ) : (
        /* Standard brutalist button */
        <button
          id={id}
          type="button"
          onClick={handleToggle}
          disabled={isTranscribing}
          className={`px-2.5 py-1 text-[11px] font-black uppercase border-2 transition-all flex items-center gap-1.5 ${
            isListening
              ? 'bg-rose-500 text-white border-black shadow-[2px_2px_0px_#000]'
              : 'bg-white hover:bg-brutal-yellow text-black border-black shadow-[1px_1px_0px_#000] active:translate-x-0.5 active:translate-y-0.5'
          } ${className}`}
        >
          {isListening ? (
            <>
              <span className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" />
              <span>Recording…</span>
              <Square className="w-3 h-3 fill-white ml-0.5" />
            </>
          ) : isTranscribing ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin text-amber-700" />
              <span>Transcribing…</span>
            </>
          ) : (
            <>
              <Mic className="w-3 h-3 text-rose-600 shrink-0" />
              <span>{label}</span>
            </>
          )}
        </button>
      )}

      {/* Real-time Voice Recording Visualizer / Live Transcription Panel */}
      {(isListening || showLivePanel || isTranscribing || error) && (
        <div
          id={`${id}-live-panel`}
          className="absolute right-0 top-full mt-2 z-50 w-72 sm:w-88 p-3 bg-white border-2 border-black shadow-[4px_4px_0px_#000] space-y-2.5 text-left font-mono"
        >
          {/* Header & Status */}
          <div className="flex items-center justify-between border-b border-black pb-1.5">
            <div className="flex items-center gap-1.5">
              {isListening ? (
                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-rose-100 text-rose-800 border border-rose-400 text-[10px] font-black uppercase">
                  <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
                  Live Listening
                </span>
              ) : isTranscribing ? (
                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-400 text-[10px] font-black uppercase">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  Processing Audio
                </span>
              ) : error ? (
                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-rose-100 text-rose-800 border border-rose-400 text-[10px] font-black uppercase">
                  <AlertCircle className="w-2.5 h-2.5" />
                  Notice
                </span>
              ) : (
                <span className="text-[10px] font-black uppercase text-neutral-600">
                  Voice Dictation
                </span>
              )}

              <span className="text-[9px] text-neutral-400 uppercase font-bold">
                {engine === 'native' ? 'Web Speech API' : 'Gemini Multimodal Audio'}
              </span>
            </div>

            <button
              type="button"
              onClick={handleCancel}
              className="text-[10px] font-black text-neutral-400 hover:text-black uppercase"
            >
              ✕
            </button>
          </div>

          {/* Context directive hint */}
          {contextHint && (
            <div className="text-[10px] text-neutral-600 italic bg-neutral-50 p-1 border border-neutral-200 line-clamp-2">
              &ldquo;{contextHint}&rdquo;
            </div>
          )}

          {/* Equalizer Frequency Wave Bars while listening */}
          {isListening && (
            <div className="bg-neutral-900 p-2 border border-black flex items-center justify-between gap-3">
              <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-black">
                <Volume2 className="w-3 h-3 text-emerald-400" />
                <span>{audioLevel > 5 ? 'VOICE DETECTED' : 'AWAITING SPEECH…'}</span>
              </div>

              {/* 5 animated audio frequency equalizer bars */}
              <div className="flex items-end gap-1 h-5">
                {audioBars.map((h, i) => (
                  <span
                    key={i}
                    className="w-1.5 bg-emerald-400 border border-emerald-300 transition-all duration-75"
                    style={{ height: `${Math.max(4, Math.round((h / 100) * 20))}px` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Live Interim Transcript Stream */}
          {interimTranscript && (
            <div className="p-2 bg-amber-50 border border-amber-300 text-xs font-bold text-amber-950 italic">
              <span className="text-[9px] font-black uppercase text-amber-700 block not-italic mb-0.5">
                Hearing right now:
              </span>
              &ldquo;{interimTranscript}&rdquo;
            </div>
          )}

          {/* Error notice if any */}
          {error && (
            <div className="p-2 bg-rose-50 border border-rose-300 text-[11px] font-bold text-rose-900">
              {error}
            </div>
          )}

          {/* Action options & Done button */}
          <div className="pt-1 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 text-[10px]">
            {/* Insert Mode Toggle */}
            <div className="flex items-center gap-1 font-bold text-neutral-600">
              <span>Mode:</span>
              <button
                type="button"
                onClick={() => setInsertMode('append')}
                className={`px-1.5 py-0.5 border ${
                  insertMode === 'append'
                    ? 'bg-black text-white border-black'
                    : 'bg-neutral-100 text-neutral-700 border-neutral-300'
                }`}
              >
                Append
              </button>
              <button
                type="button"
                onClick={() => setInsertMode('replace')}
                className={`px-1.5 py-0.5 border ${
                  insertMode === 'replace'
                    ? 'bg-black text-white border-black'
                    : 'bg-neutral-100 text-neutral-700 border-neutral-300'
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
                  className="px-2 py-1 bg-black text-white font-black uppercase border border-black shadow-[1px_1px_0px_#FFE600] flex items-center gap-1 hover:bg-neutral-800"
                >
                  <Square className="w-2.5 h-2.5 fill-current" />
                  <span>Done Speaking</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleToggle}
                  className="px-2 py-1 bg-brutal-yellow text-black font-black uppercase border border-black shadow-[1px_1px_0px_#000] flex items-center gap-1"
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
