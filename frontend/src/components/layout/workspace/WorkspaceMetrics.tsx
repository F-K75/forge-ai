import { useMemo, type FC } from 'react'
import { Cpu, Boxes, Sparkles, Activity, CreditCard } from 'lucide-react'
import type { AgentState } from '../../../store/buildStore'
import { MetricCard } from '../MetricCard'

type BuildStatus = 'idle' | 'pending' | 'running' | 'success' | 'failed' | 'debugging'

interface WorkspaceMetricsProps {
  agents: AgentState[]
  fileCount: number
  creditsUsed: number
  validation: { missing_features?: string[] } | null
  status: BuildStatus
}

export const WorkspaceMetrics: FC<WorkspaceMetricsProps> = ({ agents, fileCount, creditsUsed, validation, status }) => {
  const activeAgents = useMemo(() => agents.filter(agent => agent.status === 'running').length, [agents])

  const metrics = useMemo(() => [
    { label: 'Agents', value: activeAgents, icon: Cpu, tone: 'info' as const },
    { label: 'Files Changed', value: fileCount, icon: Boxes, tone: 'success' as const },
    { label: 'Tokens Used', value: creditsUsed.toLocaleString(), icon: Sparkles, tone: 'neutral' as const },
    { label: 'Errors', value: validation?.missing_features?.length ?? 0, icon: Activity, tone: 'danger' as const },
    { label: 'Credits', value: creditsUsed, icon: CreditCard, tone: 'warning' as const },
  ], [activeAgents, fileCount, creditsUsed, validation])

  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" aria-busy={status === 'running'}>
      {metrics.map(metric => (
        <MetricCard
          key={metric.label}
          label={metric.label}
          value={metric.value}
          icon={metric.icon}
          tone={metric.tone}
        />
      ))}
    </div>
  )
}