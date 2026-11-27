import { useMemo } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { SafeMarkdown } from "../../components/ui/SafeMarkdown"
import { extractHeadings } from "../../components/ui/markdown"
import { DocsSideNav, LastUpdated, PublicPage, ReadingHeader, TableOfContents } from "../../components/public/ReadingLayout"
import { findDoc, prepareDoc, resolveDocLink } from "../../content"
import { docsNavItems } from "./docsNav"

/** /docs/:slug: one curated doc in the reading layout, with the docs nav on the left. */
export default function DocPage() {
  const { slug } = useParams<{ slug: string }>()
  const doc = findDoc(slug)
  const prepared = useMemo(() => (doc ? prepareDoc(doc.raw, doc.omitSections) : null), [doc])
  const headings = useMemo(() => (prepared ? extractHeadings(prepared.body) : []), [prepared])
  const current = doc ? `/docs/${doc.slug}` : ""

  return (
    <PublicPage>
      <div className="mx-auto grid max-w-[1120px] grid-cols-1 gap-10 lg:grid-cols-[180px_minmax(0,1fr)] xl:grid-cols-[180px_minmax(0,1fr)_180px]">
        <aside className="min-w-0">
          <DocsSideNav items={docsNavItems()} current={current} />
        </aside>
        {doc && prepared ? (
          <>
            <article className="min-w-0">
              <ReadingHeader
                eyebrow="Docs"
                title={doc.title}
                tagline={doc.tagline}
                meta={prepared.lastUpdated ? <LastUpdated date={prepared.lastUpdated} /> : <p>{doc.summary}</p>}
              />
              <div className="xl:hidden">
                <TableOfContents headings={headings} variant="inline" />
              </div>
              <SafeMarkdown source={prepared.body} variant="prose" links resolveLink={resolveDocLink} />
            </article>
            <aside className="hidden xl:block">
              <TableOfContents headings={headings} variant="rail" />
            </aside>
          </>
        ) : (
          <div className="min-w-0">
            <ReadingHeader eyebrow="Docs" title="Page not found." tagline="It may have moved." />
            <Link
              to="/docs"
              className="inline-flex items-center gap-2 rounded-pill border border-glass-border bg-glass px-4 py-2 text-[13px] text-ink hover:bg-ink/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All docs
            </Link>
          </div>
        )}
      </div>
    </PublicPage>
  )
}
