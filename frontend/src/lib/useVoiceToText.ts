import { useState, useRef, useEffect, useCallback } from 'react';
import { transcribeAudioWithGemini } from './geminiPM';

// Standard definitions for browser SpeechRecognition
interface SpeechRecognitionResultItem {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionResultItem;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((event: Event) => void) | null;
  onend: ((event: Event) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
}

interface IWindowWithSpeech extends Window {
  SpeechRecognition?: { new (): SpeechRecognitionLike };
  webkitSpeechRecognition?: { new (): SpeechRecognitionLike };
}

export interface UseVoiceToTextOptions {
  onTranscriptChange?: (text: string, isFinal: boolean) => void;
  language?: string;
}

export interface UseVoiceToTextReturn {
  isListening: boolean;
  isTranscribing: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  audioLevel: number;
  audioBars: number[];
  isSupported: boolean;
  engine: 'native' | 'gemini' | 'unsupported';
  startListening: () => Promise<boolean>;
  stopListening: () => void;
  toggleListening: () => void;
  cancelListening: () => void;
  clearTranscript: () => void;
}

export function useVoiceToText({
  onTranscriptChange,
  language = 'en-US',
}: UseVoiceToTextOptions = {}): UseVoiceToTextReturn {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [audioBars, setAudioBars] = useState<number[]>([10, 15, 25, 15, 10]);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Check Web Speech API support
  const hasNativeSpeech =
    typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as IWindowWithSpeech).SpeechRecognition ||
        (window as unknown as IWindowWithSpeech).webkitSpeechRecognition
    );

  const hasMediaDevices =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  const engine: 'native' | 'gemini' | 'unsupported' = hasNativeSpeech
    ? 'native'
    : hasMediaDevices
    ? 'gemini'
    : 'unsupported';

  const isSupported = engine !== 'unsupported';

  // Real-time audio waveform visualizer loop
  const startAudioVisualizer = (stream: MediaStream) => {
    try {
      const AudioContextClass =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;

      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.5;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateMeter = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        // Compute overall volume
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / (bufferLength || 1);
        const normalizedVolume = Math.min(100, Math.round((avg / 128) * 100));
        setAudioLevel(normalizedVolume);

        // Compute 5 visual bands
        const step = Math.max(1, Math.floor(bufferLength / 5));
        const bars: number[] = [];
        for (let b = 0; b < 5; b++) {
          const idx = Math.min(bufferLength - 1, b * step);
          const val = Math.max(10, Math.min(100, Math.round((dataArray[idx] / 255) * 100)));
          bars.push(val);
        }
        setAudioBars(bars);

        animFrameRef.current = requestAnimationFrame(updateMeter);
      };

      animFrameRef.current = requestAnimationFrame(updateMeter);
    } catch (e) {
      console.warn('Audio visualizer could not be initialized:', e);
    }
  };

  const stopAudioVisualizer = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setAudioLevel(0);
    setAudioBars([10, 15, 25, 15, 10]);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      stopAudioVisualizer();
    };
  }, [stopAudioVisualizer]);

  // Start speech recognition
  const startListening = useCallback(async (): Promise<boolean> => {
    setError(null);
    setInterimTranscript('');

    // Request microphone stream first (handles permissions & audio visualizer)
    let micStream: MediaStream | null = null;
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = micStream;
        startAudioVisualizer(micStream);
      } catch (err: unknown) {
        const errorObj = err as { name?: string; message?: string };
        console.warn('Microphone permission denied or unavailable:', err);
        if (errorObj?.name === 'NotAllowedError' || errorObj?.name === 'PermissionDeniedError') {
          setError('Microphone access was denied. Please allow microphone permissions in your browser settings.');
        } else {
          setError('Could not access microphone. Please ensure an input device is connected.');
        }
        return false;
      }
    }

    if (engine === 'native') {
      const windowWithSpeech = window as unknown as IWindowWithSpeech;
      const SpeechRecognitionClass =
        windowWithSpeech.SpeechRecognition || windowWithSpeech.webkitSpeechRecognition;

      if (!SpeechRecognitionClass) {
        setError('Web Speech API is not supported in this browser.');
        stopAudioVisualizer();
        return false;
      }

      try {
        const recognition = new SpeechRecognitionClass();
        recognitionRef.current = recognition;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = language;

        recognition.onstart = () => {
          setIsListening(true);
        };

        recognition.onresult = (event: SpeechRecognitionEventLike) => {
          let liveInterim = '';
          let newlyFinal = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const res = event.results[i];
            const textChunk = res[0]?.transcript || '';
            if (res.isFinal) {
              newlyFinal += textChunk;
            } else {
              liveInterim += textChunk;
            }
          }

          setInterimTranscript(liveInterim);

          if (newlyFinal.trim()) {
            setTranscript((prev) => {
              const updated = prev ? `${prev} ${newlyFinal.trim()}` : newlyFinal.trim();
              if (onTranscriptChange) {
                onTranscriptChange(updated, true);
              }
              return updated;
            });
          } else if (liveInterim.trim() && onTranscriptChange) {
            onTranscriptChange(liveInterim.trim(), false);
          }
        };

        recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
          console.warn('Speech recognition error event:', event.error);
          if (event.error === 'not-allowed') {
            setError('Microphone permission denied.');
          } else if (event.error === 'no-speech') {
            // benign
          } else {
            setError(`Speech recognition notice: ${event.error}`);
          }
        };

        recognition.onend = () => {
          setIsListening(false);
          setInterimTranscript('');
          stopAudioVisualizer();
        };

        recognition.start();
        return true;
      } catch (err) {
        console.error('Failed to start SpeechRecognition:', err);
        setError('Failed to start speech recognition.');
        stopAudioVisualizer();
        return false;
      }
    } else if (engine === 'gemini' && micStream) {
      // Fallback: Use MediaRecorder to record audio chunks and transcribe with Gemini
      try {
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : 'audio/webm';

        const recorder = new MediaRecorder(micStream, { mimeType });
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        recorder.onstop = async () => {
          setIsListening(false);
          stopAudioVisualizer();

          if (audioChunksRef.current.length === 0) return;
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
          setIsTranscribing(true);

          try {
            // Convert Blob to base64
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = async () => {
              const base64Data = (reader.result as string) || '';
              try {
                const transcribed = await transcribeAudioWithGemini(base64Data, mimeType);
                if (transcribed) {
                  setTranscript((prev) => {
                    const combined = prev ? `${prev} ${transcribed}` : transcribed;
                    if (onTranscriptChange) onTranscriptChange(combined, true);
                    return combined;
                  });
                }
              } catch (e: unknown) {
                const errObj = e as { message?: string };
                setError(errObj?.message || 'Gemini audio transcription failed.');
              } finally {
                setIsTranscribing(false);
              }
            };
          } catch (e: unknown) {
            const errObj = e as { message?: string };
            setError(errObj?.message || 'Error processing recorded audio.');
            setIsTranscribing(false);
          }
        };

        recorder.start(500);
        setIsListening(true);
        return true;
      } catch (err: unknown) {
        const errObj = err as { message?: string };
        console.error('MediaRecorder initialization failed:', err);
        setError(errObj?.message || 'Failed to start voice recording.');
        stopAudioVisualizer();
        return false;
      }
    }

    return false;
  }, [engine, language, onTranscriptChange, stopAudioVisualizer]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      try {
        recognitionRef.current.stop();
      } catch {
        recognitionRef.current.abort();
      }
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.warn('Error stopping mediaRecorder:', e);
      }
    }
    setIsListening(false);
    stopAudioVisualizer();
  }, [isListening, stopAudioVisualizer]);

  const cancelListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    audioChunksRef.current = [];
    setIsListening(false);
    setInterimTranscript('');
    stopAudioVisualizer();
  }, [stopAudioVisualizer]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const clearTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    setError(null);
  }, []);

  return {
    isListening,
    isTranscribing,
    transcript,
    interimTranscript,
    error,
    audioLevel,
    audioBars,
    isSupported,
    engine,
    startListening,
    stopListening,
    toggleListening,
    cancelListening,
    clearTranscript,
  };
}
