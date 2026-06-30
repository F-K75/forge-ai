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
        "agent-architect":   "#6366F1",
        "agent-designer":    "#A855F7",
        "agent-developer":   "#22D3EE",
        "agent-integration": "#F59E0B",
        "agent-pm":          "#34D399",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
} satisfies Config;
