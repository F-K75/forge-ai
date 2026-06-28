import { motion } from 'framer-motion'
import { Cpu, HardDrive, Sparkles, Send } from 'lucide-react'
import { useBuildStore } from '../../store/buildStore'
import { type FC, useState } from 'react'

const techStack = [
  { label: 'React', value: 'Framework' },
  { label: 'PostgreSQL', value: 'Database' },
  { label: 'FastAPI', value: 'Backend' },
  { label: 'Tailwind', value: 'Frontend' },
]

export const ProjectOverview: FC = () => {
  const { status, prompt, agents, creditsUsed, debugIterations, startBuild } = useBuildStore()
  const [intentInput, setIntentInput] = useState(prompt)

  const activeAgents = agents.filter(agent => agent.status === 'running').length
  const completedAgents = agents.filter(agent => agent.status === 'complete').length

  const handleSubmit = () => {
    if (intentInput.trim()) {
      startBuild('new-build', intentInput)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && intentInput.trim()) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-forge-border bg-forge-surface p-5"
    >
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xl font-semibold text-forge-text">Forge AI Workspace</h2>
            <span className="text-xs text-forge-text-secondary bg-forge-border/30 px-2 py-1 rounded-md">
              {status === 'success' ? 'Build ready' : status === 'running' ? 'Running' : 'Waiting'}
            </span>
          </div>

          <div className="mb-4">
            <h3 className="text-xs uppercase tracking-wider text-forge-text-secondary mb-2">Stack</h3>
            <div className="flex flex-wrap gap-2">
              {techStack.map(item => (
                <span key={item.label} className="inline-flex items-center rounded-full bg-forge-border/20 px-3 py-1 text-xs text-forge-text-secondary">
                  <span className="font-medium text-forge-text">{item.label}</span>
                  <span className="mx-1 opacity-50">•</span>
                  <span>{item.value}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 text-xs">
            <div>
              <span className="text-forge-text-secondary">Agents</span>
              <span className="ml-2 text-forge-text">{activeAgents}/{agents.length}</span>
            </div>
            <div>
              <span className="text-forge-text-secondary">Completed</span>
              <span className="ml-2 text-forge-text">{completedAgents}</span>
            </div>
            <div>
              <span className="text-forge-text-secondary">Credits</span>
              <span className="ml-2 text-forge-text">{creditsUsed}</span>
            </div>
            {debugIterations > 0 && (
              <div>
                <span className="text-amber-400">Debug</span>
                <span className="ml-2 text-forge-text">{debugIterations}</span>
              </div>
            )}
          </div>
        </div>

        <div className="w-full lg:w-96">
          <label className="block text-xs uppercase tracking-wider text-forge-text-secondary mb-2" htmlFor="current-intent">
            Current intent
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                id="current-intent"
                type="text"
                value={intentInput}
                onChange={e => setIntentInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter your command..."
                className="w-full rounded-lg border border-forge-border bg-forge-bg text-sm text-forge-text placeholder-forge-text-secondary/50 px-3 py-2.5 pr-10 focus:outline-none focus:ring-2 focus:ring-violet-500"
                aria-label="Current intent"
              />
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!intentInput.trim() || status === 'running'}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md bg-violet-600 p-1.5 text-white hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition focus:outline-none focus:ring-2 focus:ring-violet-500"
                aria-label="Submit intent"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  )
}