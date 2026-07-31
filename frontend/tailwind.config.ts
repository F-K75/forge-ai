import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Apple-inspired semantic tokens (light default).
        base:          "#F5F5F7",
        panel:         "#FFFFFF",
        "panel-alt":   "#FBFBFD",
        border:        "rgba(0,0,0,0.08)",
        "border-soft": "rgba(0,0,0,0.05)",
        ink:           "#1D1D1F",
        muted:         "#6E6E73",
        faint:         "#A1A1A6",
        accent:        "#0071E3",
        "accent-soft": "rgba(0,113,227,0.10)",
        ok:            "#30D158",
        warn:          "#FF9F0A",
        error:         "#FF453A",

        // Legacy alias — maps to Apple blue for existing ember classes.
        ember:        "#0071E3",
        "ember-glow": "#2997FF",

        "agent-architect":         "#0071E3",
        "agent-business-improver": "#5E5CE6",
        "agent-designer":          "#BF5AF2",
        "agent-developer":         "#30D158",
        "agent-integration":       "#64D2FF",
        "agent-pm":                "#FF9F0A",

        "land-paper":       "hsl(240 6% 97% / <alpha-value>)",
        "land-surface":     "hsl(0 0% 100% / <alpha-value>)",
        "land-muted-bg":    "hsl(240 5% 96% / <alpha-value>)",
        "land-border":      "hsl(240 5% 90% / <alpha-value>)",
        "land-ink":         "hsl(240 6% 10% / <alpha-value>)",
        "land-muted":       "hsl(240 4% 46% / <alpha-value>)",
        "land-accent":      "hsl(211 100% 45% / <alpha-value>)",
        "land-destructive": "hsl(3 100% 62% / <alpha-value>)",
      },
      fontFamily: {
        display: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Display"',
          '"Segoe UI"',
          "system-ui",
          "sans-serif",
        ],
        brand: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Display"',
          "system-ui",
          "sans-serif",
        ],
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Text"',
          '"Segoe UI"',
          "system-ui",
          "sans-serif",
        ],
        mono: [
          '"SF Mono"',
          "ui-monospace",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
        raster: ['"SF Mono"', "ui-monospace", "monospace"],
      },
      borderRadius: {
        apple: "20px",
        "apple-lg": "28px",
        "apple-xl": "32px",
      },
      boxShadow: {
        apple: "0 2px 16px rgba(0,0,0,0.06), 0 0 1px rgba(0,0,0,0.08)",
        "apple-lg": "0 12px 40px rgba(0,0,0,0.10), 0 0 1px rgba(0,0,0,0.06)",
        "apple-float": "0 8px 30px rgba(0,0,0,0.12), 0 0 1px rgba(0,0,0,0.08)",
      },
      maxWidth: {
        content: "1400px",
      },
      transitionTimingFunction: {
        apple: "cubic-bezier(0.25, 0.1, 0.25, 1)",
        spring: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
} satisfies Config;
