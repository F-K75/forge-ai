/**
 * What the user sees instead of a generated surface that could not be shown
 * (validation failure, render crash, missing root, unregistered composite):
 * a calm note, any text we could still extract, and a way into the capability.
 * Validation details are logged, never rendered.
 */
import clsx from "clsx"
import { FileWarning } from "lucide-react"
import { Button } from "../../components/ui/Button"

export interface TextFallbackProps {
  /** Readable text recovered from the surface, if any (see surfaceToText). */
  text?: string | null
  title?: string | null
  capabilityId?: string | null
  onOpenCapability?: (capabilityId: string) => void
  /** Smaller variant used for one failed component inside a working surface. */
  inline?: boolean
  message?: string
}

export const FALLBACK_MESSAGE = "I couldn't display this result."

export function TextFallback({ text, title, capabilityId, onOpenCapability, inline, message }: TextFallbackProps) {
  if (inline) {
    return (
      <p role="note" className="rounded-lg border border-border-soft bg-ink/[0.03] px-3 py-2 text-caption text-muted">
        {message ?? "This part of the result couldn't be displayed."}
      </p>
    )
  }
  return (
    <div
      role="note"
      aria-label={title ? `${title}: ${FALLBACK_MESSAGE}` : FALLBACK_MESSAGE}
      className={clsx("flex flex-col gap-3 rounded-xl border border-border bg-panel p-4")}
      data-genui-fallback=""
    >
      <div className="flex items-start gap-2">
        <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
        <p className="text-body text-ink">{message ?? FALLBACK_MESSAGE}</p>
      </div>
      {text && <p className="whitespace-pre-wrap break-words text-caption text-muted">{text}</p>}
      {capabilityId && onOpenCapability && (
        <Button variant="secondary" size="sm" className="w-fit" onClick={() => onOpenCapability(capabilityId)}>
          Open {title || capabilityId}
        </Button>
      )}
    </div>
  )
}
