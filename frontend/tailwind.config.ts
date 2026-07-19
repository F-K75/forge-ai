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
        // "Ember" is the app-wide accent — `ember`/`ember-glow` and
        // `accent`/`accent-soft` are intentionally the same color under two
        // names: `accent` is the original, broadly-used semantic token;
        // `ember` is used where a named warm identity reads more clearly
        // (e.g. gradient-ember). Keep both in sync if this ever changes.
        accent:        "#E8823C",
        "accent-soft": "rgba(232,130,60,0.12)",
        ok:            "#34D399",
        warn:          "#F59E0B",
        error:         "#EF4444",

        ember:        "#E8823C",
        "ember-glow": "#F4A261",

        // One orange family (matching ember/ember-glow above), light to
        // dark — kept in sync with src/lib/agents.ts, src/lib/theme.ts, and
        // src/components/charts/palette.ts. Do not hand-retype elsewhere.
        "agent-architect":         "#F4A261",
        "agent-business-improver": "#F0934D",
        "agent-designer":          "#E8823C",
        "agent-developer":         "#D9722C",
        "agent-integration":       "#C2631F",
        "agent-pm":                "#A85423",

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
        brand: ['"Bricolage Grotesque"', '"Space Grotesk"', "Inter", "sans-serif"],
        raster: ['"Press Start 2P"', '"JetBrains Mono"', "ui-monospace", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
} satisfies Config;
