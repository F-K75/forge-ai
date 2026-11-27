import { Link } from "react-router-dom"
import { ArrowUpRight } from "lucide-react"
import { DocsSideNav, PublicPage, ReadingHeader } from "../../components/public/ReadingLayout"
import { PUBLIC_DOCS } from "../../content"
import { docsNavItems } from "./docsNav"

/** /docs: the public documentation hub. */
export default function DocsHubPage() {
  return (
    <PublicPage>
      <div className="mx-auto grid max-w-[1120px] grid-cols-1 gap-10 lg:grid-cols-[180px_minmax(0,1fr)] xl:grid-cols-[180px_minmax(0,1fr)_180px]">
        <aside className="min-w-0">
          <DocsSideNav items={docsNavItems()} current="/docs" />
        </aside>
        <div className="min-w-0">
          <ReadingHeader
            eyebrow="Docs"
            title="Documentation."
            tagline="How Forge works, in depth."
            meta={<p>Architecture, the API and integrations, written for people building with Forge.</p>}
          />
          <ul className="grid gap-3 sm:grid-cols-2">
            {PUBLIC_DOCS.map((doc, i) => (
              <li key={doc.slug}>
                <Link
                  to={`/docs/${doc.slug}`}
                  className="group flex h-full flex-col rounded-xl border border-border bg-panel p-5 transition-colors hover:border-glass-border hover:bg-panel-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="flex items-center justify-between">
                    <span className="font-mono text-xs tabular-nums text-faint">{String(i + 1).padStart(2, "0")}</span>
                    <ArrowUpRight
                      className="h-4 w-4 text-faint transition-colors group-hover:text-ink"
                      aria-hidden="true"
                    />
                  </span>
                  <span className="mt-6 text-[17px] font-medium tracking-[-0.015em] text-ink">
                    {doc.title.replace(/\.$/, "")}
                  </span>
                  <span className="mt-1.5 text-caption leading-relaxed text-muted">{doc.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
          <section aria-labelledby="docs-legal" className="mt-14 border-t border-border-soft pt-8">
            <h2 id="docs-legal" className="text-caption font-medium text-ink">
              Legal
            </h2>
            <p className="mt-2 text-caption text-muted">
              Read the{" "}
              <Link to="/privacy" className="text-ink underline decoration-ink/30 underline-offset-[3px] hover:decoration-accent">
                Privacy Policy
              </Link>{" "}
              and the{" "}
              <Link to="/terms" className="text-ink underline decoration-ink/30 underline-offset-[3px] hover:decoration-accent">
                Terms of Service
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </PublicPage>
  )
}
