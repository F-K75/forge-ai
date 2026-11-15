import React from 'react'
import { motion } from 'motion/react'
import { useReducedMotion } from 'motion/react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { isChunkLoadError } from '../../lib/lazyRetry'

function ErrorFallback({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  const reduceMotion = useReducedMotion()
  const isChunk = isChunkLoadError(error)

  return (
    <div className="min-h-screen bg-base flex items-center justify-center p-4">
      <motion.div
        className="bg-panel border border-border shadow-m3-2 rounded-lg p-8 max-w-md w-full text-center"
        initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
      >
        <motion.div
          className="inline-flex items-center justify-center w-14 h-14 rounded-lg bg-error/10 border border-error/25 mb-4"
          animate={reduceMotion ? {} : {
            rotate: [0, -5, 5, -5, 0],
            transition: { repeat: 2, duration: 0.4 }
          }}
        >
          <AlertTriangle className="w-7 h-7 text-error" aria-hidden="true" />
        </motion.div>
        <h1 className="font-display text-lg font-semibold text-ink mb-2">
          {isChunk ? 'Application Update Available' : 'Something went wrong'}
        </h1>
        <p className="text-sm text-muted mb-5">
          {isChunk
            ? 'A newer version or updated module could not be loaded. Please reload the application.'
            : (error?.message || 'Something unexpected happened')}
        </p>
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-accent text-[#09090B] text-sm font-semibold hover:bg-ember-glow transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <RefreshCw size={14} />
          {isChunk ? 'Reload Application' : 'Retry'}
        </button>
      </motion.div>
    </div>
  )
}

export default ErrorFallback
