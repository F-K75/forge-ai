/**
 * Public legal pages and docs, rendered from markdown.
 *
 * The .md files in this folder are byte-for-byte copies of files at the repo
 * root (the frontend Docker build only sees frontend/, so they can't be
 * imported from ../). `content.drift.test.ts` fails if a copy drifts from its
 * source; re-copy with the `source` paths below.
 *
 * Only a curated, user-facing set of docs is public. Excluded on purpose:
 * CONFIGURATION.md (env vars, secrets, production validators, CI escape
 * hatches), DEPLOYMENT_AND_OPERATIONS.md, GSTACK_RELEASE_PIPELINE.md,
 * secrets.md, FIELD_ENCRYPTION_KEY_ROTATION.md, SECRET_HISTORY_PURGE.md,
 * disaster_recovery.md (internal ops / secret handling), icp.md and
 * portfolio-mirror.md (internal go-to-market), audits, architecture reviews and
 * docs/archive (internal history), and docs/README.md (an index of the above).
 * Within public docs, `omitSections` drops h2 sections that describe internal
 * operations (admin endpoints, metrics scraping, CORS and key handling).
 */
import privacySource from "./legal/PRIVACY_POLICY.md?raw"
import termsSource from "./legal/TERMS_OF_SERVICE.md?raw"
import architectureSource from "./docs/ARCHITECTURE.md?raw"
import apiSource from "./docs/API_REFERENCE.md?raw"
import monitoringSource from "./docs/monitoring_webhook.md?raw"
import protocolsSource from "./docs/ADR-protocol-deferral.md?raw"

export interface PublicDoc {
  slug: string
  /** Two-tone title: `title` in ink, `tagline` in muted. */
  title: string
  tagline: string
  /** One line for the docs hub. */
  summary: string
  /** Repo-root path of the original (the drift test compares against it). */
  source: string
  /** Path of the copy, relative to src/content. */
  copy: string
  raw: string
  /** h2 headings (prefix match) left out of the public page. */
  omitSections?: string[]
}

export interface LegalDoc {
  slug: "privacy" | "terms"
  title: string
  tagline: string
  source: string
  copy: string
  raw: string
}

export const LEGAL_DOCS: Record<LegalDoc["slug"], LegalDoc> = {
  privacy: {
    slug: "privacy",
    title: "Privacy Policy.",
    tagline: "What we collect and why.",
    source: "PRIVACY_POLICY.md",
    copy: "legal/PRIVACY_POLICY.md",
    raw: privacySource,
  },
  terms: {
    slug: "terms",
    title: "Terms of Service.",
    tagline: "The rules for using Forge.",
    source: "TERMS_OF_SERVICE.md",
    copy: "legal/TERMS_OF_SERVICE.md",
    raw: termsSource,
  },
}

export const PUBLIC_DOCS: PublicDoc[] = [
  {
    slug: "architecture",
    title: "How Forge works.",
    tagline: "Agents, pipelines and data flow.",
    summary: "The build pipeline, the agile PM layer, LLM routing, billing and the frontend.",
    source: "docs/ARCHITECTURE.md",
    copy: "docs/ARCHITECTURE.md",
    raw: architectureSource,
    omitSections: ["Deployment targets", "Backend cross-cutting concerns"],
  },
  {
    slug: "api-reference",
    title: "API reference.",
    tagline: "Every route, one page.",
    summary: "REST and WebSocket endpoints for builds, projects, the PM layer, billing and the engineering org.",
    source: "docs/API_REFERENCE.md",
    copy: "docs/API_REFERENCE.md",
    raw: apiSource,
    omitSections: ["Admin", "LLM management", "Operational endpoints"],
  },
  {
    slug: "ci-monitoring",
    title: "CI monitoring.",
    tagline: "Report failures into Forge.",
    summary: "Send CI, scanner and linter findings to a project with an API key, and let Forge escalate them.",
    source: "docs/integrations/monitoring_webhook.md",
    copy: "docs/monitoring_webhook.md",
    raw: monitoringSource,
    omitSections: ["Infrastructure alerts", "Scraping /metrics"],
  },
  {
    slug: "protocols",
    title: "Agent protocols.",
    tagline: "What's live and what waits.",
    summary: "Which agent protocols Forge supports today, and the bar a deferred protocol must clear.",
    source: "docs/architecture/ADR-protocol-deferral.md",
    copy: "docs/ADR-protocol-deferral.md",
    raw: protocolsSource,
  },
]

export function findDoc(slug: string | undefined): PublicDoc | undefined {
  return PUBLIC_DOCS.find((d) => d.slug === slug)
}

export interface PreparedDoc {
  body: string
  lastUpdated: string | null
}

const LAST_UPDATED_RE = /^\s*\*\*Last Updated:?\*\*:?\s*(.+?)\s*$/i

/**
 * Strip what the page chrome renders itself (the leading h1 and a
 * "**Last Updated:** …" line) and drop omitted h2 sections. Fenced code is
 * never treated as a heading.
 */
export function prepareDoc(raw: string, omitSections: string[] = []): PreparedDoc {
  const lines = raw.replace(/\r\n/g, "\n").split("\n")
  const out: string[] = []
  let lastUpdated: string | null = null
  let inFence = false
  let skipping = false
  let seenH1 = false
  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence
    if (!inFence && !/^\s*```/.test(line)) {
      const h = line.match(/^(#{1,6})\s+(.*)$/)
      if (h && h[1].length === 1 && !seenH1) {
        seenH1 = true
        continue
      }
      if (h && h[1].length <= 2) {
        const text = h[2].trim()
        skipping = omitSections.some((s) => text.startsWith(s))
      }
      const lu: RegExpMatchArray | null = lastUpdated ? null : line.match(LAST_UPDATED_RE)
      if (lu) {
        lastUpdated = lu[1]
        continue
      }
    }
    if (!skipping) out.push(line)
  }
  return { body: out.join("\n").trim(), lastUpdated }
}

/**
 * Map a link target found in a public doc to a public route, or null (render
 * as text) when it points at a repo file that isn't published.
 */
export function resolveDocLink(href: string): string | null {
  if (/^(https?:|mailto:|#|\/)/i.test(href)) return href
  const file = href.split("#")[0].split("/").pop()
  const doc = PUBLIC_DOCS.find((d) => d.source.split("/").pop() === file)
  if (doc) return `/docs/${doc.slug}`
  if (file === "PRIVACY_POLICY.md") return "/privacy"
  if (file === "TERMS_OF_SERVICE.md") return "/terms"
  return null
}
