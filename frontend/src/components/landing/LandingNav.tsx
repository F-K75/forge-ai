import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { PillLink } from "./PillLink";
import { useLandingHref } from "./useLandingHref";

const LINKS = [
  { label: "Product", href: "#product" },
  { label: "Agents", href: "#platform" },
  { label: "Pricing", href: "#pricing" },
  { label: "Docs", href: "/docs" },
];

export function Wordmark() {
  return (
    <Link
      to="/home"
      className="flex shrink-0 items-center gap-2.5 rounded-pill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      aria-label="Forge AI home"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-md border border-glass-border bg-glass">
        <img src="/forge.svg" alt="" className="h-4 w-4" />
      </span>
      <span className="text-[15px] font-medium tracking-[-0.02em] text-ink">Forge AI</span>
    </Link>
  );
}

const navCls =
  "rounded-pill px-3 py-1.5 text-[14px] transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

function NavAnchor({ label, href, onClick }: (typeof LINKS)[number] & { onClick?: () => void }) {
  const { pathname } = useLocation();
  const toHref = useLandingHref();
  const resolved = toHref(href);
  if (!resolved.startsWith("/")) {
    return (
      <a href={resolved} onClick={onClick} className={`${navCls} text-ink/80`}>
        {label}
      </a>
    );
  }
  // Off the landing page a section link is a route change; the landing page
  // scrolls to the hash once it mounts.
  const active = !resolved.includes("#") && (pathname === resolved || pathname.startsWith(`${resolved}/`));
  return (
    <Link
      to={resolved}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`${navCls} ${active ? "bg-ink/[0.06] text-ink" : "text-ink/80"}`}
    >
      {label}
    </Link>
  );
}

export function LandingNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b transition-colors duration-slow ${
        scrolled || open
          ? "border-glass-border bg-base/70 backdrop-blur-xl"
          : "border-transparent bg-glass/0 backdrop-blur-[2px]"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between gap-4 px-5 sm:px-8">
        <Wordmark />

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <NavAnchor key={l.label} {...l} />
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <PillLink to="/signup" variant="secondary" size="sm" className="hidden sm:inline-flex">
            Start building
          </PillLink>
          <PillLink to="/login" variant="primary" size="sm">
            Sign in
          </PillLink>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-pill border border-glass-border bg-glass text-ink md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-expanded={open}
            aria-controls="landing-mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </div>

      {open && (
        <nav
          id="landing-mobile-menu"
          aria-label="Mobile"
          className="flex flex-col gap-1 border-t border-glass-border px-5 pb-5 pt-3 md:hidden"
        >
          {LINKS.map((l) => (
            <NavAnchor key={l.label} {...l} onClick={() => setOpen(false)} />
          ))}
          <PillLink to="/signup" variant="secondary" size="md" className="mt-2 sm:hidden">
            Start building
          </PillLink>
        </nav>
      )}
    </header>
  );
}
