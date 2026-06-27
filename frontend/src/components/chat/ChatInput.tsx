import { useRef, useEffect } from 'react'
import { Send } from 'lucide-react'
import clsx from 'clsx'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onKeyDown?: (e: React.KeyboardEvent) => void
  disabled?: boolean
  placeholder?: string
  isLoading?: boolean
  userMessageClassName?: string
  assistantMessageClassName?: string
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onKeyDown,
  disabled = false,
  placeholder = 'Describe your app...',
  isLoading = false,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [value])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSubmit()
    }
    onKeyDown?.(e)
  }

  const isDisabled = disabled || isLoading

  return (
    <div className="p-3 border-t border-forge-border">
      <div
        className={clsx(
          'flex gap-2 items-end rounded-2xl border p-2 transition-all',
          isDisabled
            ? 'border-forge-border bg-forge-surface/50'
            : 'border-forge-border bg-forge-surface hover:bg-forge-surface/70 focus-within:border-violet-600/60'

        )}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isLoading ? 'Building...' : placeholder}
          disabled={isDisabled}
          rows={1}
          aria-label="Chat prompt"
          aria-disabled={isDisabled}
          className={clsx(
            'flex-1 bb-textarea text-sm text-forge-text placeholder-forge-muted outline-none min-h-[20px] max-h-[120px] bg-transparent',
            isDisabled && 'cursor-not-allowed'
          )}
        />

        <button
          type="button"
          aria-label="Send message"
          onClick={onSubmit}
          disabled={!value.trim() || isDisabled}
          aria-disabled={!value.trim() || isDisabled}
          className={clsx(
            'bb-btn bb-btn-primary bb-btn-icon',
            value.trim() && !isDisabled
              ? ''
              : 'bg-violet-600/40 text-white/60 cursor-not-allowed'
          )}
        >
          <Send size={14} />
        </button>
      </div>
      <p className="text-[10px] text-forge-muted mt-1.5 text-center">
        Enter to send · Shift+Enter for new line
      </p>
    </div>
  )
}
