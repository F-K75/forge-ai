/**
 * Ember-styled confirmation for destructive generated-surface actions (the
 * `confirm` hook WS-B's GenUIProvider calls instead of window.confirm).
 * `requestConfirm` resolves true only on an explicit click on the confirm
 * button; Escape, the backdrop and Cancel all resolve false. Focus starts on
 * Cancel (the safe choice) and returns to where it was.
 */
import { useEffect, useRef } from "react"
import { create } from "zustand"
import { AlertTriangle } from "lucide-react"
import type { ConfirmHook, ConfirmRequest } from "../genui"

interface Pending {
  request: ConfirmRequest
  resolve: (ok: boolean) => void
}

const useConfirmStore = create<{ pending: Pending | null }>()(() => ({ pending: null }))

/** Confirmations the user granted, waiting for their action POST (surface/component -> expiry). */
const granted = new Map<string, number>()
const GRANT_TTL_MS = 30_000

export const requestConfirm: ConfirmHook = (request) =>
  new Promise<boolean>((resolve) => {
    // A newer request replaces (and declines) an unanswered one.
    useConfirmStore.getState().pending?.resolve(false)
    useConfirmStore.setState({
      pending: {
        request,
        resolve: (ok) => {
          if (ok) granted.set(`${request.surfaceId}/${request.componentId}`, Date.now() + GRANT_TTL_MS)
          resolve(ok)
        },
      },
    })
  })

/**
 * One-shot: true if the user just confirmed this component's action. The
 * shell then sends `_confirmed: true` in the action context (WS-C rejects a
 * `requires_confirmation` action without it).
 */
export function consumeConfirmation(surfaceId: string, componentId: string): boolean {
  const key = `${surfaceId}/${componentId}`
  const until = granted.get(key)
  granted.delete(key)
  return until !== undefined && until >= Date.now()
}

function humanise(name: string): string {
  const last = name.split(".").pop() ?? name
  return last.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase())
}

export function ConfirmDialogHost() {
  const pending = useConfirmStore((s) => s.pending)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const restore = useRef<HTMLElement | null>(null)

  const settle = (ok: boolean) => {
    pending?.resolve(ok)
    useConfirmStore.setState({ pending: null })
    restore.current?.focus?.()
  }

  useEffect(() => {
    if (!pending) return
    restore.current = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        pending.resolve(false)
        useConfirmStore.setState({ pending: null })
        restore.current?.focus?.()
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [pending])

  if (!pending) return null
  const { request } = pending
  const action = request.label || humanise(request.actionName)
  const high = request.riskLevel === "high" || request.riskLevel === "critical"

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cancel"
        tabIndex={-1}
        className="absolute inset-0 bg-base/70 backdrop-blur-sm"
        onClick={() => settle(false)}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="os-confirm-title"
        aria-describedby="os-confirm-desc"
        className="relative w-full max-w-sm rounded-xl border border-border bg-panel p-5 shadow-brutal-xl animate-scale-in motion-reduce:animate-none"
        data-testid="os-confirm"
      >
        <div className="flex items-start gap-3">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${high ? "bg-error/[0.12] text-error" : "bg-warn/[0.12] text-warn"}`}>
            <AlertTriangle size={15} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="os-confirm-title" className="text-body font-medium text-ink">
              {action}?
            </h2>
            <p id="os-confirm-desc" className="mt-1 text-caption text-muted">
              This can't be undone automatically.
              {request.riskLevel ? <> Risk: <span className="text-ink">{request.riskLevel}</span>.</> : null}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => settle(false)}
            className="h-8 rounded-pill border border-glass-border bg-glass px-4 text-caption font-medium text-ink transition-colors hover:bg-ink/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => settle(true)}
            className={`h-8 rounded-pill px-4 text-caption font-medium transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel ${
              high ? "bg-error text-on-ink" : "bg-ink text-on-ink"
            }`}
          >
            {action}
          </button>
        </div>
      </div>
    </div>
  )
}
