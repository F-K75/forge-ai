/**
 * When windows cover the conversation, the latest text or inline answer
 * floats just above the composer so a reply is never hidden behind a window.
 * Dismissible; "Show conversation" minimises the windows.
 */
import { useRef, useState } from "react"
import { MessageSquare, X } from "lucide-react"
import type { OsId } from "../contracts"
import { InlineSurfaceSlot } from "./InlineSurfaceSlot"
import { friendlyError, type SessionThread } from "./sessionStore"
import { useWindowStore } from "./windowStore"

export function ReplyPeek({ thread, sessionId }: { thread: SessionThread; sessionId: OsId | null }) {
  const minimizeAll = useWindowStore((s) => s.minimizeAll)
  const last = [...thread.messages].reverse().find((m) => m.role === "assistant")
  // Mounted when windows appear: only replies that arrive after that peek.
  // (A restored session's history counts as already seen once it has loaded.)
  const baseline = useRef<string | null | undefined>(thread.loaded ? (last?.id ?? null) : undefined)
  if (baseline.current === undefined && thread.loaded) baseline.current = last?.id ?? null
  const [dismissed, setDismissed] = useState<string | null>(null)
  if (!last || baseline.current === undefined || last.id === dismissed || last.id === baseline.current) return null
  // A turn that opened a window answered there.
  if (last.placements.length > 0) return null
  if (!last.text && !last.surface_ids.length && !last.error) return null

  return (
    <section
      aria-label="Latest reply"
      data-testid="os-reply-peek"
      className="absolute inset-x-3 bottom-full mb-2 max-h-[42vh] overflow-y-auto rounded-xl border border-border bg-panel/95 p-4 shadow-brutal-lg backdrop-blur-md animate-fade-in-up motion-reduce:animate-none sm:inset-x-6"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-2xs font-medium uppercase tracking-wider text-faint">Forge</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={minimizeAll}
            className="flex h-6 items-center gap-1.5 rounded-pill px-2 text-xs text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <MessageSquare size={11} aria-hidden="true" /> Show conversation
          </button>
          <button
            type="button"
            onClick={() => setDismissed(last.id)}
            aria-label="Dismiss reply"
            className="flex h-6 w-6 items-center justify-center rounded-md text-faint transition-colors hover:bg-ink/[0.06] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X size={12} aria-hidden="true" />
          </button>
        </div>
      </div>
      {last.text && <p className="whitespace-pre-wrap text-body text-ink">{last.text}</p>}
      {last.surface_ids.map((id) => (
        <InlineSurfaceSlot key={id} surfaceId={id} sessionId={sessionId} />
      ))}
      {last.error && <p className="text-caption text-error">{friendlyError(last.error)}</p>}
    </section>
  )
}
