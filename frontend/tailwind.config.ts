import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "rgb(var(--bg) / <alpha-value>)",
        panel: "rgb(var(--bg-elevated) / <alpha-value>)",
        "panel-alt": "rgb(var(--bg-subtle) / <alpha-value>)",
        border: "rgb(var(--border) / var(--border-alpha))",
        "border-soft": "rgb(var(--border) / var(--border-soft-alpha))",
        ink: "rgb(var(--text) / <alpha-value>)",
        muted: "rgb(var(--text-secondary) / <alpha-value>)",
        faint: "rgb(var(--muted) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-soft": "var(--accent-soft)",
        ok: "rgb(var(--success) / <alpha-value>)",
        warn: "rgb(var(--warning) / <alpha-value>)",
        error: "rgb(var(--error) / <alpha-value>)",
        ember: "rgb(var(--accent) / <alpha-value>)",
        "ember-glow": "rgb(var(--accent-hover) / <alpha-value>)",

        "agent-architect": "#0A84FF",
        "agent-business-improver": "#5E5CE6",
        "agent-designer": "#BF5AF2",
        "agent-developer": "#30D158",
        "agent-integration": "#64D2FF",
        "agent-pm": "#FF9F0A",

        "land-paper": "rgb(var(--bg) / <alpha-value>)",
        "land-surface": "rgb(var(--bg-elevated) / <alpha-value>)",
        "land-muted-bg": "rgb(var(--bg-subtle) / <alpha-value>)",
        "land-border": "rgb(var(--border) / var(--border-alpha))",
        "land-ink": "rgb(var(--text) / <alpha-value>)",
        "land-muted": "rgb(var(--text-secondary) / <alpha-value>)",
        "land-accent": "rgb(var(--accent) / <alpha-value>)",
        "land-destructive": "rgb(var(--error) / <alpha-value>)",
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
        apple: "var(--shadow-apple)",
        "apple-lg": "var(--shadow-apple-lg)",
        "apple-float": "var(--shadow-apple-lg)",
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
