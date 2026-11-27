type FooterColumn = { title: string; links: { label: string; to: string }[] };

/**
 * Every link here must work for a logged-out visitor. With a real backend
 * (LIVE_MODE) the in-app routes (/demo → /command, /skills) sit behind
 * ProtectedRoute, so they're labelled as sign-in links. The mock-data builds
 * have no auth gate, so the same routes are a genuine public demo there.
 */
export function footerColumns(live: boolean): FooterColumn[] {
  return [
    {
      title: "Product",
      links: [
        { label: "How it works", to: "#product" },
        { label: "Platform", to: "#platform" },
        { label: "Pricing", to: "#pricing" },
        live ? { label: "Sign in to try it", to: "/login" } : { label: "Live demo", to: "/demo" },
      ],
    },
    {
      title: "Resources",
      links: [
        { label: "Documentation", to: "/docs" },
        { label: "FAQ", to: "#faq" },
        live ? { label: "Sign in for skills", to: "/login" } : { label: "Skills catalogue", to: "/skills" },
        { label: "Protocols", to: "/docs/protocols" },
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
    {
      title: "Legal",
      links: [
        { label: "Privacy", to: "/privacy" },
        { label: "Terms", to: "/terms" },
      ],
    },
  ];
}
