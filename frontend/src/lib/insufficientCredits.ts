// A 402 from POST /v1/builds/ (B1-9). Two shapes reach the client:
//
//   legacy (backend/api/builds.py today):
//     {"detail": "Insufficient credits"}
//     {"detail": "Your trial has expired. Please upgrade to continue building."}
//   structured (after the guardrails/usage integration):
//     {"detail": {"code": "insufficient_credits", "required": 27, "available": 12,
//                 "breakdown": [{"label": "...", "credits": 7}]}}
//
// Amounts are only ever shown as the server reports them; the client never
// computes a reservation itself (the formula is derived from server settings).

export interface CreditBreakdownItem {
  label: string
  credits: number
}

export interface InsufficientCredits {
  /** `insufficient_credits` for the structured shape; null for a legacy string. */
  code: string | null
  /** True when the 402 is about credits (rather than e.g. an expired trial). */
  isCreditShortfall: boolean
  message: string
  required: number | null
  available: number | null
  breakdown: CreditBreakdownItem[]
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const amount = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export const DEFAULT_SHORTFALL_MESSAGE = 'You don’t have enough credits to start this build.'

export function parseInsufficientCredits(err: unknown): InsufficientCredits | null {
  const response = isObj(err) && isObj(err.response) ? err.response : null
  if (!response || response.status !== 402) return null
  const detail = isObj(response.data) ? response.data.detail : undefined

  if (typeof detail === 'string') {
    const isCreditShortfall = /credit/i.test(detail)
    return {
      code: null,
      isCreditShortfall,
      message: isCreditShortfall ? DEFAULT_SHORTFALL_MESSAGE : detail,
      required: null,
      available: null,
      breakdown: [],
    }
  }

  if (isObj(detail)) {
    const code = typeof detail.code === 'string' ? detail.code : null
    const breakdown = Array.isArray(detail.breakdown)
      ? detail.breakdown
          .filter(isObj)
          .map((b) => ({ label: typeof b.label === 'string' ? b.label : '', credits: amount(b.credits) }))
          .filter((b): b is CreditBreakdownItem => b.label !== '' && b.credits !== null)
      : []
    const isCreditShortfall = code === 'insufficient_credits' || code === null
    return {
      code,
      isCreditShortfall,
      message:
        typeof detail.message === 'string' && detail.message ? detail.message : isCreditShortfall ? DEFAULT_SHORTFALL_MESSAGE : 'Payment is required to start this build.',
      required: amount(detail.required),
      available: amount(detail.available),
      breakdown,
    }
  }

  return { code: null, isCreditShortfall: true, message: DEFAULT_SHORTFALL_MESSAGE, required: null, available: null, breakdown: [] }
}
