import { Sparkles } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { ChatMessage, type Message } from './ChatMessage'

interface MessageListProps {
  messages: Message[]
  streamBuffer?: string
  emptyState?: React.ReactNode
  isLoading?: boolean
  renderMessage?: (content: string) => React.ReactNode
  userMessageClassName?: string
  assistantMessageClassName?: string
}

const DEFAULT_EMPTY_STATE = (
  <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-4">
    <div className="w-12 h-12 rounded-2xl bg-violet-600/20 border border-violet-600/30 flex items-center justify-center">
      <Sparkles size={22} className="text-violet-400" />
    </div>
    <div>
      <h2 className="text-lg font-semibold text-forge-text mb-1">Describe your app</h2>
      <p className="text-sm text-forge-text-secondary max-w-xs">
        Tell me what you want to build. I'll create the full stack — frontend, backend, database, and deploy.
      </p>
    </div>
  </div>
)

export function MessageList({
  messages,
  streamBuffer,
  emptyState,
  isLoading,
  renderMessage,
  userMessageClassName,
  assistantMessageClassName,
}: MessageListProps) {
  const hasMessages = messages.length > 0

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <AnimatePresence mode="wait">
        {!hasMessages && !isLoading ? (
          <div key="empty-state" className="h-full">
            {emptyState ?? DEFAULT_EMPTY_STATE}
          </div>
        ) : (
          <div
            key="messages"
            className="space-y-4"
            role="list"
            aria-label="Chat messages"
          >
            {messages.map(msg => (
              <ChatMessage
                key={msg.id}
                message={msg}
                renderMessage={renderMessage}
                userMessageClassName={userMessageClassName}
                assistantMessageClassName={assistantMessageClassName}
              />
            ))}

            {/* Streaming token preview */}
            {streamBuffer && (
              <div
                className="text-xs text-forge-text-secondary px-1 cursor font-mono"
                aria-live="polite"
              >
                {streamBuffer.slice(-200)}
              </div>
            )}
          </div>
        )}

      </AnimatePresence>
    </div>

  )
}
