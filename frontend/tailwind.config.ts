import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Apple × Material 3 semantic surfaces
        base: "rgb(var(--bg) / <alpha-value>)",
        panel: "rgb(var(--surface) / <alpha-value>)",
        "panel-alt": "rgb(var(--surface-container) / <alpha-value>)",
        "surface-high": "rgb(var(--surface-container-high) / <alpha-value>)",
        border: "rgb(var(--outline) / var(--outline-alpha))",
        "border-soft": "rgb(var(--outline) / var(--outline-soft-alpha))",
        outline: "rgb(var(--outline) / var(--outline-alpha))",
        ink: "rgb(var(--on-surface) / <alpha-value>)",
        muted: "rgb(var(--on-surface-variant) / <alpha-value>)",
        faint: "rgb(var(--outline-muted) / <alpha-value>)",
        accent: "rgb(var(--primary) / <alpha-value>)",
        "accent-soft": "var(--primary-container)",
        secondary: "rgb(var(--secondary) / <alpha-value>)",
        "secondary-soft": "var(--secondary-container)",
        ok: "rgb(var(--success) / <alpha-value>)",
        warn: "rgb(var(--warning) / <alpha-value>)",
        error: "rgb(var(--error) / <alpha-value>)",
        info: "rgb(var(--info) / <alpha-value>)",
        ember: "rgb(var(--primary) / <alpha-value>)",
        "ember-glow": "rgb(var(--primary-hover) / <alpha-value>)",

        // Adaptive inlay surfaces (dark: white-alpha, light: black-alpha).
        // Replaces hardcoded bg-white/[0.02-0.08] / border-white/[0.06-0.2]
        // so cards, chips and borders stay visible in light + high-contrast.
        inlay: {
          subtle: "rgb(var(--inlay-subtle) / <alpha-value>)",
          DEFAULT: "rgb(var(--inlay) / <alpha-value>)",
          hover: "rgb(var(--inlay-hover) / <alpha-value>)",
          strong: "rgb(var(--inlay-strong) / <alpha-value>)",
        },

        "agent-architect": "#0A84FF",
        "agent-business-improver": "#5E5CE6",
        "agent-designer": "#BF5AF2",
        "agent-developer": "#30D158",
        "agent-integration": "#64D2FF",
        "agent-pm": "#FF9F0A",

        "land-paper": "rgb(var(--bg) / <alpha-value>)",
        "land-surface": "rgb(var(--surface) / <alpha-value>)",
        "land-muted-bg": "rgb(var(--surface-container) / <alpha-value>)",
        "land-border": "rgb(var(--outline) / var(--outline-alpha))",
        "land-ink": "rgb(var(--on-surface) / <alpha-value>)",
        "land-muted": "rgb(var(--on-surface-variant) / <alpha-value>)",
        "land-accent": "rgb(var(--primary) / <alpha-value>)",
        "land-destructive": "rgb(var(--error) / <alpha-value>)",
      },
      fontFamily: {
        display: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Display"',
          "Inter",
          "system-ui",
          "sans-serif",
        ],
        brand: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Display"',
          "Inter",
          "system-ui",
          "sans-serif",
        ],
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Text"',
          "Inter",
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
      fontSize: {
        hero: ["4.5rem", { lineHeight: "1.05", letterSpacing: "-0.04em", fontWeight: "600" }],
        display: ["3.5rem", { lineHeight: "1.1", letterSpacing: "-0.03em", fontWeight: "600" }],
        headline: ["2rem", { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "600" }],
        title: ["1.25rem", { lineHeight: "1.35", letterSpacing: "-0.015em", fontWeight: "600" }],
        body: ["1.0625rem", { lineHeight: "1.47", letterSpacing: "-0.014em", fontWeight: "400" }],
        caption: ["0.8125rem", { lineHeight: "1.4", letterSpacing: "0", fontWeight: "400" }],
      },
      borderRadius: {
        apple: "20px",
        "apple-lg": "28px",
        "apple-xl": "32px",
        m3: "16px",
        "m3-lg": "28px",
      },
      boxShadow: {
        apple: "var(--elevation-1)",
        "apple-lg": "var(--elevation-2)",
        "apple-float": "var(--elevation-3)",
        m3: "var(--elevation-1)",
        "m3-2": "var(--elevation-2)",
      },
      maxWidth: {
        content: "1440px",
      },
      spacing: {
        18: "4.5rem",
        22: "5.5rem",
      },
      transitionTimingFunction: {
        apple: "cubic-bezier(0.25, 0.1, 0.25, 1)",
        spring: "cubic-bezier(0.22, 1, 0.36, 1)",
        m3: "cubic-bezier(0.2, 0, 0, 1)",
      },
      transitionDuration: {
        fast: "150ms",
        med: "250ms",
        slow: "400ms",
      },
    },
  },
} satisfies Config;
