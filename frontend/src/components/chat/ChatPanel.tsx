import { useEffect, useState } from 'react'
import { useBuildStore } from '../../store/buildStore'
import { MessageList } from './MessageList'
import type { Message } from './ChatMessage'
import { PromptBox } from '../layout/PromptBox'

const DEFAULT_EXAMPLE_PROMPTS = [
  'A SaaS CRM with contacts, deals pipeline, and email tracking',
  'An e-commerce store with product catalog, cart, and Stripe checkout',
  'A job board with company profiles, listings, and applicant tracking',
  'A project management tool like Linear with issues and sprints',
  'A social platform for book reviews with reading lists and ratings',
]

interface ChatPanelProps {
  projectId: string
  onBuildStart?: (buildId: string, prompt: string) => void
  onSubmit?: (input: string) => Promise<{ id: string; content: string }>
  apiHandler?: (prompt: string) => Promise<any>
  isLoading?: boolean
  streamingContent?: string
  examples?: string[]
  inputPlaceholder?: string
  renderMessage?: (content: string) => React.ReactNode
  userMessageClassName?: string
  assistantMessageClassName?: string
  emptyState?: React.ReactNode
  onError?: (error: Error) => Promise<string | void>
  onMessageAdd?: (message: Message) => void
  onBeforeSubmit?: (input: string) => void
  onAfterSubmit?: (input: string, success: boolean) => void
}

export function ChatPanel({
  projectId,
  onBuildStart,
  onSubmit: customSubmit,
  apiHandler,
  isLoading: externalIsLoading,
  streamingContent: externalStreamingContent,
  examples = DEFAULT_EXAMPLE_PROMPTS,
  inputPlaceholder,
  renderMessage,
  userMessageClassName,
  assistantMessageClassName,
  emptyState,
  onError,
  onMessageAdd,
  onBeforeSubmit,
  onAfterSubmit,
}: ChatPanelProps) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [localIsLoading, setLocalIsLoading] = useState(false)
  const { status, streamBuffer } = useBuildStore()

  const isBuilding = externalIsLoading ?? ['pending', 'running', 'debugging'].includes(status)
  const streamingBuffer = externalStreamingContent ?? streamBuffer

  const handleExampleClick = (example: string) => {
    setInput(example)
  }

  const defaultSubmitHandler = async (prompt: string) => {
    const { buildsApi, projectsApi } = await import('../../lib/api')

    let pid = projectId
    if (!pid) {
      const project = await projectsApi.create({
        name: prompt.slice(0, 50),
        description: prompt,
      })
      pid = project.id
    }

    const result = await buildsApi.create({ project_id: pid, prompt })
    onBuildStart?.(result.build_id, prompt)

    return {
      id: (Date.now() + 1).toString(),
      content: `Starting build for: **${prompt}**\n\nI've kicked off the agent pipeline. Watch the agents work in real-time →`,
    }
  }

  const handleSubmit = async () => {
    if (!input.trim() || isBuilding) return

    const prompt = input.trim()
    setInput('')

    onBeforeSubmit?.(prompt)

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: prompt,
      timestamp: new Date(),
      status: 'sent',
    }
    setMessages(prev => [...prev, userMessage])
    onMessageAdd?.(userMessage)

    setLocalIsLoading(true)

    try {
      let result
      if (customSubmit) {
        result = await customSubmit(prompt)
      } else if (apiHandler) {
        result = await apiHandler(prompt)
      } else {
        result = await defaultSubmitHandler(prompt)
      }

      const assistantMessage: Message = {
        id: result.id || (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.content || '',
        timestamp: new Date(),
        status: 'sent',
      }
      setMessages(prev => [...prev, assistantMessage])
      onMessageAdd?.(assistantMessage)

      onAfterSubmit?.(prompt, true)
    } catch (err) {
      const error = err as Error
      let errorMessage = 'Something went wrong. Check that the backend is running.'

      if (onError) {
        const customErrorMsg = await onError(error)
        if (customErrorMsg) {
          errorMessage = customErrorMsg
        }
      }

      const errorMessageObj: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: errorMessage,
        timestamp: new Date(),
        status: 'error',
      }
      setMessages(prev => [...prev, errorMessageObj])
      onMessageAdd?.(errorMessageObj)

      onAfterSubmit?.(prompt, false)
    } finally {
      setLocalIsLoading(false)
    }
  }

  useEffect(() => {
    const scrollDiv = document.querySelector('[data-chat-messages]')
    if (scrollDiv) {
      scrollDiv.scrollTop = scrollDiv.scrollHeight
    }
  }, [messages, streamingBuffer])

  const customEmptyState = emptyState || (
    <div className="flex flex-col items-center justify-center h-full gap-4 rounded-[24px] border border-dashed border-forge-border/70 bg-forge-surface/50 p-8 text-center">
      <p className="text-sm text-forge-text-secondary">Start with a product brief or a concrete feature request.</p>
      <div className="flex flex-wrap justify-center gap-2">
        {examples.slice(0, 4).map((example, index) => (
          <button
            key={`${example}-${index}`}
            type="button"
            onClick={() => handleExampleClick(example)}
            className="rounded-full border border-forge-border bg-forge-bg/70 px-3 py-1.5 text-xs text-forge-text-secondary transition hover:border-violet-500/30 hover:text-forge-text"
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[24px] border border-forge-border/70 bg-forge-surface/70 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.16)]">
      <div className="flex-shrink-0">
        <PromptBox
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          isLoading={isBuilding || localIsLoading}
          placeholder={inputPlaceholder}
        />
      </div>

      <div className="mt-3 min-h-0 flex-1 rounded-[20px] border border-forge-border/70 bg-forge-bg/70 p-2" data-chat-messages>
        <MessageList
          messages={messages}
          streamBuffer={streamingBuffer}
          emptyState={messages.length === 0 ? customEmptyState : undefined}
          isLoading={isBuilding}
          renderMessage={renderMessage}
          userMessageClassName={userMessageClassName}
          assistantMessageClassName={assistantMessageClassName}
        />
      </div>
    </div>
  )
}
