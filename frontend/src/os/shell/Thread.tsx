/**
 * The conversation: user prompts, streamed answers, inline surfaces and
 * chips for surfaces placed elsewhere (click to bring them back). Streaming
 * text is not announced per token; a polite live region announces each
 * finished answer once.
 */
import { useEffect, useMemo, useRef } from "react"
import { AppWindow, FileText, Maximize, PanelRight } from "lucide-react"
import type { OsId } from "../contracts"
import { InlineSurfaceSlot } from "./InlineSurfaceSlot"
import { placeSurface } from "./sessionController"
import { friendlyError, type PlacementChip, type SessionThread, type ThreadMessage } from "./sessionStore"

const PRESENTATION_ICON = { panel: PanelRight, window: AppWindow, fullscreen: Maximize, inline: AppWindow } as const

function Chip({ chip, sessionId }: { chip: PlacementChip; sessionId: OsId | null }) {
  const Icon = PRESENTATION_ICON[chip.presentation]
  return (
    <button
      type="button"
      onClick={() =>
        placeSurface(
          { surface_id: chip.surface_id, presentation: chip.presentation, title: chip.title, capability_id: chip.capability_id, focus: true },
          sessionId,
        )
      }
      className="flex h-7 items-center gap-1.5 rounded-pill border border-border-soft bg-ink/[0.03] px-2.5 text-xs text-muted transition-colors hover:bg-ink/[0.07] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <Icon size={11} aria-hidden="true" />
      <span className="max-w-[220px] truncate">{chip.title}</span>
    </button>
  )
}

function Message({ m, sessionId }: { m: ThreadMessage; sessionId: OsId | null }) {
  if (m.role === "user") {
    return (
      <li className="flex flex-col items-end gap-1.5" data-role="user">
        {m.attachments.length > 0 && (
          <ul className="flex flex-wrap justify-end gap-1.5">
            {m.attachments.map((a) => (
              <li key={a.id} className="flex h-6 items-center gap-1.5 rounded-pill bg-ink/[0.05] px-2.5 text-xs text-muted">
                <FileText size={11} aria-hidden="true" />
                <span className="max-w-[180px] truncate">{a.name}</span>
              </li>
            ))}
          </ul>
        )}
        <p
          className={`max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink/[0.07] px-4 py-2.5 text-body text-ink ${
            m.pending ? "opacity-70" : ""
          }`}
        >
          {m.text}
        </p>
        {m.error && <p className="text-xs text-error">{m.error.message}</p>}
      </li>
    )
  }
  if (m.role === "system") {
    return (
      <li className="text-center text-xs text-faint" data-role="system">
        {m.text}
      </li>
    )
  }
  const thinking = m.streaming && !m.text && !m.surface_ids.length && !m.placements.length
  return (
    <li className="flex flex-col" data-role="assistant">
      {thinking && <ThinkingDots />}
      {m.text && (
        <p className="whitespace-pre-wrap text-body text-ink">
          {m.text}
          {m.streaming && <span aria-hidden="true" className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-ink/50 motion-reduce:animate-none" />}
        </p>
      )}
      {m.surface_ids.map((id) => (
        <InlineSurfaceSlot key={id} surfaceId={id} sessionId={sessionId} />
      ))}
      {m.placements.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Opened views">
          {m.placements.map((c) => (
            <Chip key={c.surface_id} chip={c} sessionId={sessionId} />
          ))}
        </div>
      )}
      {m.error && (
        <p role="alert" className="mt-1 text-caption text-error">
          {friendlyError(m.error)}
        </p>
      )}
      {m.cancelled && <p className="mt-1 text-xs text-faint">Stopped.</p>}
    </li>
  )
}

function ThinkingDots() {
  return (
    <span className="flex h-6 items-center gap-1" role="status" aria-label="Thinking">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink/40 motion-reduce:animate-none"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </span>
  )
}

export function Thread({ thread, sessionId }: { thread: SessionThread; sessionId: OsId | null }) {
  const endRef = useRef<HTMLDivElement>(null)
  const lastText = thread.messages[thread.messages.length - 1]?.text
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" })
  }, [thread.messages.length, lastText])

  const waiting =
    thread.runningTurnId !== null &&
    !thread.messages.some((m) => m.role === "assistant" && m.turn_id === thread.runningTurnId)
  const announcement = useMemo(() => {
    for (let i = thread.messages.length - 1; i >= 0; i--) {
      const m = thread.messages[i]!
      if (m.role === "assistant" && !m.streaming && m.text) return m.text
    }
    return ""
  }, [thread.messages])

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-6 pt-8 sm:px-6">
      <ol className="flex flex-col gap-6" aria-label="Conversation" data-testid="os-thread">
        {thread.messages.map((m) => (
          <Message key={m.id} m={m} sessionId={sessionId} />
        ))}
        {waiting && (
          <li data-role="assistant">
            <ThinkingDots />
          </li>
        )}
      </ol>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <div ref={endRef} />
    </div>
  )
}
