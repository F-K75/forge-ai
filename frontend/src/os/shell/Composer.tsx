/**
 * The prompt composer: auto-growing text, attachments (uploaded first and
 * sent as AttachmentRefs), voice dictation (browser speech API via
 * useVoiceToText) and the model tier selector, all inside one field.
 * Enter sends, Shift+Enter adds a line, Escape stops a running answer.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowUp, Check, ChevronDown, FileText, Image as ImageIcon, Loader2, Mic, Paperclip, Square, X } from "lucide-react"
import type { AttachmentRef, ModelSelection } from "../contracts"
import { useVoiceToText } from "../../lib/useVoiceToText"
import { useAuthStore } from "../../store/authStore"
import { useUiStore } from "../../store/uiStore"
import { osBackend } from "./adapters"
import { modelSelection } from "./sessionController"
import type { ModelTier, OsModelOption } from "./sessionsApi"

const MAX_ATTACHMENTS = 10
const MAX_BYTES = 50 * 1024 * 1024

const TIERS: { id: ModelTier; label: string; hint: string }[] = [
  { id: "auto", label: "Auto", hint: "Forge picks per prompt" },
  { id: "fast", label: "Fast", hint: "Quick answers, lowest cost" },
  { id: "balanced", label: "Balanced", hint: "Everyday work" },
  { id: "best", label: "Best", hint: "Hard problems, highest quality" },
]

interface PendingAttachment {
  key: string
  name: string
  mime: string
  ref: AttachmentRef | null
  error?: string
}

export interface ComposerSubmit {
  prompt: string
  attachments: AttachmentRef[]
  model: ModelSelection
}

export interface ComposerHandle {
  focus: () => void
  setText: (text: string) => void
}

export interface ComposerProps {
  variant: "center" | "docked"
  running?: boolean
  onSubmit: (input: ComposerSubmit) => void
  onStop?: () => void
}

function ModelMenu({
  tier,
  pinned,
  onTier,
  onPinned,
}: {
  tier: ModelTier
  pinned: OsModelOption | null
  onTier: (t: ModelTier) => void
  onPinned: (m: OsModelOption | null) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const plan = useAuthStore((s) => s.user?.plan)
  const byok = useAuthStore((s) => s.user?.byok_connected === true)
  const canPin = plan === "pro" || plan === "enterprise" || byok
  const { data: models = [] } = useQuery({
    queryKey: ["os", "models"],
    queryFn: () => osBackend.listModels(),
    enabled: open && canPin,
    staleTime: 5 * 60_000,
  })

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    window.addEventListener("pointerdown", onDown)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("pointerdown", onDown)
      window.removeEventListener("keydown", onKey)
    }
  }, [open])

  const label = pinned ? pinned.label : TIERS.find((t) => t.id === tier)?.label ?? "Auto"
  const item =
    "flex w-full items-start gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-ink/[0.06] focus-visible:bg-ink/[0.06] focus-visible:outline-none"
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Model: ${label}`}
        className="flex h-8 items-center gap-1 rounded-pill px-2.5 text-caption text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span>{label}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Model"
          className="absolute bottom-10 right-0 z-50 w-64 rounded-lg border border-border bg-panel p-1 shadow-brutal-lg animate-scale-in motion-reduce:animate-none"
        >
          <p className="px-2.5 pb-1 pt-1.5 text-2xs font-medium text-faint">Model tier</p>
          {TIERS.map((t) => {
            const selected = !pinned && t.id === tier
            return (
              <button
                key={t.id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className={item}
                onClick={() => {
                  onPinned(null)
                  onTier(t.id)
                  setOpen(false)
                }}
              >
                <span className="mt-0.5 w-3.5 shrink-0 text-ink">{selected && <Check size={13} aria-hidden="true" />}</span>
                <span>
                  <span className="block text-caption text-ink">{t.label}</span>
                  <span className="block text-xs font-normal text-muted">{t.hint}</span>
                </span>
              </button>
            )
          })}
          {canPin && models.length > 0 && (
            <>
              <div className="my-1 border-t border-border-soft" />
              <p className="px-2.5 pb-1 pt-1.5 text-2xs font-medium text-faint">Pin a model</p>
              {models.map((m) => {
                const selected = pinned?.model === m.model && pinned.provider === m.provider
                return (
                  <button
                    key={`${m.provider}/${m.model}`}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    className={item}
                    onClick={() => {
                      onPinned(m)
                      setOpen(false)
                    }}
                  >
                    <span className="mt-0.5 w-3.5 shrink-0 text-ink">{selected && <Check size={13} aria-hidden="true" />}</span>
                    <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                      <span className="truncate text-caption text-ink">{m.label}</span>
                      <span className="shrink-0 text-xs font-normal text-faint">{m.provider}</span>
                    </span>
                  </button>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { variant, running = false, onSubmit, onStop },
  ref,
) {
  const [text, setText] = useState("")
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const tier = useUiStore((s) => s.modelTier)
  const setTier = useUiStore((s) => s.setModelTier)
  const [pinned, setPinned] = useState<OsModelOption | null>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const voiceBase = useRef("")
  const composing = useRef(false)

  useImperativeHandle(ref, () => ({
    focus: () => taRef.current?.focus(),
    setText: (t: string) => {
      setText(t)
      requestAnimationFrame(() => taRef.current?.focus())
    },
  }))

  const onTranscriptChange = useCallback((t: string, isFinal: boolean) => {
    if (!isFinal) return
    const base = voiceBase.current
    setText(base ? `${base} ${t}` : t)
  }, [])
  const voice = useVoiceToText({ onTranscriptChange })

  // Auto-grow.
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = "0px"
    ta.style.height = `${Math.min(ta.scrollHeight, variant === "center" ? 240 : 200)}px`
  }, [text, variant])

  const uploading = attachments.some((a) => !a.ref && !a.error)
  const canSend = text.trim().length > 0 && !uploading && !running

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).slice(0, MAX_ATTACHMENTS - attachments.length)
    for (const file of list) {
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`
      if (file.size > MAX_BYTES) {
        setAttachments((a) => [...a, { key, name: file.name, mime: file.type, ref: null, error: "Over 50 MB" }])
        continue
      }
      setAttachments((a) => [...a, { key, name: file.name, mime: file.type, ref: null }])
      try {
        const refd = await osBackend.uploadAttachment(file)
        setAttachments((a) => a.map((x) => (x.key === key ? { ...x, ref: refd } : x)))
      } catch {
        setAttachments((a) => a.map((x) => (x.key === key ? { ...x, error: "Upload failed" } : x)))
      }
    }
  }

  const submit = () => {
    if (!canSend) return
    if (voice.isListening) voice.stopListening()
    onSubmit({
      prompt: text.trim(),
      attachments: attachments.map((a) => a.ref).filter((r): r is AttachmentRef => Boolean(r)),
      model: modelSelection(tier, pinned ? { provider: pinned.provider, model: pinned.model } : null),
    })
    setText("")
    setAttachments([])
  }

  const toolBtn =
    "flex h-8 w-8 items-center justify-center rounded-pill text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault()
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return
        e.preventDefault()
        void addFiles(e.dataTransfer.files)
      }}
      aria-label="Prompt"
      data-testid="os-composer"
      data-variant={variant}
      className={`group/composer relative w-full rounded-2xl border bg-panel transition-[border-color,box-shadow] duration-fast focus-within:border-ink/25 ${
        variant === "center" ? "border-border shadow-brutal-lg" : "border-border shadow-brutal-md"
      }`}
    >
      {attachments.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 px-3 pt-3" aria-label="Attachments">
          {attachments.map((a) => {
            const Icon = a.mime.startsWith("image/") ? ImageIcon : FileText
            return (
              <li
                key={a.key}
                className={`flex h-7 max-w-[220px] items-center gap-1.5 rounded-pill border pl-2.5 pr-1 text-xs ${
                  a.error ? "border-error/40 text-error" : "border-border-soft bg-ink/[0.04] text-ink"
                }`}
              >
                {!a.ref && !a.error ? (
                  <Loader2 size={11} className="shrink-0 animate-spin motion-reduce:animate-none" aria-label="Uploading" />
                ) : (
                  <Icon size={11} className="shrink-0 text-muted" aria-hidden="true" />
                )}
                <span className="truncate">{a.name}</span>
                {a.error && <span className="shrink-0">· {a.error}</span>}
                <button
                  type="button"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => setAttachments((list) => list.filter((x) => x.key !== a.key))}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-faint hover:bg-ink/[0.08] hover:text-ink"
                >
                  <X size={10} aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <label htmlFor="os-prompt" className="sr-only">
        Message Forge
      </label>
      <textarea
        id="os-prompt"
        ref={taRef}
        value={text}
        rows={1}
        maxLength={16_000}
        onChange={(e) => setText(e.target.value)}
        onCompositionStart={() => (composing.current = true)}
        onCompositionEnd={() => (composing.current = false)}
        onPaste={(e) => {
          if (e.clipboardData.files.length) {
            e.preventDefault()
            void addFiles(e.clipboardData.files)
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !composing.current && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          } else if (e.key === "Escape" && running) {
            onStop?.()
          }
        }}
        placeholder={variant === "center" ? "Ask anything, or describe what to build" : "Reply, or ask for something new"}
        className={`block w-full resize-none bg-transparent px-4 text-body text-ink placeholder:text-faint focus:outline-none ${
          variant === "center" ? "min-h-[64px] pt-4" : "min-h-[44px] pt-3"
        }`}
      />
      {voice.isListening && voice.interimTranscript && (
        <p className="px-4 pb-1 text-caption text-faint" aria-live="polite">
          {voice.interimTranscript}
        </p>
      )}

      <div className="flex items-center gap-1 px-2 pb-2 pt-1">
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files)
            e.target.value = ""
          }}
        />
        <button
          type="button"
          className={toolBtn}
          onClick={() => fileRef.current?.click()}
          disabled={attachments.length >= MAX_ATTACHMENTS}
          aria-label="Attach files"
          title="Attach files"
        >
          <Paperclip size={15} aria-hidden="true" />
        </button>
        {voice.isSupported && (
          <button
            type="button"
            className={`${toolBtn} ${voice.isListening ? "bg-accent/[0.12] text-accent hover:bg-accent/20 hover:text-accent" : ""}`}
            onClick={() => {
              if (!voice.isListening) voiceBase.current = text.trim()
              voice.toggleListening()
            }}
            aria-pressed={voice.isListening}
            aria-label={voice.isListening ? "Stop dictation" : "Dictate"}
            title={voice.isListening ? "Stop dictation" : "Dictate"}
          >
            <Mic size={15} aria-hidden="true" />
          </button>
        )}
        <div className="flex-1" />
        <ModelMenu tier={tier} pinned={pinned} onTier={setTier} onPinned={setPinned} />
        {running ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop"
            title="Stop (Esc)"
            className="flex h-8 w-8 items-center justify-center rounded-pill bg-ink text-on-ink transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
          >
            <Square size={11} fill="currentColor" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send"
            title="Send (Enter)"
            className="flex h-8 w-8 items-center justify-center rounded-pill bg-ink text-on-ink transition-[opacity,transform] duration-fast hover:opacity-90 active:scale-95 disabled:bg-ink/[0.12] disabled:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
          >
            <ArrowUp size={15} strokeWidth={2.25} aria-hidden="true" />
          </button>
        )}
      </div>
      {voice.error && <p className="px-4 pb-2 text-xs text-error">{voice.error}</p>}
    </form>
  )
})
