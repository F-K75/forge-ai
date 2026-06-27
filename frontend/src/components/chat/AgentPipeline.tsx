import { motion } from 'framer-motion'
import { CheckCircle2, Circle, Loader2, XCircle, AlertCircle } from 'lucide-react'
import { useBuildStore, AgentState } from '../../store/buildStore'
import clsx from 'clsx'

const AGENT_META: Record<string, { label: string; emoji: string; desc: string }> = {
  architect: {
    label: 'Architect',
    emoji: '🏗️',
    desc: 'Analyzing requirements & creating blueprint',
  },
  designer: {
    label: 'Designer',
    emoji: '🎨',
    desc: 'Building UI/UX design system',
  },
  developer: {
    label: 'Developer',
    emoji: '⚡',
    desc: 'Writing frontend & backend code',
  },
  integration: {
    label: 'Integration',
    emoji: '🔌',
    desc: 'Wiring APIs & third-party services',
  },
  pm: {
    label: 'PM',
    emoji: '✅',
    desc: 'Validating output against requirements',
  },
}

function AgentIcon({ status }: { status: string }) {
  if (status === 'running') return <Loader2 size={16} className="animate-spin text-violet-400" />
  if (status === 'complete') return <CheckCircle2 size={16} className="text-emerald-400" />
  if (status === 'failed') return <XCircle size={16} className="text-red-400" />
  return <Circle size={16} className="text-forge-muted" />
}

function AgentRow({ agent }: { agent: AgentState }) {
  const meta = AGENT_META[agent.type]
  if (!meta) return null

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className={clsx(
        'flex items-start gap-3 px-4 py-3 rounded-lg transition-all',
        agent.status === 'running' && 'bg-violet-950/30 border border-violet-800/40 agent-active',
        agent.status === 'complete' && 'bg-emerald-950/10 border border-emerald-900/20',
        agent.status === 'idle' && 'opacity-40',
      )}
    >
      <span className="text-lg mt-0.5 leading-none">{meta.emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-forge-text">{meta.label}</span>
          {agent.status === 'running' && (
            <span className="text-xs text-violet-400 animate-pulse">running</span>
          )}
          {agent.status === 'complete' && agent.filesChanged.length > 0 && (
            <span className="text-xs text-forge-text-secondary">
              {agent.filesChanged.length} file{agent.filesChanged.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <p className="text-xs text-forge-text-secondary mt-0.5">{meta.desc}</p>
      </div>
      <AgentIcon status={agent.status} />
    </motion.div>
  )
}

export function AgentPipeline() {
  const { agents, status, debugIterations, creditsUsed } = useBuildStore()

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-forge-text-secondary uppercase tracking-wider">
          Agent Pipeline
        </span>
        {creditsUsed > 0 && (
          <span className="text-xs text-forge-text-secondary">
            {creditsUsed} credits
          </span>
        )}
      </div>

      {agents.map(agent => (
        <AgentRow key={agent.type} agent={agent} />
      ))}

      {debugIterations > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-950/20 border border-amber-900/30 rounded-lg">
          <AlertCircle size={14} className="text-amber-400" />
          <span className="text-xs text-amber-300">
            Debug loop — iteration {debugIterations}/3
          </span>
        </div>
      )}

      {status === 'success' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-2 px-4 py-3 bg-emerald-950/20 border border-emerald-800/40 rounded-lg mt-1"
        >
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span className="text-sm text-emerald-300 font-medium">Build complete</span>
        </motion.div>
      )}
    </div>
  )
}
