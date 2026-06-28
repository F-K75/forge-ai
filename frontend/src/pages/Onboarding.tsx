import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { api } from '../lib/api'
import { Check, ArrowRight, Sparkles, FolderPlus, Rocket, CreditCard, Shield, Users, X, Layers, ShoppingBag, BookTemplate, ChevronRight, ChevronLeft } from 'lucide-react'
import clsx from 'clsx'

interface OnboardingStep {
  id: string
  title: string
  description: string
  icon: any
  completed: boolean
}

const templates = [
  { id: 'react', name: 'React App', icon: Layers, description: 'Modern React with TypeScript' },
  { id: 'nextjs', name: 'Next.js', icon: Layers, description: 'Full-stack React framework' },
  { id: 'vite', name: 'Vite + React', icon: Layers, description: 'Fast dev server and HMR' },
  { id: 'remix', name: 'Remix', icon: Layers, description: 'Full-stack web framework' },
  { id: 'node', name: 'Node.js API', icon: Rocket, description: 'REST API backend' },
  { id: 'fullstack', name: 'Full-stack', icon: Layers, description: 'React + Node combined' },
]

export default function Onboarding() {
  const navigate = useNavigate()
  const { user, fetchMe } = useAuthStore()
  const [steps, setSteps] = useState<OnboardingStep[]>([
    { id: 'signup', title: 'Account created', description: 'Your Forge account is ready', icon: Check, completed: true },
    { id: 'profile', title: 'Complete profile', description: 'Add your details', icon: Users, completed: true },
    { id: 'project', title: 'Create first project', description: 'Start building', icon: FolderPlus, completed: false },
    { id: 'build', title: 'Complete first build', description: 'Generate your first app', icon: Rocket, completed: false },
    { id: 'billing', title: 'Choose plan', description: 'Unlock more features', icon: CreditCard, completed: false },
  ])
  const [loading, setLoading] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('react')
  const [showTemplates, setShowTemplates] = useState(true)
  const skipRef = useRef<HTMLButtonElement>(null)
  const projectInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchMe()
  }, [fetchMe])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showTemplates) {
        setShowTemplates(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showTemplates])

  useEffect(() => {
    if (!steps.find(s => s.id === 'project')?.completed && projectInputRef.current) {
      projectInputRef.current.focus()
    }
  }, [steps])

  const handleCreateProject = async () => {
    if (!projectName.trim()) return
    setLoading(true)
    try {
      await api.post('/projects/', { name: projectName, description: 'My first project', template: selectedTemplate })
      completeStep('project')
    } catch (e) {
      console.error('Failed to create project:', e)
    } finally {
      setLoading(false)
    }
  }

  const completeStep = (stepId: string) => {
    setSteps(s => s.map(step => step.id === stepId ? { ...step, completed: true } : step))
    api.post('/analytics/event', { event_name: `${stepId}_completed` })
  }

  const handleStartBuild = async () => {
    navigate('/')
    completeStep('build')
  }

  const handleSkip = () => {
    navigate('/')
  }

  const progress = steps.filter(s => s.completed).length
  const progressPercent = (progress / steps.length) * 100
  const isProjectDone = steps.find(s => s.id === 'project')?.completed

  return (
    <div className="min-h-screen bg-forge-bg flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-8 relative">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 mb-4">
            <Sparkles className="w-8 h-8 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Welcome to Forge</h1>
          <p className="text-forge-text-secondary">Let's get you started building apps with AI</p>
          <button
            ref={skipRef}
            onClick={handleSkip}
            className="absolute right-0 top-0 rounded-xl p-2 text-forge-text-secondary hover:text-white hover:bg-forge-surface transition focus:outline-none focus:ring-2 focus:ring-violet-500"
            aria-label="Skip onboarding"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="bg-forge-surface border border-forge-border rounded-2xl p-6" role="region" aria-label="Onboarding wizard">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-forge-text-secondary">Setup progress</span>
              <span className="text-sm text-violet-400" aria-live="polite">{progress}/{steps.length} completed</span>
            </div>
            <div className="h-2 bg-forge-bg rounded-full overflow-hidden" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100} aria-label="Onboarding progress">
              <div 
                className="h-full bg-gradient-to-r from-violet-600 to-indigo-600 transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="space-y-4 mb-6" role="list" aria-label="Onboarding steps">
            {steps.map((step, index) => {
              const Icon = step.icon
              return (
                <div 
                  key={step.id}
                  role="listitem"
                  className={clsx(
                    'flex items-start gap-4 p-4 rounded-xl border transition-all',
                    step.completed ? 'border-green-500/30 bg-green-500/10' : 'border-forge-border bg-forge-surface/30'
                  )}
                >
                  <div className={clsx(
                    'flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0',
                    step.completed ? 'bg-green-600' : 'bg-violet-600'
                  )}>
                    <Icon className="w-5 h-5 text-white" aria-hidden="true" />
                  </div>
                  <div className="flex-1">
                    <h3 className={clsx(
                      'font-medium',
                      step.completed ? 'text-green-300' : 'text-white'
                    )}>{step.title}</h3>
                    <p className="text-sm text-forge-text-secondary">{step.description}</p>
                  </div>
                  {step.completed && (
                    <Check className="w-5 h-5 text-green-400 mt-1 flex-shrink-0" aria-label="Completed" />
                  )}
                </div>
              )
            })}
          </div>

          {showTemplates && (
            <div className="mb-6" role="region" aria-label="Template selection">
              <h3 className="font-medium text-white mb-4 flex items-center gap-2">
                <BookTemplate className="w-5 h-5" aria-hidden="true" />
                Choose a template to get started
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Template options">
                {templates.map(template => {
                  const Icon = template.icon
                  return (
                    <button
                      key={template.id}
                      onClick={() => setSelectedTemplate(template.id)}
                      aria-checked={selectedTemplate === template.id}
                      role="radio"
                      className={clsx(
                        'p-4 rounded-xl border text-left transition-all focus:outline-none focus:ring-2 focus:ring-violet-500',
                        selectedTemplate === template.id
                          ? 'border-violet-500 bg-violet-500/10'
                          : 'border-forge-border bg-forge-surface/30 hover:border-violet-500/50'
                      )}
                    >
                      <Icon className={clsx(
                        'w-8 h-8 mb-2',
                        selectedTemplate === template.id ? 'text-violet-400' : 'text-forge-muted'
                      )} aria-hidden="true" />
                      <div className="font-medium text-white text-sm">{template.name}</div>
                      <div className="text-xs text-forge-text-secondary">{template.description}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {!isProjectDone && (
            <div className="pt-6 border-t border-forge-border">
              <div className="flex gap-3">
                <input
                  ref={projectInputRef}
                  type="text"
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  placeholder="My awesome app"
                  className="flex-1 bg-forge-bg border border-forge-border rounded-xl px-4 py-3 text-white placeholder-forge-text-secondary focus:outline-none focus:ring-2 focus:ring-violet-500"
                  aria-label="Project name"
                  aria-describedby="project-help"
                />
                <button
                  onClick={handleCreateProject}
                  disabled={loading || !projectName.trim()}
                  className="px-6 py-3 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/50 text-white font-medium rounded-xl transition focus:outline-none focus:ring-2 focus:ring-violet-500"
                  aria-disabled={loading || !projectName.trim()}
                >
                  {loading ? 'Creating...' : 'Create'}
                </button>
              </div>
              <p id="project-help" className="text-xs text-forge-text-secondary mt-2">
                Choose a name for your first project. You can change this later.
              </p>
            </div>
          )}

          {isProjectDone && !steps.find(s => s.id === 'build')?.completed && (
            <div className="pt-6 border-t border-forge-border">
              <button
                onClick={handleStartBuild}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-medium rounded-xl hover:opacity-90 transition focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                Start building
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
              <p className="text-center text-xs text-forge-text-secondary mt-2">
                Your project "{projectName}" is ready. Click to begin building.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}