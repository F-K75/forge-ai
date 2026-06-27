import clsx from 'clsx'
import { motion } from 'framer-motion'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp?: Date
  status?: 'sending' | 'sent' | 'error'
  metadata?: Record<string, any>
}

interface ChatMessageProps {
  message: Message
  renderMessage?: (content: string) => React.ReactNode
  userMessageClassName?: string
  assistantMessageClassName?: string
}

const DEFAULT_USER_CLASS = 'bg-violet-600 text-white rounded-tr-sm'
const DEFAULT_ASSISTANT_CLASS = 'bg-forge-surface border border-forge-border text-forge-text rounded-tl-sm'

export function ChatMessage({
  message,
  renderMessage,
  userMessageClassName,
  assistantMessageClassName,
}: ChatMessageProps) {
  const messageClass =
    message.role === 'user'
      ? userMessageClassName ?? DEFAULT_USER_CLASS
      : assistantMessageClassName ?? DEFAULT_ASSISTANT_CLASS

  const content = renderMessage ? renderMessage(message.content) : message.content

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx('flex gap-3', message.role === 'user' ? 'flex-row-reverse' : 'flex-row')}
      role="listitem"
    >
      <div
        className={clsx(
          'text-sm leading-relaxed px-3 py-2 rounded-2xl max-w-[85%] whitespace-pre-wrap',
          messageClass
        )}
      >
        {content}
      </div>
    </motion.div>
  )
}

export type { Message }
