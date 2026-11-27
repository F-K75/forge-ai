import { useMemo } from "react"
import { Link } from "react-router-dom"
import { SafeMarkdown } from "../../components/ui/SafeMarkdown"
import { extractHeadings } from "../../components/ui/markdown"
import { LastUpdated, PublicPage, ReadingHeader, TableOfContents } from "../../components/public/ReadingLayout"
import { LEGAL_DOCS, prepareDoc, resolveDocLink, type LegalDoc } from "../../content"

/** /privacy and /terms: the repo-root legal documents, rendered verbatim. */
export default function LegalPage({ slug }: { slug: LegalDoc["slug"] }) {
  const doc = LEGAL_DOCS[slug]
  const other = LEGAL_DOCS[slug === "privacy" ? "terms" : "privacy"]
  const { body, lastUpdated } = useMemo(() => prepareDoc(doc.raw), [doc.raw])
  const headings = useMemo(() => extractHeadings(body), [body])

  return (
    <PublicPage>
      <div className="mx-auto grid max-w-[1000px] grid-cols-1 gap-16 lg:grid-cols-[minmax(0,720px)_200px]">
        <article className="min-w-0">
          <ReadingHeader
            eyebrow="Legal"
            title={doc.title}
            tagline={doc.tagline}
            meta={lastUpdated ? <LastUpdated date={lastUpdated} /> : undefined}
          />
          <div className="lg:hidden">
            <TableOfContents headings={headings} variant="inline" />
          </div>
          <SafeMarkdown source={body} variant="prose" links resolveLink={resolveDocLink} />
          <p className="mt-14 border-t border-border-soft pt-6 text-caption text-muted">
            See also the{" "}
            <Link
              to={`/${other.slug}`}
              className="text-ink underline decoration-ink/30 underline-offset-[3px] hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {other.title.replace(/\.$/, "")}
            </Link>
            .
          </p>
        </article>
        <aside className="hidden lg:block">
          <TableOfContents headings={headings} variant="rail" />
        </aside>
      </div>
    </PublicPage>
  )
}
