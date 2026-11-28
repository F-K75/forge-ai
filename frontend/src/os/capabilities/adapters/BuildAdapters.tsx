import { lazy, Suspense } from "react"
import type { CapabilityRendererProps } from "../../contracts"
import { LiveQaSurface, type QaValidation } from "../../../components/forge-os/live/LiveQaSurface"
import { NoProjectState } from "../../../components/capabilities/ProjectScope"
import { LivePreviewView } from "../composites/LivePreview"
import { DeployPanelView } from "../composites/DeployPanel"
import { useProjectBuild } from "../useProjectBuild"
import { paramString } from "./params"

// Monaco is heavy; load the code surface only when the code view opens.
const ForgeCodeSurface = lazy(() =>
  import("../../../components/forge-os/ForgeCodeSurface").then((m) => ({ default: m.ForgeCodeSurface }))
)

function projectOf(props: CapabilityRendererProps): string | null {
  return props.projectId ?? paramString(props.params, "project_id")
}

export function BuildPreviewRenderer(props: CapabilityRendererProps) {
  const projectId = projectOf(props)
  if (!projectId) return <NoProjectState what="Live previews" />
  return <LivePreviewView projectId={projectId} buildId={paramString(props.params, "build_id")} />
}

export function BuildDeployRenderer(props: CapabilityRendererProps) {
  const projectId = projectOf(props)
  if (!projectId) return <NoProjectState what="Deployments" />
  return <DeployPanelView projectId={projectId} buildId={paramString(props.params, "build_id")} />
}

export function BuildCodeRenderer(props: CapabilityRendererProps) {
  const projectId = projectOf(props)
  const { files, hasBuild, isLoading } = useProjectBuild(projectId, paramString(props.params, "build_id"))
  if (!projectId && !paramString(props.params, "build_id")) return <NoProjectState what="Code views" />
  if (!isLoading && !hasBuild) {
    return <p className="p-6 text-center text-sm text-muted">This project has no build yet, so there is no code to show.</p>
  }
  return (
    <Suspense fallback={<p className="p-6 text-center text-xs text-muted">Loading code…</p>}>
      <div className="h-full min-h-[360px]">
        <ForgeCodeSurface files={files} initialFile={paramString(props.params, "path") ?? undefined} />
      </div>
    </Suspense>
  )
}

export function BuildDebugRenderer(props: CapabilityRendererProps) {
  const projectId = projectOf(props)
  const { build, hasBuild, status } = useProjectBuild(projectId, paramString(props.params, "build_id"))
  if (!projectId && !paramString(props.params, "build_id")) return <NoProjectState what="Debug consoles" />
  const validation = build && typeof build.validation === "object" ? (build.validation as QaValidation) : null
  return (
    <LiveQaSurface
      buildStatus={status}
      hasBuild={hasBuild}
      validation={validation}
      debugIterations={typeof build?.debug_iterations === "number" ? build.debug_iterations : 0}
      debugErrors={Array.isArray(build?.debug_errors) ? build!.debug_errors.filter((e): e is string => typeof e === "string") : []}
    />
  )
}
