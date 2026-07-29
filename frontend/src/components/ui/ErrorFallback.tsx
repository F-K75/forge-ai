import React from 'react'
import { motion } from 'motion/react'
import { useReducedMotion } from 'motion/react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

function ErrorFallback({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  const reduceMotion = useReducedMotion()

  return (
    <div className="min-h-screen bg-base flex items-center justify-center p-4">
      <motion.div
        className="glass-strong rounded-2xl p-8 max-w-md w-full text-center"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
      >
        <motion.div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 mb-4"
          animate={reduceMotion ? {} : {
            rotate: [0, -5, 5, -5, 0],
            transition: { repeat: 2, duration: 0.4 }
          }}
        >
          <AlertTriangle className="w-8 h-8 text-red-400" aria-hidden="true" />
        </motion.div>
        <h1 className="font-display text-xl font-medium text-ink mb-2">Something went wrong</h1>
        <p className="text-sm text-muted mb-4">{error?.message || 'An unexpected error occurred'}</p>
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-ink text-base text-sm font-medium hover:bg-ink/90 transition-colors"
        >
          <RefreshCw size={14} />
          Retry
        </button>
      </motion.div>
    </div>
  )
}

export default ErrorFallback
