import { Badge, type BadgeVariant } from "../ui"
import { A2A_TERMINAL } from "../../lib/protocolsData"

const OUTCOME: Record<string, BadgeVariant> = {
  succeeded: "success",
  denied: "warning",
  rejected: "outlined",
  error: "error",
}

/** Audit outcome pill: succeeded / denied / rejected / error. */
export function OutcomePill({ outcome }: { outcome: string }) {
  return (
    <Badge size="sm" variant={OUTCOME[outcome] ?? "default"} className="capitalize">
      {outcome}
    </Badge>
  )
}

const A2A_STATE: Record<string, BadgeVariant> = {
  submitted: "default",
  working: "accent",
  "input-required": "warning",
  completed: "success",
  canceled: "outlined",
  failed: "error",
}

/** A2A task state pill; live (non-terminal) states carry a dot. */
export function A2AStatePill({ state }: { state: string }) {
  return (
    <Badge size="sm" variant={A2A_STATE[state] ?? "default"} dot={!A2A_TERMINAL.has(state)} className="capitalize">
      {state.replace("-", " ")}
    </Badge>
  )
}

const GATE: Record<string, BadgeVariant> = { pending: "warning", approved: "success", rejected: "error" }

export function GateStatusPill({ status }: { status: string }) {
  return (
    <Badge size="sm" variant={GATE[status] ?? "default"} dot={status === "pending"} className="capitalize">
      {status}
    </Badge>
  )
}
