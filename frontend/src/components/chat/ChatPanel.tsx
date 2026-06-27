import { useState, useEffect } from 'react'
import { useBuildStore } from '../../store/buildStore'
import { ChatInput } from './ChatInput'
import { MessageList } from './MessageList'
import type { Message } from './ChatMessage'

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
  
  // Phase 2: Handler customization
  onSubmit?: (input: string) => Promise<{ id: string; content: string }>
  apiHandler?: (prompt: string) => Promise<any>
  
  // Phase 2: Optional store props (override store values if provided)
  isLoading?: boolean
  streamingContent?: string
  examples?: string[]
  inputPlaceholder?: string
  
  // Phase 2: Custom rendering
  renderMessage?: (content: string) => React.ReactNode
  userMessageClassName?: string
  assistantMessageClassName?: string
  emptyState?: React.ReactNode
  
  // Phase 3: Error handling & lifecycle
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

  // Use external props or fall back to store
  const isBuilding = externalIsLoading ?? ['pending', 'running', 'debugging'].includes(status)
  const streamingBuffer = externalStreamingContent ?? streamBuffer

  // Handle example click
  const handleExampleClick = (example: string) => {
    setInput(example)
  }

  // Default submission handler (build creation)
  const defaultSubmitHandler = async (prompt: string) => {
    const { buildsApi, projectsApi } = await import('../../lib/api')

    // Create project if no projectId
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

  // Handle form submission
  const handleSubmit = async () => {
    if (!input.trim() || isBuilding) return

    const prompt = input.trim()
    setInput('')

    // Phase 3: Lifecycle hook
    onBeforeSubmit?.(prompt)

    // Add user message
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
      // Use custom submit handler, API handler, or default
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

      // Phase 3: Custom error handler
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

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    const scrollDiv = document.querySelector('[data-chat-messages]')
    if (scrollDiv) {
      scrollDiv.scrollTop = scrollDiv.scrollHeight
    }
  }, [messages, streamingBuffer])

  // Build empty state with examples
  const customEmptyState = emptyState || (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-4">
      <div className="w-12 h-12 rounded-2xl bg-violet-600/20 border border-violet-600/30 flex items-center justify-center">
        {/* Icon handled by MessageList default empty state */}
      </div>
      {examples && examples.length > 0 && (
        <div className="flex flex-col gap-2 w-full max-w-sm">
          {examples.slice(0, 3).map((p, i) => (
            <button
              key={i}
              onClick={() => handleExampleClick(p)}
              className="text-left text-xs text-forge-text-secondary px-3 py-2 rounded-lg border border-forge-border hover:border-violet-600/50 hover:text-forge-text transition-all"
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      <div data-chat-messages>
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

      <div aria-label="Chat composer">
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          disabled={isBuilding}
          placeholder={inputPlaceholder}
          isLoading={isBuilding}
        />
      </div>
    </div>
  )
}
