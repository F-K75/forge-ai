import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base:          "#0A0A0F",
        panel:         "#13131B",
        "panel-alt":   "#0F0F16",
        border:        "#22222E",
        "border-soft": "#1A1A24",
        ink:           "#E8E8F0",
        muted:         "#8B8B9E",
        faint:         "#5A5A6B",
        accent:        "#7C5CFF",
        "accent-soft": "rgba(124,92,255,0.12)",
        ok:            "#34D399",
        warn:          "#F59E0B",
        error:         "#EF4444",
        "agent-architect":         "#6366F1",
        "agent-business-improver": "#EC4899",
        "agent-designer":          "#A855F7",
        "agent-developer":         "#22D3EE",
        "agent-integration":       "#F59E0B",
        "agent-pm":                "#34D399",

        // Public/pre-auth surface palette (landing + sign-in/up) — namespaced
        // with "land-" so it can diverge from the authenticated app's dark
        // tokens above. Values are ported directly from the user's Lovable
        // design (src/index.css CSS variables), a minimalist mono theme with
        // a single restrained blue accent. The <alpha-value> placeholder lets
        // Tailwind opacity modifiers (e.g. text-land-muted/60) work correctly.
        // Do not rename these to bare "ink"/"accent"/etc: 15+ app files rely
        // on the dark values already bound to those names.
        "land-paper":       "hsl(0 0% 4% / <alpha-value>)",     // --background
        "land-surface":     "hsl(0 0% 6% / <alpha-value>)",     // --card
        "land-muted-bg":    "hsl(0 0% 9% / <alpha-value>)",     // --muted
        "land-border":      "hsl(0 0% 12% / <alpha-value>)",    // --border
        "land-ink":         "hsl(0 0% 96% / <alpha-value>)",    // --foreground
        "land-muted":       "hsl(0 0% 55% / <alpha-value>)",    // --muted-foreground
        "land-accent":      "hsl(217 90% 62% / <alpha-value>)", // --accent
        "land-destructive": "hsl(0 70% 55% / <alpha-value>)",   // --destructive
      },
      fontFamily: {
        display: ['"Space Grotesk"', "Inter", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
} satisfies Config;
