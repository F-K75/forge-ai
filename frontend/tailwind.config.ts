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
        // "land-" because it's a light theme that intentionally reuses names
        // (ink, accent, border, muted...) already bound to dark-mode values
        // above for the authenticated app. Do not rename these to bare
        // "ink"/"accent"/etc: 15+ app files rely on the dark values.
        "land-paper":            "#FBFBFA",
        "land-surface":          "#FFFFFF",
        "land-border":           "#E7E7E2",
        "land-border-soft":      "#F1F1ED",
        "land-ink":              "#1B1B1F",
        "land-muted":            "#71717A",
        "land-faint":            "#A8A8AD",
        "land-accent":           "#4F46E5",
        "land-accent-soft":      "#EEEDFB",
        "land-live":             "#3F6212",
        "land-architect":        "#5B6CB8",
        "land-architect-tint":   "#EEF0F8",
        "land-designer":         "#9A6BAE",
        "land-designer-tint":    "#F4EEF6",
        "land-developer":        "#3E8C9B",
        "land-developer-tint":   "#EAF3F4",
        "land-integration":      "#C08A3E",
        "land-integration-tint": "#F7F0E6",
        "land-pm":               "#5E8C57",
        "land-pm-tint":          "#EDF3EB",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
} satisfies Config;
