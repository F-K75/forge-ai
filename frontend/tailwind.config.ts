import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    // `text-base` must stay a font-size utility only. The `base` canvas colour would
    // otherwise also generate a `text-base` colour rule and silently paint text the
    // same colour as the background. Use `text-on-ink` for text on solid fills.
    textColor: ({ theme }) => {
      const { base: _base, ...rest } = theme("colors") as Record<string, unknown>;
      return rest;
    },
    extend: {
      colors: {
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
        // Text/icon colour that sits on solid ink or status fills (canvas colour)
        "on-ink": "rgb(var(--bg) / <alpha-value>)",
        ember: "rgb(var(--primary) / <alpha-value>)",
        "ember-glow": "rgb(var(--primary-hover) / <alpha-value>)",

        inlay: {
          subtle: "rgb(var(--inlay-subtle))",
          DEFAULT: "rgb(var(--inlay))",
          hover: "rgb(var(--inlay-hover))",
          strong: "rgb(var(--inlay-strong))",
        },

        glass: {
          DEFAULT: "var(--glass)",
          border: "var(--glass-border)",
          strong: "var(--glass-strong)",
          "strong-border": "var(--glass-strong-border)",
        },

        // Agent role hues — restrained, harmonious on the Ember Night canvas (see --agent-* in index.css)
        "agent-architect": "rgb(var(--agent-architect) / <alpha-value>)",
        "agent-business-improver": "rgb(var(--agent-business) / <alpha-value>)",
        "agent-designer": "rgb(var(--agent-designer) / <alpha-value>)",
        "agent-developer": "rgb(var(--agent-developer) / <alpha-value>)",
        "agent-integration": "rgb(var(--agent-integration) / <alpha-value>)",
        "agent-pm": "rgb(var(--agent-pm) / <alpha-value>)",

        // Legacy "brutal" aliases remapped onto Ember Night tokens
        brutal: {
          bg: "rgb(var(--bg) / <alpha-value>)",
          cream: "rgb(var(--surface-container) / <alpha-value>)",
          yellow: "rgb(var(--primary) / <alpha-value>)",
          citron: "rgb(var(--primary) / <alpha-value>)",
          logo: "rgb(var(--primary) / <alpha-value>)",
          teal: "rgb(var(--info) / <alpha-value>)",
          pink: "rgb(var(--error) / <alpha-value>)",
          cyan: "rgb(var(--info) / <alpha-value>)",
          green: "rgb(var(--success) / <alpha-value>)",
          lime: "rgb(var(--success) / <alpha-value>)",
          black: "rgb(var(--on-surface) / <alpha-value>)",
          white: "rgb(var(--surface) / <alpha-value>)",
          purple: "rgb(var(--agent-business) / <alpha-value>)",
          orange: "rgb(var(--warning) / <alpha-value>)",
        },

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
          '"Inter"',
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "sans-serif",
        ],
        brand: [
          '"Inter"',
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "sans-serif",
        ],
        sans: [
          '"Inter"',
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          '"Intel One Mono"',
          "ui-monospace",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
        raster: ['"Intel One Mono"', "ui-monospace", "monospace"],
      },
      fontSize: {
        hero: ["4.5rem", { lineHeight: "1", letterSpacing: "-0.035em", fontWeight: "500" }],
        display: ["2.625rem", { lineHeight: "1.05", letterSpacing: "-0.025em", fontWeight: "500" }],
        headline: ["2rem", { lineHeight: "1.15", letterSpacing: "-0.02em", fontWeight: "500" }],
        title: ["1.25rem", { lineHeight: "1.3", letterSpacing: "-0.015em", fontWeight: "500" }],
        body: ["0.9375rem", { lineHeight: "1.45", letterSpacing: "-0.011em", fontWeight: "400" }],
        caption: ["0.8125rem", { lineHeight: "1.45", letterSpacing: "0", fontWeight: "400" }],
        "2xs": ["0.6875rem", { lineHeight: "1.35", letterSpacing: "0.02em", fontWeight: "500" }],
        xs: ["0.75rem", { lineHeight: "1.35", letterSpacing: "0.01em", fontWeight: "500" }],
      },
      borderWidth: {
        DEFAULT: "1px",
        0: "0",
        2: "1.5px",
        3: "1.5px",
        4: "2px",
        6: "2px",
        8: "2px",
      },
      borderRadius: {
        none: "0px",
        apple: "8px",
        "apple-lg": "12px",
        "apple-xl": "16px",
        m3: "8px",
        "m3-lg": "12px",
        xs: "4px",
        sm: "6px",
        md: "10px",
        lg: "14px",
        xl: "16px",
        "2xl": "20px",
        pill: "120px",
      },
      boxShadow: {
        apple: "0 1px 2px rgba(0, 0, 0, 0.25)",
        glow: "0 0 0 1px rgba(255,102,0,0.35), 0 8px 32px -8px rgba(255,102,0,0.45)",
        "apple-lg": "0 8px 24px -4px rgba(15, 23, 42, 0.08), 0 2px 6px rgba(15, 23, 42, 0.04)",
        "apple-float": "0 16px 40px -8px rgba(15, 23, 42, 0.14), 0 4px 12px rgba(15, 23, 42, 0.05)",
        m3: "0 1px 2px rgba(15, 23, 42, 0.05)",
        "m3-2": "0 4px 12px -2px rgba(15, 23, 42, 0.07)",
        "m3-3": "0 12px 28px -6px rgba(15, 23, 42, 0.10)",
        // Legacy brutal shadows flattened: Ember Night uses hairlines, not offset shadows
        brutal: "none",
        "brutal-xs": "none",
        "brutal-sm": "none",
        "brutal-md": "0 8px 24px -12px rgba(0, 0, 0, 0.35)",
        "brutal-lg": "0 16px 40px -16px rgba(0, 0, 0, 0.45)",
        "brutal-xl": "0 24px 56px -20px rgba(0, 0, 0, 0.5)",
        "brutal-press": "none",
        "brutal-dark": "0 8px 24px -12px rgba(0, 0, 0, 0.45)",
        "brutal-yellow": "none",
        "brutal-logo": "none",
        "brutal-cyan": "none",
        "brutal-pink": "none",
        "brutal-green": "none",
      },
      maxWidth: {
        content: "1440px",
        "content-sm": "960px",
        "content-xs": "640px",
      },
      spacing: {
        18: "4.5rem",
        22: "5.5rem",
      },
      transitionTimingFunction: {
        apple: "cubic-bezier(0.25, 0.1, 0.25, 1)",
        spring: "cubic-bezier(0.22, 1, 0.36, 1)",
        m3: "cubic-bezier(0.2, 0, 0, 1)",
        decelerate: "cubic-bezier(0, 0, 0.2, 1)",
        accelerate: "cubic-bezier(0.4, 0, 1, 1)",
      },
      transitionDuration: {
        fast: "150ms",
        med: "220ms",
        slow: "320ms",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.97)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.3s ease-out forwards",
        "scale-in": "scale-in 0.2s ease-out forwards",
        shimmer: "shimmer 2s linear infinite",
      },
    },
  },
} satisfies Config;
