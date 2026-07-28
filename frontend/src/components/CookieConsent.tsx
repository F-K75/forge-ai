import { useState, useEffect } from 'react'
import { setConsent, hasAnalyticsConsent } from '../lib/consent'

export default function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const consent = localStorage.getItem('forge_consent')
    if (!consent) {
      setVisible(true)
    }
  }, [])

  const acceptAll = () => {
    setConsent({ analytics: true, marketing: true })
    setVisible(false)
    window.dispatchEvent(new CustomEvent('consent-updated'))
  }

  const acceptEssential = () => {
    setConsent({ analytics: false, marketing: false })
    setVisible(false)
    window.dispatchEvent(new CustomEvent('consent-updated'))
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-base/95 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">
            We use essential cookies for authentication and analytics cookies to improve your experience.
            See our{' '}
            <a href="/privacy" className="text-accent underline">Privacy Policy</a> and{' '}
            <a href="/terms" className="text-accent underline">Terms of Service</a>.
          </p>
          <div className="flex gap-3">
            <button
              onClick={acceptEssential}
              className="rounded-md px-4 py-2 text-sm font-medium text-muted hover:text-fg border border-border"
            >
              Essential only
            </button>
            <button
              onClick={acceptAll}
              className="rounded-md px-4 py-2 text-sm font-medium bg-accent text-base hover:bg-accent/90"
            >
              Accept all
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
