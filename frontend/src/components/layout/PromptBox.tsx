import { motion } from 'framer-motion'
import { ArrowUpRight, Mic, Paperclip, Wand2 } from 'lucide-react'
import clsx from 'clsx'

interface PromptBoxProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  isLoading?: boolean
  placeholder?: string
}

const templates = ['Build CRM', 'Build SaaS', 'Portfolio', 'AI Chatbot', 'Inventory System', 'Resume Builder']

export function PromptBox({ value, onChange, onSubmit, isLoading = false, placeholder = 'What do you want to build today?' }: PromptBoxProps) {
  const handleSubmit = () => {
    if (!isLoading && value.trim()) {
      onSubmit()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="rounded-[24px] border border-forge-border/80 bg-gradient-to-br from-forge-surface/90 to-forge-surface/50 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.2)]">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-forge-text-secondary">Prompt</p>
          <h3 className="mt-1 text-lg font-semibold text-forge-text">{placeholder}</h3>
        </div>
        <div className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-200">
          AI-powered
        </div>
      </div>

      <div className="mt-4 rounded-[20px] border border-forge-border/80 bg-forge-bg/70 p-3">
        <textarea
          value={value}
          onChange={event => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Build an ecommerce experience with Stripe, auth, and analytics..."
          className="min-h-[110px] w-full resize-none border-none bg-transparent font-medium text-forge-text outline-none placeholder:text-forge-text-secondary focus:ring-2 focus:ring-violet-500"
          aria-label="Build prompt"
          aria-describedby="prompt-help"
          aria-required="true"
        />
        <p id="prompt-help" className="sr-only">
          Enter your build request. Press Cmd+Enter to submit.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2" role="toolbar" aria-label="Prompt actions">
          <button 
            type="button" 
            className="rounded-full border border-forge-border bg-forge-surface/80 px-3 py-1.5 text-xs text-forge-text-secondary transition hover:border-violet-500/30 hover:text-forge-text focus:outline-none focus:ring-2 focus:ring-violet-500"
            aria-label="Attach file"
          >
            <span className="mr-1.5">@file</span>
          </button>
          <button 
            type="button" 
            className="rounded-full border border-forge-border bg-forge-surface/80 px-3 py-1.5 text-xs text-forge-text-secondary transition hover:border-violet-500/30 hover:text-forge-text focus:outline-none focus:ring-2 focus:ring-violet-500"
            aria-label="Insert template"
          >
            <span className="mr-1.5">/template</span>
          </button>
          <button 
            type="button" 
            className="rounded-full border border-forge-border bg-forge-surface/80 px-3 py-1.5 text-xs text-forge-text-secondary transition hover:border-violet-500/30 hover:text-forge-text focus:outline-none focus:ring-2 focus:ring-violet-500"
            aria-label="Voice input"
          >
            <Mic size={12} className="mr-1.5 inline" aria-hidden="true" /> Voice
          </button>
          <button 
            type="button" 
            className="rounded-full border border-forge-border bg-forge-surface/80 px-3 py-1.5 text-xs text-forge-text-secondary transition hover:border-violet-500/30 hover:text-forge-text focus:outline-none focus:ring-2 focus:ring-violet-500"
            aria-label="Upload files"
          >
            <Paperclip size={12} className="mr-1.5 inline" aria-hidden="true" /> Upload
          </button>
          <button 
            type="button" 
            className="rounded-full border border-forge-border bg-forge-surface/80 px-3 py-1.5 text-xs text-forge-text-secondary transition hover:border-violet-500/30 hover:text-forge-text focus:outline-none focus:ring-2 focus:ring-violet-500"
            aria-label="Import Figma design"
          >
            <Wand2 size={12} className="mr-1.5 inline" aria-hidden="true" /> Import Figma
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick templates">
          {templates.map(template => (
            <button 
              key={template} 
              type="button" 
              className="rounded-full border border-forge-border/70 bg-forge-surface/70 px-3 py-1.5 text-xs text-forge-text-secondary transition hover:border-violet-500/30 hover:text-forge-text focus:outline-none focus:ring-2 focus:ring-violet-500"
              aria-label={`Use template: ${template}`}
            >
              {template}
            </button>
          ))}
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="button"
          onClick={handleSubmit}
          disabled={isLoading || !value.trim()}
          aria-disabled={isLoading || !value.trim()}
          aria-label="Run build"
          className={clsx('inline-flex items-center gap-2 rounded-full bg-violet-600 px-3.5 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:bg-violet-600/40 focus:outline-none focus:ring-2 focus:ring-violet-500', !value.trim() && 'opacity-70')}
        >
          {isLoading ? 'Working...' : 'Run'}
          <ArrowUpRight size={14} aria-hidden="true" />
        </motion.button>
      </div>
    </div>
  )
}