import { useState, useCallback } from 'react'
import { Copy, Check } from 'lucide-react'
import { toast } from 'react-hot-toast'

interface ClipboardCopyButtonProps {
  text: string
  onSuccess?: () => void
  onError?: (error: Error) => void
}

export function ClipboardCopyButton({ text, onSuccess, onError }: ClipboardCopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        toast.success('Copied to clipboard!')
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
          toast.success('Copied to clipboard!')
          onSuccess?.()
          setTimeout(() => setCopied(false), 2000)
        } catch (err) {
          throw new Error('Copy failed')
        } finally {
          document.body.removeChild(textarea)
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to copy')
      toast.error('Copy failed. Please try manually.')
      onError?.(error)
    }
  }, [text, onSuccess, onError])

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-base border border-border rounded-lg hover:bg-panel transition focus:outline-none focus:ring-2 focus:ring-accent"
      aria-label="Copy to clipboard"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}