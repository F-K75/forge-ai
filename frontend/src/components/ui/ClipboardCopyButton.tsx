import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Copy, Check } from 'lucide-react'
import { toast } from 'react-hot-toast'

interface ClipboardCopyButtonProps {
  text: string
  successMessage?: string
  className?: string
  onSuccess?: () => void
  onError?: (error: Error) => void
}

const DEFAULT_CLASSNAME =
  'flex items-center gap-1.5 px-3 py-1.5 text-xs bg-base border border-border rounded-lg hover:bg-panel focus:outline-none focus:ring-2 focus:ring-accent'

  export function ClipboardCopyButton({ text, successMessage = 'Copied', className, onSuccess, onError }: ClipboardCopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        toast.success(successMessage)
        onSuccess?.()
        setTimeout(() => setCopied(false), 2000)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        try {
          document.execCommand('copy')
          setCopied(true)
          toast.success(successMessage)
          onSuccess?.()
          setTimeout(() => setCopied(false), 2000)
        } catch {
          throw new Error('Copy failed')
        } finally {
          document.body.removeChild(textarea)
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to copy')
      toast.error("Copy failed — please try again.")
      onError?.(error)
    }
  }, [text, successMessage, onSuccess, onError])

  return (
    <motion.button
      type="button"
      onClick={handleCopy}
      className={className ?? DEFAULT_CLASSNAME}
      aria-label="Copy"
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
    >
      <AnimatePresence mode="wait">
        {copied ? (
          <motion.span
            key="check"
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0, rotate: 90 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
          >
            <Check className="w-3 h-3 text-ok" />
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            initial={{ scale: 0, rotate: 90 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0, rotate: -90 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
          >
            <Copy className="w-3 h-3" />
          </motion.span>
        )}
      </AnimatePresence>
      <AnimatePresence mode="wait">
        <motion.span
          key={copied ? "copied" : "copy-label"}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
        >
          {copied ? 'Copied' : 'Copy'}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  )
}
