# Ember Night: Forge AI design language

Forge's interface follows the visual language of the Pulse AI SaaS Framer template, a copy of
which is in the owner's Framer workspace. It is adapted for a dense, agentic engineering tool.
We reuse the **style** (tokens, type, shapes, rhythm). We do **not** reuse the template's copy,
logo, brand name or illustrations.

## Principles

1. **Near-black canvas, one accent.** Everything is monochrome: white text and white-alpha
   hairlines on `#070707`. Ember orange `#FF6600` is rare. Use it for state labels (`01 Plan`,
   `Pro`, `Live`), the active nav item marker, focus rings and live indicators. Never use it
   for large fills or body text.
2. **Calm density.** Information-rich screens, but generous 16 to 24px gutters, quiet hairlines
   and no heavy shadows. Hierarchy comes from type weight and contrast, not colour.
3. **Pills and soft cards.** Buttons, chips, segmented controls and badges are full pills
   (`rounded-pill`). Cards and panels are `rounded-xl` (16px) with a 1px `border-border`
   (white 12%). Nested elements use smaller radii (10–12px) so corners stay concentric.
4. **Glass chrome.** Nav bars, secondary buttons and overlays use `bg-glass` (white 6%) with
   `border-glass-border` (white 12%) and `backdrop-blur`.
5. **Atmosphere, not decoration.** Hero areas and feature cards get depth from soft radial
   gradients (muted olive `#6E6E4D`, rust `#613020`, teal `#3D5757` fading to near-black)
   under a 30% black overlay. Don't use rainbow tiles, neon, chunky black borders or offset
   "brutal" shadows.
6. **Numbers in mono.** Metrics, prices, counts, costs, IDs and timestamps use
   `font-mono` (Intel One Mono) with `tabular` numbers.

## Tokens (see `frontend/src/index.css` and `tailwind.config.ts`)

| Role | Tailwind | Dark value |
|---|---|---|
| Canvas | `bg-base` | `#070707` |
| Card / panel | `bg-panel` | `#111111` |
| Raised / hover | `bg-panel-alt`, `bg-surface-high` | `#181818`, `#212121` |
| Hairline | `border-border` / `border-border-soft` | white 12% / 6% |
| Text | `text-ink` / `text-muted` / `text-faint` | white / `#A8A8A8` / `#737373` |
| Accent | `text-accent`, `bg-accent/[0.12]` | `#FF6600`, orange 12% |
| Status | `text-ok` `text-warn` `text-error` `text-info` | green / amber / red / blue |

Never hard-code colours (`bg-black`, `text-white`, `#2563EB`, `bg-blue-500`, …). Use the tokens
so the light theme and high-contrast mode keep working. Raw JS colours for charts and canvas
come from `COLORS` in `src/lib/theme.ts`.

## Type

- Family: **Inter** with optical sizing, so large sizes render as Inter Display. Mono: **Intel One Mono**.
- Weights: 500 for headings, labels and buttons. 400 for body. Avoid 700+.
- Tracking: −0.02em on headings, −0.011em on body.
- Scale: `text-hero` 72, `text-display` 42, `text-headline` 32, `text-title` 20, `text-body` 15,
  `text-caption` 13, `text-xs` 12.
- Two-tone headings are a signature move. The first phrase is `text-ink`, the continuation is
  `text-muted`, for example "See the work. <muted>Know what's next.</muted>"

## Components

- **Button** (`components/ui/Button`):
  - `primary`: solid ink pill, the single main CTA per view.
  - `secondary`: glass pill.
  - `tonal`: ember tint, for agent and live actions.
  - `ghost`: for toolbars.
- **Badge**: pill. `accent` is the orange-12% step label (`01 Plan`, `Pro`, `Live`).
- **Card**: 16px radius, hairline, `bg-panel`. Feature cards may add an atmospheric radial gradient layer.
- **Stat tile**:
  - Icon in a 32px rounded square (`bg-ink/[0.06]`).
  - Label `text-caption text-muted`.
  - Value `font-mono text-headline`.
  - Delta `text-xs text-ok` with an arrow, and "vs last week" in `text-faint`.
- **List row** (dashboard "Active Projects"): 56px thumbnail or gradient swatch, title plus one
  muted line, a thin 4px progress bar with a percentage above it, a meta line ("12 tasks · 3/5
  members"), avatar stack, and a status pill on the right.
- **Sidebar** (app shell):
  - Logo at the top, then a `⌘K` search field.
  - Grouped nav with small `text-xs text-faint` group labels. The active item has `bg-ink/[0.06]` and white text.
  - Settings and Help near the bottom, with a user card (avatar, name, role) as the last item.
- **Segmented control**: a pill track `bg-ink/[0.06]`, with the active segment as a solid ink pill
  (like the Monthly/Yearly switch).

## Reference

Reference crops of the template (layout reference only; don't ship them):
`/tmp/claude-0/-home-user-forge-ai/d7c97e5b-4cff-5651-a9a6-4eda1167a7b8/scratchpad/{hero,dash,features,pricing}.png`
