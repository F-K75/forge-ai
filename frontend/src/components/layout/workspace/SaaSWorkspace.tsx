import { useState } from 'react'
import { clsx } from 'clsx'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ChevronDown, 
  Database, 
  RefreshCw, 
  Play, 
  Bug, 
  RotateCcw, 
  AlertTriangle,
  LineChart,
  BarChart3,
  PieChart,
  Table2,
  Loader2
} from 'lucide-react'
import { useBuildStore, type AgentState } from '../../../store/buildStore'
import { ResizablePanel } from '../ResizablePanel'

type AgentType = 'architect' | 'developer' | 'qa'

interface AgentInfo {
  type: AgentType
  label: string
  statusColor: {
    idle: string
    running: string
    complete: string
    failed: string
  }
}

const AGENTS: AgentInfo[] = [
  { 
    type: 'architect', 
    label: 'Architect',
    statusColor: {
      idle: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      running: 'bg-blue-500/30 text-blue-300 border-blue-400/50 shadow-blue-glow',
      complete: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      failed: 'bg-red-500/20 text-red-400 border-red-500/30'
    }
  },
  { 
    type: 'developer', 
    label: 'Dev',
    statusColor: {
      idle: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
      running: 'bg-teal-500/30 text-teal-300 border-teal-400/50 shadow-teal-glow',
      complete: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      failed: 'bg-red-500/20 text-red-400 border-red-500/30'
    }
  },
  { 
    type: 'qa', 
    label: 'QA',
    statusColor: {
      idle: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      running: 'bg-orange-500/30 text-orange-300 border-orange-400/50 shadow-orange-glow',
      complete: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      failed: 'bg-red-500/20 text-red-400 border-red-500/30'
    }
  }
]

interface CollapsibleSectionProps {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
}

function CollapsibleSection({ title, icon, children, defaultOpen = false }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-forge-border/50 last:border-b-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-forge-border/20 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-blue-400">{icon}</span>
          <span className="text-sm font-medium text-forge-text">{title}</span>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown size={14} className="text-forge-text-secondary" />
        </motion.div>
      </button>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 space-y-3">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function StatusIcon({ status }: { status: AgentState['status'] }) {
  const icons = {
    idle: <div className="w-2 h-2 rounded-full bg-forge-muted" />,
    running: <Loader2 size={12} className="animate-spin text-blue-400" />,
    complete: <div className="w-2 h-2 rounded-full bg-emerald-400" />,
    failed: <AlertTriangle size={12} className="text-red-400" />
  }
  return icons[status] || icons.idle
}

function AgentActivityPanel() {
  const { agents } = useBuildStore()
  const getAgentOutput = (type: AgentType): string => {
    const agent = agents.find(a => a.type === type)
    return agent?.output || ''
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 border-b border-forge-border/50 px-4 py-3">
        <h2 className="text-[11px] uppercase tracking-[0.24em] text-forge-text-secondary">Agent Activity</h2>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {AGENTS.map(agent => {
          const agentState = agents.find(a => a.type === agent.type)
          const status = agentState?.status || 'idle'
          
          return (
            <div key={agent.type} className="glass-strong rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <StatusIcon status={status} />
                  <span className="text-sm font-medium text-forge-text">{agent.label}</span>
                </div>
                <span className={clsx(
                  'text-[10px] px-2 py-0.5 rounded-full border font-medium',
                  agent.statusColor[status]
                )}>
                  {status}
                </span>
              </div>
              
              {status === 'running' && (
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 h-1 bg-forge-border/50 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-blue-500 to-teal-400"
                      initial={{ width: 0 }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                    />
                  </div>
                </div>
              )}
              
              <div className="font-mono text-[10px] text-forge-text-secondary max-h-24 overflow-y-auto">
                {getAgentOutput(agent.type) ? (
                  <pre className="whitespace-pre-wrap break-words">
                    {getAgentOutput(agent.type).split('\n').slice(-3).map((line, i) => (
                      <div key={i} className="opacity-70">{line || ' '}</div>
                    ))}
                  </pre>
                ) : (
                  <span className="opacity-40">{status === 'idle' ? 'Waiting for task...' : 'Processing...'}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AppPreviewPanel() {
  const { status } = useBuildStore()

  const chartTypes = [
    { id: 'line', icon: LineChart, label: 'Line Chart', color: 'text-blue-400' },
    { id: 'bar', icon: BarChart3, label: 'Bar Chart', color: 'text-teal-400' },
    { id: 'pie', icon: PieChart, label: 'Pie Chart', color: 'text-orange-400' },
    { id: 'table', icon: Table2, label: 'Data Table', color: 'text-violet-400' },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 border-b border-forge-border/50 px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] uppercase tracking-[0.24em] text-forge-text-secondary">App Preview</h2>
          <div className={clsx(
            'text-[10px] px-2.5 py-1 rounded-full font-medium',
            status === 'success' 
              ? 'bg-emerald-500/20 text-emerald-400' 
              : status === 'running'
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-forge-border/30 text-forge-text-secondary'
          )}>
            {status === 'success' ? 'Ready' : status === 'running' ? 'Building' : 'Idle'}
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4">
        {status !== 'success' ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-20 h-20 rounded-2xl bg-forge-border/30 flex items-center justify-center mb-4">
              <LineChart size={36} className="text-forge-muted" />
            </div>
            <p className="text-sm font-medium text-forge-text mb-1">Dashboard preview</p>
            <p className="text-xs text-forge-text-secondary max-w-sm">
              Your data visualizations will appear here once the build completes.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="glass-strong rounded-xl p-4">
              <h3 className="text-sm font-medium text-forge-text mb-3">Metrics Overview</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-forge-bg/50 rounded-lg p-3 border border-forge-border/50">
                  <p className="text-[10px] text-forge-text-secondary mb-1">Total Runs</p>
                  <p className="text-xl font-semibold text-blue-400">12.4K</p>
                </div>
                <div className="bg-forge-bg/50 rounded-lg p-3 border border-forge-border/50">
                  <p className="text-[10px] text-forge-text-secondary mb-1">Success Rate</p>
                  <p className="text-xl font-semibold text-emerald-400">98.2%</p>
                </div>
                <div className="bg-forge-bg/50 rounded-lg p-3 border border-forge-border/50">
                  <p className="text-[10px] text-forge-text-secondary mb-1">Active Users</p>
                  <p className="text-xl font-semibold text-teal-400">342</p>
                </div>
                <div className="bg-forge-bg/50 rounded-lg p-3 border border-forge-border/50">
                  <p className="text-[10px] text-forge-text-secondary mb-1">Avg Latency</p>
                  <p className="text-xl font-semibold text-orange-400">42ms</p>
                </div>
              </div>
            </div>
            
            <div className="glass-strong rounded-xl p-4">
              <h3 className="text-sm font-medium text-forge-text mb-3">Charts</h3>
              <div className="grid grid-cols-2 gap-2">
                {chartTypes.map(chart => (
                  <div key={chart.id} className="bg-forge-bg/50 rounded-lg p-3 border border-forge-border/50 hover:bg-forge-border/20 transition-colors cursor-pointer">
                    <div className="flex items-center gap-2">
                      <chart.icon size={14} className={chart.color} />
                      <span className="text-xs text-forge-text">{chart.label}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ConfigurationPanel({ prompt }: { prompt: string }) {
  const { status, startBuild } = useBuildStore()
  const [dataSource, setDataSource] = useState('postgres://...')
  const [transformations, setTransformations] = useState('')

  const handleGenerateApp = () => {
    if (prompt.trim()) {
      const buildId = `build_${Date.now()}`
      startBuild(buildId, prompt)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 border-b border-forge-border/50 px-4 py-3">
        <h2 className="text-[11px] uppercase tracking-[0.24em] text-forge-text-secondary">Configuration</h2>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        <CollapsibleSection title="Data Source" icon={<Database size={16} />} defaultOpen>
          <div className="space-y-2">
            <select className="bb-input text-xs py-1.5">
              <option>PostgreSQL</option>
              <option>MySQL</option>
              <option>MongoDB</option>
              <option>REST API</option>
            </select>
            <input
              type="text"
              value={dataSource}
              onChange={e => setDataSource(e.target.value)}
              placeholder="Connection string..."
              className="bb-input text-xs py-1.5 font-mono"
            />
            <button className="w-full bb-btn bb-btn-subtle justify-center text-xs py-1.5">
              Test Connection
            </button>
          </div>
        </CollapsibleSection>
        
        <CollapsibleSection title="Transformations" icon={<RefreshCw size={16} />}>
          <div className="space-y-2">
            <textarea
              value={transformations}
              onChange={e => setTransformations(e.target.value)}
              placeholder="Transform logic (SQL/Python)..."
              className="bb-input bb-textarea text-xs font-mono h-24 resize-none"
            />
            <button className="w-full bb-btn bb-btn-subtle justify-center text-xs py-1.5">
              Validate
            </button>
          </div>
        </CollapsibleSection>
        
        <CollapsibleSection title="Visualization Options" icon={<BarChart3 size={16} />}>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" defaultChecked className="rounded border-forge-border" />
              <span className="text-forge-text-secondary">Auto-generate charts</span>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" defaultChecked className="rounded border-forge-border" />
              <span className="text-forge-text-secondary">Enable filters</span>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" className="rounded border-forge-border" />
              <span className="text-forge-text-secondary">Real-time updates</span>
            </label>
          </div>
        </CollapsibleSection>
      </div>
      
      <div className="flex-shrink-0 border-t border-forge-border/50 p-4">
        <button
          onClick={handleGenerateApp}
          disabled={status === 'running' || !prompt.trim()}
          className={clsx(
            'w-full bb-btn bb-btn-primary justify-center gap-2 text-sm py-3 shadow-lg transition-all',
            status === 'running' && 'opacity-60 cursor-not-allowed'
          )}
        >
          {status === 'running' ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Play size={14} />
              Generate App
            </>
          )}
        </button>
      </div>
    </div>
  )
}

function SandboxRunConsole() {
  const { status, error, debugIterations, agents } = useBuildStore()
  const activeAgents = agents.filter(a => a.status === 'running').length

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between border-b border-forge-border/50 px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-[11px] uppercase tracking-[0.24em] text-forge-text-secondary">Sandbox Run</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-forge-text-secondary">Iteration</span>
            <span className="text-xs font-medium text-blue-400">{debugIterations}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {error && (
            <>
              <button className="bb-btn bb-btn-ghost bb-btn-icon rounded-lg">
                <Bug size={12} />
              </button>
              <button className="bb-btn bb-btn-primary px-2.5 py-1 text-[10px] rounded-lg">
                Retry
              </button>
            </>
          )}
          <button className="bb-btn bb-btn-ghost bb-btn-icon rounded-lg">
            <RotateCcw size={12} />
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto font-mono text-[11px] p-3 space-y-1">
        {error ? (
          <div className="text-red-400">
            <span className="opacity-60">[ERROR]</span> {error}
          </div>
        ) : (
          status === 'running' ? (
            <>
              <div className="text-blue-400 opacity-80">
                <span className="text-forge-text-secondary">[INFO]</span> Build started
              </div>
              <div className="text-teal-400 opacity-80">
                <span className="text-forge-text-secondary">[DEBUG]</span> Agents active: {activeAgents}
              </div>
            </>
          ) : (
            <div className="text-forge-text-secondary opacity-40">
              Console ready. Run a build to see logs.
            </div>
          )
        )}
      </div>
      
      <div className="flex-shrink-0 border-t border-forge-border/50 px-4 py-2">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-forge-text-secondary">
            {status === 'success' ? 'Last run completed' : status === 'running' ? 'Running...' : 'Ready'}
          </span>
          <div className="flex items-center gap-1">
            <div className={clsx(
              'w-1.5 h-1.5 rounded-full',
              status === 'running' ? 'bg-blue-400 animate-pulse' :
              status === 'success' ? 'bg-emerald-400' : 'bg-forge-muted'
            )} />
            <span className="text-forge-text-secondary">
              {status === 'running' ? 'Building' : status === 'success' ? 'Ready' : 'Idle'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SaaSWorkspace() {
  const { prompt } = useBuildStore()

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-forge-bg text-forge-text">
      <div className="flex flex-1 overflow-hidden">
        <ResizablePanel side="left" defaultSize={320} minSize={280} maxSize={400}>
          <AgentActivityPanel />
        </ResizablePanel>

        <div className="flex flex-1 min-w-0 flex-col">
          <div className="flex-1 overflow-y-auto">
            <AppPreviewPanel />
          </div>
          
          <div className="h-64 border-t border-forge-border/50">
            <SandboxRunConsole />
          </div>
        </div>

        <ResizablePanel side="right" defaultSize={380} minSize={320} maxSize={500}>
          <ConfigurationPanel prompt={prompt} />
        </ResizablePanel>
      </div>
    </div>
  )
}