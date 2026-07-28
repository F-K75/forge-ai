const CONSENT_KEY = 'forge_consent'

export type ConsentPreferences = {
  necessary: boolean
  analytics: boolean
  marketing: boolean
  timestamp: number
}

export function getConsent(): ConsentPreferences | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY)
    if (!raw) return null
    return JSON.parse(raw) as ConsentPreferences
  } catch {
    return null
  }
}

export function setConsent(prefs: Partial<ConsentPreferences>): ConsentPreferences {
  const existing = getConsent()
  const next: ConsentPreferences = {
    necessary: true,
    analytics: existing?.analytics ?? false,
    marketing: existing?.marketing ?? false,
    timestamp: Date.now(),
    ...prefs,
  }
  localStorage.setItem(CONSENT_KEY, JSON.stringify(next))
  return next
}

export function hasAnalyticsConsent(): boolean {
  const consent = getConsent()
  return consent?.analytics ?? false
}

export function hasMarketingConsent(): boolean {
  const consent = getConsent()
  return consent?.marketing ?? false
}
