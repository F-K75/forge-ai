import React, { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

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
        <div className="min-h-screen bg-base flex items-center justify-center p-4">
          <div className="bg-panel border border-border rounded-2xl p-8 max-w-md w-full text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 mb-4">
              <AlertTriangle className="w-8 h-8 text-red-400" aria-hidden="true" />
            </div>
            <h2 className="text-xl font-bold text-ink mb-2">Something went wrong</h2>
            <p className="text-sm text-muted mb-6">
              {this.state.error?.message || 'An unexpected error occurred. Please try again.'}
            </p>
            <button
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:opacity-90 text-white rounded-xl transition focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <RefreshCw size={14} aria-hidden="true" />
              Try again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}