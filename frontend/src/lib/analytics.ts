/**
 * Analytics configuration for Forge AI.
 * Uses PostHog for product analytics.
 *
 * To enable: set VITE_POSTHOG_KEY and VITE_POSTHOG_HOST in your .env
 * PostHog is fail-open: if not configured, all calls are no-ops.
 */

import posthog from 'posthog-js'

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || ''
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com'

let initialized = false

export function initAnalytics(): void {
  if (!POSTHOG_KEY) {
    console.log('[analytics] PostHog not configured — skipping initialization')
    return
  }

  try {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      capture_pageview: true,
      autocapture: true,
      loaded: () => {
        initialized = true
        console.log('[analytics] PostHog initialized')
      },
    })
  } catch (err) {
    console.warn('[analytics] Failed to initialize PostHog:', err)
  }
}

export function captureEvent(event: string, properties?: Record<string, unknown>): void {
  if (!initialized) return
  try {
    posthog.capture(event, properties)
  } catch {
    // fail open
  }
}

export function identifyUser(userId: string, traits?: Record<string, unknown>): void {
  if (!initialized) return
  try {
    posthog.identify(userId, traits)
  } catch {
    // fail open
  }
}

export function resetAnalytics(): void {
  if (!initialized) return
  try {
    posthog.reset()
  } catch {
    // fail open
  }
}