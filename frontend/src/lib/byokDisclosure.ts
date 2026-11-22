// BYOK billing disclosure (plan Revision 3 §5.6, owner decision U9, test B1-8).
//
// The copy below is the plan's DRAFT for product and legal approval. Do not
// reword it here: changes go through that approval. Until it is approved the
// disclosure ships switched off; set VITE_BYOK_DISCLOSURE=true at build time
// to turn it on (e.g. on staging for review), and flip the default once the
// copy is approved.

export const BYOK_DISCLOSURE_ENABLED: boolean = import.meta.env.VITE_BYOK_DISCLOSURE === "true"

export const BYOK_DISCLOSURE_TITLE = "Using your own API key."

export const BYOK_DISCLOSURE_BODY =
  "Requests Forge sends with your key are billed by your provider, including requests that fail. " +
  "Forge does not charge credits for them and cannot refund provider charges. " +
  "Forge never switches to its own key during your build. " +
  "Automatic retries and repairs on your key are off unless you turn them on, " +
  "and Forge’s own models will not process your content unless you opt in."

interface ByokUser {
  plan?: string
  byok_connected?: boolean
}

/**
 * Whether this user's builds run on their own key. Mirrors the backend's
 * Orchestrator._is_byok_active: a stored key on a Pro or Enterprise plan.
 */
export function isByokUser(user: ByokUser | null | undefined): boolean {
  return Boolean(user?.byok_connected) && (user?.plan === "pro" || user?.plan === "enterprise")
}
