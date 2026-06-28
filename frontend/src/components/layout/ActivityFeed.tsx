import { motion } from 'framer-motion'
import { CheckCircle2, Cpu, Sparkles } from 'lucide-react'
import { useBuildStore } from '../../store/buildStore'
import type { FC } from 'react'

type ActivityState = 'complete' | 'running' | 'pending'

type ActivityItem = { label: string; key: string; stage: 'architect' | 'designer' | 'developer' | 'integration' | 'pm' }

const STAGES: ActivityItem[] = [
  { key: 'architect', label: 'Planning architecture', stage: 'architect' },
  { key: 'designer', label: 'Designing UI/UX', stage: 'designer' },
  { key: 'developer', label: 'Generating React components', stage: 'developer' },
  { key: 'integration', label: 'Wiring APIs & services', stage: 'integration' },
  { key: 'pm', label: 'Validating requirements', stage: 'pm' },
]

function getAgentState(agents: { type: string; status: string }[], stage: ActivityItem['stage']): ActivityState {
  const agent = agents.find(a => a.type === stage)
  if (!agent) return 'pending'
  if (agent.status === 'running') return 'running'
  if (agent.status === 'complete') return 'complete'
  if (agent.status === 'failed') return 'pending'
  return 'pending'
}

export const ActivityFeed: FC = () => {
  const { status, agents } = useBuildStore()

  return (
    <div className="rounded-xl border border-forge-border bg-forge-surface p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs uppercase tracking-wider text-forge-text-secondary">AI Activity</h3>
        <span className={`text-xs px-2 py-1 rounded-md ${status === 'running' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-forge-border/30 text-forge-text-secondary'}`}>
          {status === 'running' ? 'Running' : 'Waiting'}
        </span>
      </div>

      <div className="space-y-2">
        {STAGES.map((item, index) => {
          const itemState = getAgentState(agents, item.stage)
          const isRunning = itemState === 'running'
          const isPending = itemState === 'pending'

          const rightText = isRunning ? 'Updating' : isPending ? 'Queued' : 'Done'
          const rightTone = isRunning ? 'text-violet-300' : isPending ? 'text-forge-text-secondary' : 'text-emerald-300'

          return (
            <motion.div
              key={item.key}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="flex items-center justify-between rounded-lg border border-forge-border bg-forge-bg px-3 py-2"
            >
              <div className="flex items-center gap-2">
                {isRunning ? (
                  <Cpu size={14} className="text-violet-300" />
                ) : (
                  <CheckCircle2 size={14} className={isPending ? 'text-forge-text-secondary' : 'text-emerald-300'} />
                )}
                <span className="text-sm text-forge-text">{item.label}</span>
              </div>
              <span className={`text-xs ${rightTone}`}>{rightText}</span>
            </motion.div>
          )
        })}
      </div>

      <div className="mt-4 rounded-lg border border-forge-border bg-forge-bg p-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-forge-text-secondary mb-2">
          <Sparkles size={12} />
          Agent status
        </div>
        <div className="flex flex-wrap gap-2">
          {agents.map(agent => (
            <span key={agent.type} className="rounded-full border border-forge-border bg-forge-border/30 px-2 py-0.5 text-xs text-forge-text-secondary">
              {agent.type}: {agent.status}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ActivityFeed() {
  const { status, agents } = useBuildStore()


  return (
    <div className="rounded-[24px] border border-forge-border/80 bg-forge-surface/70 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-forge-text-secondary">AI activity</p>
          <h3 className="mt-1 text-base font-semibold text-forge-text">Live reasoning</h3>
        </div>
        <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
          {status === 'running' ? 'Active' : 'Idle'}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {STAGES.map((item, index) => {
          const itemState = getAgentState(agents, item.stage)
          const isRunning = itemState === 'running'
          const isPending = itemState === 'pending'

          const rightText = isRunning ? 'Updating' : isPending ? 'Queued' : 'Done'
          const RightTone = isRunning ? 'text-violet-300' : isPending ? 'text-forge-text-secondary' : 'text-emerald-300'

          return (
            <motion.div
              key={item.key}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="flex items-center justify-between rounded-2xl border border-forge-border/70 bg-forge-bg/70 px-3 py-2.5"
            >
              <div className="flex items-center gap-2">
                {isRunning ? (
                  <Cpu size={14} className="text-violet-300" />
                ) : (
                  <CheckCircle2 size={14} className={isPending ? 'text-forge-muted' : 'text-emerald-300'} />
                )}
                <span className="text-sm text-forge-text">{item.label}</span>
              </div>
              <span className={`text-[11px] ${RightTone}`}>{rightText}</span>
            </motion.div>
          )
        })}
      </div>


      <div className="mt-4 rounded-2xl border border-forge-border/70 bg-forge-bg/70 p-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-forge-text-secondary">
          <Sparkles size={12} />
          Agent status
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {agents.map(agent => (
            <span key={agent.type} className="rounded-full border border-forge-border bg-forge-surface/80 px-2.5 py-1 text-[11px] text-forge-text-secondary">
              {agent.type}: {agent.status}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
