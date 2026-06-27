import { motion } from 'framer-motion'
import { Cpu, GitBranch, HardDrive, Sparkles, TimerReset } from 'lucide-react'
import { useBuildStore } from '../../store/buildStore'

const overviewItems = [
  { label: 'Framework', value: 'React + Vite', icon: Sparkles },
  { label: 'Database', value: 'Postgres', icon: HardDrive },
  { label: 'Backend', value: 'FastAPI', icon: Cpu },
  { label: 'Frontend', value: 'Tailwind + TS', icon: Sparkles },
]

export function ProjectOverview() {
  const { status, prompt, agents, creditsUsed, debugIterations } = useBuildStore()
  const activeAgents = agents.filter(agent => agent.status === 'running').length
  const completedAgents = agents.filter(agent => agent.status === 'complete').length

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[24px] border border-forge-border/80 bg-gradient-to-br from-forge-surface/80 to-forge-surface/40 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.25)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-forge-text-secondary">Project overview</p>
          <h2 className="mt-1 text-xl font-semibold text-forge-text">Forge AI Workspace</h2>
        </div>
        <div className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-200">
          {status === 'success' ? 'Build ready' : status === 'running' ? 'Building' : 'Waiting'}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {overviewItems.map(item => {
          const Icon = item.icon
          return (
            <div key={item.label} className="rounded-2xl border border-forge-border/70 bg-forge-bg/70 p-3">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-forge-text-secondary">
                <Icon size={12} />
                {item.label}
              </div>
              <p className="mt-2 text-sm font-medium text-forge-text">{item.value}</p>
            </div>
          )
        })}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.3fr_0.8fr]">
        <div className="rounded-2xl border border-forge-border/70 bg-forge-bg/70 p-4">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-forge-text-secondary">
            <TimerReset size={12} />
            Current intent
          </div>
          <p className="mt-2 text-sm text-forge-text">
            {prompt || 'Ask Forge to build something impressive.'}
          </p>
        </div>
        <div className="rounded-2xl border border-forge-border/70 bg-forge-bg/70 p-4">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-forge-text-secondary">
            <GitBranch size={12} />
            Runtime status
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-forge-border bg-forge-surface/80 px-2.5 py-1 text-forge-text-secondary">Agents: {activeAgents}/{agents.length}</span>
            <span className="rounded-full border border-forge-border bg-forge-surface/80 px-2.5 py-1 text-forge-text-secondary">Completed: {completedAgents}</span>
            <span className="rounded-full border border-forge-border bg-forge-surface/80 px-2.5 py-1 text-forge-text-secondary">Credits: {creditsUsed}</span>
            {debugIterations > 0 && <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-amber-300">Debug: {debugIterations}</span>}
          </div>
        </div>
      </div>
    </motion.section>
  )
}
