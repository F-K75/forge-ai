import type { CompositeComponentProps } from "../../contracts"
import { LivePreviewSurface } from "../../../components/forge-os/live/LivePreviewSurface"
import { useProjectBuild } from "../useProjectBuild"

export interface LivePreviewProps {
  projectId: string
  buildId?: string
  [key: string]: unknown
}

/** The build's generated front end in the existing sandboxed preview (forge-os/live). */
export function LivePreviewView({ projectId, buildId }: { projectId: string | null; buildId?: string | null }) {
  const { files, hasBuild, inProgress } = useProjectBuild(projectId, buildId)
  return (
    <div className="h-full min-h-[320px]" data-testid="os-live-preview">
      <LivePreviewSurface files={files} hasBuild={hasBuild} buildInProgress={inProgress} />
    </div>
  )
}

export default function LivePreview({ props }: CompositeComponentProps<LivePreviewProps>) {
  return <LivePreviewView projectId={props.projectId} buildId={props.buildId ?? null} />
}
