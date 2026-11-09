import ErrorFallback from "./ErrorFallback"
import React, { Component, type ReactNode } from 'react'
import * as Sentry from '@sentry/react'
import { isChunkLoadError } from '../../lib/lazyRetry'

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

    // If dynamic chunk failed to load (e.g. dev server restarted, code update),
    // automatically trigger a one-time clean reload to fetch fresh bundles.
    if (isChunkLoadError(error) && typeof window !== 'undefined') {
      const reloadKey = `chunk_reload_${window.location.pathname}`
      const lastReload = sessionStorage.getItem(reloadKey)
      const now = Date.now()
      if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
        sessionStorage.setItem(reloadKey, now.toString())
        window.location.reload()
      }
    }
  }

  handleRetry = () => {
    if (isChunkLoadError(this.state.error) && typeof window !== 'undefined') {
      window.location.reload()
      return
    }
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

