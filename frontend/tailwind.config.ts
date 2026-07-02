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

        // Public landing page (marketing site) palette — namespaced with
        // "land-" so it can diverge from the authenticated app's dark tokens
        // above. Minimalist dark theme (mirrors the Lovable reference design:
        // near-black ground, monochrome type, a single blue accent). Do not
        // rename these to bare "ink"/"accent"/etc: 15+ app files rely on the
        // dark values already bound to those names.
        "land-paper":            "#0A0A0B",
        "land-surface":          "#111113",
        "land-border":           "#232326",
        "land-border-soft":      "#1A1A1D",
        "land-ink":              "#F2F2F5",
        "land-muted":            "#9B9BA3",
        "land-faint":            "#6B6B72",
        "land-accent":           "#3B82F6",
        "land-accent-soft":      "rgba(59,130,246,0.14)",
        "land-live":             "#3B82F6",
        "land-architect":        "#818CF8",
        "land-architect-tint":   "rgba(129,140,248,0.14)",
        "land-designer":         "#C084FC",
        "land-designer-tint":    "rgba(192,132,252,0.14)",
        "land-developer":        "#22D3EE",
        "land-developer-tint":   "rgba(34,211,238,0.14)",
        "land-integration":      "#FBBF24",
        "land-integration-tint": "rgba(251,191,36,0.14)",
        "land-pm":               "#34D399",
        "land-pm-tint":          "rgba(52,211,153,0.14)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
} satisfies Config;
