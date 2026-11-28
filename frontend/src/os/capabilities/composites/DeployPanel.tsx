import type { CompositeComponentProps } from "../../contracts"
import { LiveDeploySurface } from "../../../components/forge-os/live/LiveDeploySurface"
import { useProjectBuild } from "../useProjectBuild"

export interface DeployPanelProps {
  projectId: string
  buildId?: string
  [key: string]: unknown
}

/** The project's deployments and "deploy the latest build", via the existing deploy surface. */
export function DeployPanelView({ projectId, buildId }: { projectId: string | null; buildId?: string | null }) {
  const { build, status } = useProjectBuild(projectId, buildId)
  return (
    <div className="h-full min-h-[240px]" data-testid="os-deploy-panel">
      <LiveDeploySurface projectId={projectId} buildId={build?.id ?? buildId ?? null} buildStatus={status} />
    </div>
  )
}

export default function DeployPanel({ props }: CompositeComponentProps<DeployPanelProps>) {
  return <DeployPanelView projectId={props.projectId} buildId={props.buildId ?? null} />
}
