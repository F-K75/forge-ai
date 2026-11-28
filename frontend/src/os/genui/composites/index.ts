/** WS-B's own composites. Imported once by ../index.ts; WS-D registers the rest. */
import { registerComposite } from "../registry"
import { ExecutionTimeline } from "./ExecutionTimeline"

let registered = false

export function registerBuiltinComposites(): void {
  if (registered) return
  registered = true
  registerComposite("ExecutionTimeline", ExecutionTimeline)
}

export { ExecutionTimeline }
