import { useNavigate } from "react-router-dom"
import { ArrowUpRight } from "lucide-react"
import type { CompositeComponentProps, JsonObject } from "../../contracts"
import { fillRoute, getStaticCapability } from "../catalog"
import { useCapabilityLaunch } from "./launch"

export interface CapabilityLauncherProps {
  capabilityId: string
  label: string
  params?: JsonObject
  [key: string]: unknown
}

export function CapabilityLauncherButton({ capabilityId, label, params }: CapabilityLauncherProps) {
  const launch = useCapabilityLaunch()
  const navigate = useNavigate()
  const capability = getStaticCapability(capabilityId)
  const route =
    capability?.legacy_routes
      .map((r) => fillRoute(r, params ?? {}))
      .find((r): r is string => Boolean(r)) ?? null
  const available = Boolean(capability) && (Boolean(launch) || Boolean(route))
  const onClick = () => {
    if (launch) launch(capabilityId, params ?? {})
    else if (route) navigate(route)
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!available}
      title={capability?.summary}
      className="inline-flex items-center gap-2 rounded-pill border border-border bg-panel-alt px-3.5 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span>{label}</span>
      <ArrowUpRight size={12} aria-hidden="true" className="text-muted" />
    </button>
  )
}

export default function CapabilityLauncher({ props }: CompositeComponentProps<CapabilityLauncherProps>) {
  return <CapabilityLauncherButton {...props} />
}
