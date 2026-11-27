import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { PillLink } from "./PillLink";
import { Reveal } from "./Reveal";
import { Wordmark } from "./LandingNav";
import { GRAIN, rgba } from "./atmosphere";
import { useLandingHref } from "./useLandingHref";
import { footerColumns } from "./footerLinks";
import { LIVE_MODE } from "../../lib/env";

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

const linkCls =
  "rounded-sm text-[14px] text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function LandingFooter() {
  const toHref = useLandingHref();
  return (
    <footer className="border-t border-border-soft px-5 pb-10 pt-16 sm:px-8">
      <div className="mx-auto grid max-w-[1120px] grid-cols-2 gap-x-6 gap-y-12 md:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div className="col-span-2 md:col-span-1">
          <Wordmark />
          <p className="mt-4 max-w-[260px] text-[14px] leading-[1.55] text-muted">
            The Agentic Software Engineering OS. From imagination to autonomous execution.
          </p>
        </div>
        {footerColumns(LIVE_MODE).map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-[13px] font-medium text-ink">{col.title}</h2>
            <ul className="mt-4 space-y-3">
              {col.links.map((l) => {
                const href = toHref(l.to);
                return (
                  <li key={l.label}>
                    {href.startsWith("/") ? (
                      <Link to={href} className={linkCls}>
                        {l.label}
                      </Link>
                    ) : (
                      <a href={href} className={linkCls}>
                        {l.label}
                      </a>
                    )}
                  </li>
                );
              })}
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
