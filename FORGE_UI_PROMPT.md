# Forge UI Prompt

Copy-paste prompt for replicating the Forge AI "Flow" page visual language in any new product. Works with any AI coding tool.

---

Build a "Flow" page that matches the exact visual language of the Forge AI app (Apple x Material 3 hybrid, dark-first). Reference the design system below precisely.

## Design tokens (CSS variables — replicate verbatim)

- Dark default: `--bg: 0 0 0`, `--surface: 28 28 30`, `--surface-container: 44 44 46`
- Text: `--on-surface: 245 245 247`, `--on-surface-variant: 161 161 166` (muted), `--outline-muted: 142 142 147` (faint)
- Accent (primary): teal `#14B8A6` (`rgb(20 184 166)`), hover shifts to lime `#84CC16`
- Secondary: lime `#84CC16`; success `#30D158`; warning `#FF9F0A`; error `#FF453A`
- Borders: `--outline-alpha: 0.14` (subtle white outline), soft alpha `0.08`; on light mode use `0.12`/`0.06` black
- Radii: Apple-style, 12–20px (`--radius-apple: 20px`, cards rounded-2xl, buttons rounded-full)
- Elevation: `0 8px 28px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.1)` for lifted panels; accent glow `rgba(20,184,166,0.3)`
- Fonts: SF Pro Display / Inter for display, SF Pro Text / Inter for body, SF Mono for code — `-apple-system` stack
- Light mode mirrors with white surface `255 255 255`, bg `245 245 247`, text `29 29 31`

## Page structure (top to bottom)

1. **Eyebrow + Hero**: small rounded icon chip (7x7, `bg-accent/10 text-accent`, lucide icon, e.g. Activity) above an h1 in display font, `text-3xl md:text-4xl font-semibold tracking-tight`; subline in muted `text-[15px]`. CTA button: `rounded-xl bg-accent px-6 h-11 text-white font-semibold` with `shadow-[0_8px_24px_-12px_rgba(20,184,166,0.45)]` + a muted caption ("No credit card required").
2. **Stats row**: 3-col grid of glassmorphic cards — `rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl px-4 py-3`, each with an accent icon chip, display-font value, `text-[11px]` muted label, and a small teal trend badge (e.g. `+12%`).
3. **Stage navigation**: horizontal pipeline of stages (Discovery → Definition → Planning → Execution), each a `rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2` chip with a colored status dot (`#0071E3` blue, `#BF5AF2` purple, `#FF9F0A` orange, `#30D158` green), agent count, separated by faint `ChevronRight` icons. Right side: segmented control pill (`rounded-full bg-white/[0.02] p-0.5`) with "Graph | Timeline" toggle — active segment is `bg-accent-soft text-accent`.
4. **Main visualization**: large panel `rounded-2xl border border-white/[0.08] bg-panel/95 backdrop-blur-xl shadow-m3-2` containing an animated agent fleet graph (nodes per stage with per-agent colors: architect `#0A84FF`, designer `#BF5AF2`, developer `#30D158`, PM `#FF9F0A`, integration `#64D2FF`), edges animating build flow, and per-agent status pills.
5. **Status pills**: `text-[10px] rounded-full px-2 py-0.5`, background = color at 10% alpha, text = full color. Statuses: complete (green), running (teal, pulsing), debugging (orange), failed (red), pending (gray).
6. **Guided tour banner**: thin bar above the graph — "Guided tour: watch how a build flows through agents" with a teal "Skip" link; auto-plays the graph animation once (sessionStorage flag).

## Motion rules

- Framer Motion (`motion/react`): staggered container/items on hero (`staggerContainer`/`staggerItem`), fade-up `{opacity: 0, y: 12}` → `{opacity: 1, y: 0}` with ~0.1s sequential delays for stats → stages → graph
- Pills spring in: `scale 0.5→1, ease back.out(2)`, hover `scale 1.1`, tap `0.95`, spring `stiffness 400 damping 17`
- Respect `prefers-reduced-motion`

## Tech stack

- React + Vite, Tailwind CSS v3, lucide-react icons, framer-motion, optional gsap for entrance micro-animations
- Use semantic color classes: `bg-base`, `bg-panel`, `border-outline`, `text-ink`, `text-muted`, `text-faint`, `bg-accent/10`, `text-accent`, `bg-accent-soft`
- Keep it responsive: `mx-auto px-4 md:px-8`, stats grid `grid-cols-3`, stage chips wrap on mobile