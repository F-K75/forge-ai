import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { PillLink } from "./PillLink";
import { Reveal } from "./Reveal";
import { Wordmark } from "./LandingNav";
import { DOCS_URL } from "./landingContent";
import { GRAIN, rgba } from "./atmosphere";

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="relative overflow-hidden px-5 pb-32 pt-8 sm:px-8 sm:pb-40">
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[420px]"
        aria-hidden="true"
        style={{
          background: `radial-gradient(50% 70% at 50% 100%, ${rgba("ember", 0.22)} 0%, ${rgba("rust", 0.55)} 30%, ${rgba("rust", 0)} 70%)`,
        }}
      />
      <div className="pointer-events-none absolute inset-0 opacity-[0.06] mix-blend-overlay" aria-hidden="true" style={{ backgroundImage: GRAIN }} />
      <Reveal className="relative mx-auto max-w-2xl text-center">
        <h2 id="cta-title" className="text-balance text-[40px] font-medium leading-[1.02] tracking-[-0.04em] text-ink sm:text-[64px]">
          Your next idea already has a team.
        </h2>
        <p className="mx-auto mt-5 max-w-md text-balance text-[16px] text-muted">
          Start with 10 free credits. Your first build is on us.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <PillLink to="/signup" variant="primary" size="lg">
            Start building <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </PillLink>
          <PillLink to="/login" variant="secondary" size="lg">
            Sign in
          </PillLink>
        </div>
      </Reveal>
    </section>
  );
}

const COLUMNS: { title: string; links: { label: string; to: string; external?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "How it works", to: "#product" },
      { label: "Platform", to: "#platform" },
      { label: "Pricing", to: "#pricing" },
      { label: "Live demo", to: "/demo" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", to: DOCS_URL, external: true },
      { label: "FAQ", to: "#faq" },
      { label: "Skills catalogue", to: "/skills" },
      { label: "Protocols", to: "/protocols" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Create account", to: "/signup" },
      { label: "Sign in", to: "/login" },
      { label: "Reset password", to: "/forgot-password" },
    ],
  },
];

const linkCls =
  "rounded-sm text-[14px] text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function LandingFooter() {
  return (
    <footer className="border-t border-border-soft px-5 pb-10 pt-16 sm:px-8">
      <div className="mx-auto grid max-w-[1120px] gap-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-[260px] text-[14px] leading-[1.55] text-muted">
            The Agentic Software Engineering OS. From imagination to autonomous execution.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-[13px] font-medium text-ink">{col.title}</h2>
            <ul className="mt-4 space-y-3">
              {col.links.map((l) => (
                <li key={l.label}>
                  {l.to.startsWith("/") ? (
                    <Link to={l.to} className={linkCls}>
                      {l.label}
                    </Link>
                  ) : (
                    <a href={l.to} className={linkCls} {...(l.external ? { target: "_blank", rel: "noreferrer" } : {})}>
                      {l.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="mx-auto mt-16 flex max-w-[1120px] flex-wrap items-center justify-between gap-4 border-t border-border-soft pt-6 text-[13px] text-muted">
        <span>© {new Date().getFullYear()} Forge AI</span>
        <span className="font-mono">Built by agents, approved by people.</span>
      </div>
    </footer>
  );
}
