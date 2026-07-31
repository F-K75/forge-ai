import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Graphite OS palette — cool greys only (no warm ember).
        base:          "#09090B",
        panel:         "#121214",
        "panel-alt":   "#0E0E10",
        border:        "#2A2A2E",
        "border-soft": "#1C1C1F",
        ink:           "#F4F4F5",
        muted:         "#A1A1AA",
        faint:         "#71717A",
        // Accent aliases kept as `accent`/`ember` so existing class names
        // keep working — both now resolve to silver grey.
        accent:        "#D4D4D8",
        "accent-soft": "rgba(212,212,216,0.12)",
        ok:            "#A1A1AA",
        warn:          "#D4D4D8",
        error:         "#A1A1AA",

        ember:        "#D4D4D8",
        "ember-glow": "#F4F4F5",

        // Agent identity = light→dark greyscale ramp (same family).
        "agent-architect":         "#F4F4F5",
        "agent-business-improver": "#E4E4E7",
        "agent-designer":          "#D4D4D8",
        "agent-developer":         "#A1A1AA",
        "agent-integration":       "#71717A",
        "agent-pm":                "#52525B",

        "land-paper":       "hsl(0 0% 4% / <alpha-value>)",
        "land-surface":     "hsl(0 0% 6% / <alpha-value>)",
        "land-muted-bg":    "hsl(0 0% 9% / <alpha-value>)",
        "land-border":      "hsl(0 0% 12% / <alpha-value>)",
        "land-ink":         "hsl(0 0% 96% / <alpha-value>)",
        "land-muted":       "hsl(0 0% 55% / <alpha-value>)",
        "land-accent":      "hsl(0 0% 72% / <alpha-value>)",
        "land-destructive": "hsl(0 0% 45% / <alpha-value>)",
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
