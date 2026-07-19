import React, { Component, type ReactNode } from 'react'
import * as Sentry from '@sentry/react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { motion } from 'motion/react'
import { useReducedMotion } from 'motion/react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
    Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } })
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <ErrorFallback error={this.state.error} onRetry={this.handleRetry} />
      )
    }

    return this.props.children
  }
}

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
        <motion.h2
          className="text-xl font-bold text-ink mb-2"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          Something went wrong
        </motion.h2>
        <motion.p
          className="text-sm text-muted mb-6"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          {error?.message || 'Something broke on our end, not yours. Try again in a moment.'}
        </motion.p>
        <motion.button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:opacity-90 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-accent"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          whileHover={reduceMotion ? {} : { scale: 1.04 }}
          whileTap={reduceMotion ? {} : { scale: 0.96 }}
        >
          <RefreshCw size={14} aria-hidden="true" />
          Try again
        </motion.button>
      </motion.div>
    </div>
  )
}
