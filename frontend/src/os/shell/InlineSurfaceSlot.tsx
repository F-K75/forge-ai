/**
 * An inline generated surface in the conversation (approval cards, small
 * summaries). It can be popped out into a window without losing its state:
 * both views read the same surface from the store.
 */
import { useCallback } from "react"
import { PictureInPicture2 } from "lucide-react"
import type { OsId } from "../contracts"
import { SurfaceView } from "./adapters"
import { dispatchSurfaceAction } from "./sessionController"
import { useWindowStore } from "./windowStore"

export function InlineSurfaceSlot({ surfaceId, sessionId, title }: { surfaceId: OsId; sessionId: OsId | null; title?: string }) {
  const open = useWindowStore((s) => s.open)
  const onAction = useCallback(
    (action: Parameters<typeof dispatchSurfaceAction>[1], source: string) => dispatchSurfaceAction(surfaceId, action, source),
    [surfaceId],
  )
  return (
    <div className="group relative mt-3" data-inline-surface={surfaceId}>
      <SurfaceView surfaceId={surfaceId} onAction={onAction} />
      <button
        type="button"
        onClick={() =>
          open({
            kind: "surface",
            surface_id: surfaceId,
            title: title ?? "Result",
            presentation: "window",
            session_id: sessionId,
            size_hint: "compact",
          })
        }
        aria-label="Open in a window"
        title="Open in a window"
        className="absolute -right-9 top-1 hidden h-7 w-7 items-center justify-center rounded-md text-faint transition-colors hover:bg-ink/[0.06] hover:text-ink focus-visible:flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent group-hover:flex"
      >
        <PictureInPicture2 size={13} aria-hidden="true" />
      </button>
    </div>
  )
}
