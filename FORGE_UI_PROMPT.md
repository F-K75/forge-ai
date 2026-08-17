# Forge AI — Full UI Replication Prompt

Use this prompt to replicate the complete Forge AI visual system in any new product. Hand it to any coding agent (Claude Code, Codex, Cursor, Copilot, etc.) — it covers the design tokens, CSS layer, app shell, every page family, every component, and the motion language.

---

# FORGE UI MASTER PROMPT

Build a web app UI that matches the exact visual language of the Forge AI product (Apple x Material 3 hybrid, dark-first, teal accent). The system below is the full specification: tokens, CSS layer, shell, pages, components, and motion. Implement it verbatim wherever classes appear.

## 1. Design tokens (CSS variables — define exactly)

Dark mode is the default. Light mode and high-contrast mirror it.

```css
:root, .dark {
  --bg: 0 0 0;                    /* page background — pure black */
  --surface: 28 28 30;            /* panel background */
  --surface-container: 44 44 46;  /* elevated surfaces, hover fills */
  --surface-container-high: 58 58 60;
  --on-surface: 245 245 247;      /* primary text — Apple off-white */
  --on-surface-variant: 161 161 166; /* secondary text (muted) */
  --outline-muted: 142 142 147;   /* tertiary text (faint) */
  --outline: 255 255 255;
  --outline-alpha: 0.14;          /* hairline borders: white @ 14% */
  --outline-soft-alpha: 0.08;     /* internal dividers: white @ 8% */
  --primary: 20 184 166;          /* accent — teal #14B8A6 */
  --primary-hover: 132 204 22;    /* lime #84CC16 — gradient partner only */
  --primary-container: rgba(20, 184, 166, 0.16); /* accent-soft fills */
  --success: 48 209 88;           /* #30D158 green */
  --warning: 255 159 10;          /* #FF9F0A orange */
  --error: 255 69 58;             /* #FF453A red */
  --state-hover: rgba(255, 255, 255, 0.08);
  --state-pressed: rgba(255, 255, 255, 0.12);
  --state-focus: rgba(20, 184, 166, 0.24);
  --elevation-1: 0 1px 3px rgba(0,0,0,0.4), 0 0 1px rgba(255,255,255,0.08);
  --elevation-2: 0 8px 28px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.1);
  --elevation-3: 0 16px 48px rgba(0,0,0,0.55), 0 0 1px rgba(255,255,255,0.12);
  --accent-glow: rgba(20, 184, 166, 0.28);
  --radius-apple: 20px;
  color-scheme: dark;
}
.light {
  --bg: 245 245 247; --surface: 255 255 255; --surface-container: 251 251 253;
  --on-surface: 29 29 31; --on-surface-variant: 110 110 115; --outline-muted: 161 161 166;
  --outline: 0 0 0; --outline-alpha: 0.12; --outline-soft-alpha: 0.06;
  --primary-container: rgba(20, 184, 166, 0.1);
  --state-hover: rgba(0,0,0,0.04); --state-pressed: rgba(0,0,0,0.08);
  color-scheme: light;
}
```

**Semantic Tailwind colors** (map these to the vars):
- `base` = page bg, `panel` = surface, `panel-alt` = surface-container, `surface-high`
- `ink` = primary text, `muted` = secondary text, `faint` = tertiary text
- `accent`/`ember` = teal, `accent-soft` = primary-container, `secondary`/`ember-glow` = lime
- `ok` green, `warn` orange, `error` red, `info` teal
- `border` = outline @ 14%, `border-soft` = outline @ 8%

**Radii:** cards 16–28px (`rounded-m3` 16, `rounded-m3-lg` 28, `rounded-apple` 20, `rounded-apple-lg` 28, `rounded-apple-xl` 32), buttons rounded-full, small chips 8–12px.

**Shadows:** `shadow-m3` = elevation-1; `shadow-m3-2` = elevation-2; `shadow-apple`/`shadow-apple-lg`/`shadow-apple-float` = elevation 1/2/3.

**Fonts:** `font-display`/`font-brand` = `-apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, system-ui`; `font-sans` = SF Pro Text stack; `font-mono` = `"SF Mono", ui-monospace, Menlo, Monaco, Consolas`. Body: 17px, line-height 1.47, `letter-spacing: -0.014em`, antialiased.

**Scrollbars:** 8px, transparent track, `rgba(255,255,255,0.2)` rounded thumb.

**Per-agent hue palette** (used for agent avatars, pipeline tiles, graph nodes — applied as hex with alpha suffixes like `${hue}18`, `${hue}24`, `${hue}88`):
- architect `#0A84FF` blue, business_improver `#5E5CE6` indigo, designer `#BF5AF2` purple, developer `#30D158` green, integration `#64D2FF` cyan, pm `#FF9F0A` orange

## 2. Core CSS component classes (define these)

```css
.glass          /* rgba(28,28,30,0.72) + 1px rgba(255,255,255,0.1) border + blur(24px) saturate(1.4) */
.glass-strong   /* 0.88 alpha + blur(28px) saturate(1.5) + border-white/12 */
.bb-btn         /* rounded-full px-6 py-2.5 text-[15px] font-medium tracking-tight, M3 state layer */
.bb-btn-primary /* bg-accent text-white */
.bb-btn-tonal   /* teal text on primary-container */
.bb-btn-ghost   /* transparent, muted text */
.bb-btn-subtle  /* ink text on fill-subtle */
.bb-btn-outlined/* border + ink text */
.bb-input       /* rounded-m3 border-outline bg-panel-alt px-4 py-3; focus: teal border + 4px teal glow ring */
.bb-chip        /* rounded-full px-3 py-1.5 text-caption; selected = primary-container bg + teal text */
.bb-panel       /* rounded-m3-lg border-outline bg-panel shadow-m3 */
.bb-card        /* same + hover: shadow-m3-2, -translate-y-0.5 */
.bb-badge       /* inline-flex rounded-full px-2.5 py-0.5 text-caption font-medium */
.bb-skeleton    /* rounded + shimmer */
.gradient-ember /* linear-gradient(135deg, teal, lime) — signature diagonal gradient */
.apple-glass / .apple-glass-strong  /* glass + elevation, used on floating bars */
.apple-dock     /* rgba(28,28,30,0.82) + blur(28px) saturate(1.5) + border-white/10 */
.apple-dock-item /* hover: translateY(-4px) scale(1.06) + fill-subtle; is-active: primary-container + teal text */
.launch-atmosphere /* 3 radial glows (blue/purple/cyan) over near-black vertical gradient */
.forge-bg-grid  /* 48px grid lines rgba(255,255,255,0.025), radial mask fading at 80% */
.forge-bg-glow  /* teal radial glows at top */
.forge-bg-vignette /* radial vignette darkening edges */
```

Keyframes: `blink` (1s step-end caret), `shimmer` (2s linear sweep), `spin-globe` (50s), `orbit-spin` (28s), `agent-pulse` (1.6s glow ring), `forge-signal-pulse` (2s success ring), `forge-pulse-ring` (3s expanding ring), `forge-glow-breathe` (4s opacity/scale), `launch-fleet-ping` (1.8s expanding border ring). All animations must be disabled under `prefers-reduced-motion`.

## 3. App shell (floating nav + dock)

The app is a full-viewport shell with a floating Apple-style top bar and bottom dock; every page renders inside it.

- Root: `apple-shell relative flex h-[100dvh] flex-col overflow-hidden text-ink` with `radial-gradient(ellipse 80% 50% at 50% -10%, teal 14%, transparent 55%)` tint.
- **Top bar**: `mx-3 mt-3 rounded-apple-lg px-4 py-3` — swaps `apple-glass` ↔ `apple-glass-strong` after 8px scroll. Left: logo + wordmark (`font-brand text-[17px] font-semibold tracking-tight`) + divider `h-4 w-px bg-white/10` + current page title (`text-[15px] font-medium text-muted`). Right: credits chip (`bb-chip font-mono text-xs` — "1247 credits · pro"), theme toggle, notification bell, agent-fleet button (`h-9 w-9 rounded-full bg-panel-alt` with Activity icon), avatar button (`h-9 w-9 rounded-full bg-accent text-white` with user initial).
- **Main area**: `flex-1 overflow-y-auto px-3 pb-28 pt-4 sm:px-5 sm:pt-5` wrapping `mx-auto max-w-content`. Pages animate in on route change: `{opacity:0, y:10} → 0.35s ease [0.22,1,0.36,1]`.
- **Dock**: centered at bottom, `apple-dock rounded-apple-xl px-2 py-2`. Items: `flex min-w-[3.25rem] flex-col items-center gap-1 rounded-2xl px-2.5 py-2 text-muted` with `Icon size={20} strokeWidth={1.75}` + `text-[10px] font-medium tracking-wide` label. Active = `is-active` (teal container + teal text). A `w-px self-stretch bg-border-soft` divider separates core apps (Projects, Flow, Initiatives, Reviews, Marketplace) from account/admin apps (Billing, Settings, Admin, LLM, Optimization, Health, Prompts).
- **Global**: ⌘K command palette, notification dropdown, skip-to-content link, agent fleet modal all accessible from any page.

## 4. Page families

### 4.1 Launch / marketing (`/`)
Full-bleed hero over an interactive globe. `launch-atmosphere` fixed background. Giant wordmark: `font-brand text-[clamp(3.5rem,12vw,72px)] font-semibold leading-[1.05] tracking-[-0.04em]` with blur-in entrance (`filter: blur(8px) → 0`, 0.8s, ease `[0.22,1,0.36,1]`). Kicker `text-[13px] font-medium tracking-[0.04em] text-muted`. **Prompt bar**: `rounded-full apple-glass-strong px-2 py-2 pl-4` with transparent input, rotating typed placeholder + blinking teal caret, submit `bb-btn bb-btn-primary`. Example chips `bb-chip`. Bottom-right fleet dock: live agent pills (per-hue `rounded-full` tiles with ping ring), progress track (`h-[3px] rounded-full bg-white/[0.08]` with teal fill + glowing head dot), mono counters. Marketing sections below: 11 stacked `py-32 border-t` sections in `max-w-6xl mx-auto px-6`.

### 4.2 Auth (`/login`, `/signup`)
Split-screen: `grid lg:grid-cols-2 min-h-[calc(100vh-4rem)]`. Left: centered form card `w-full max-w-sm`. Right: full-bleed image with left-edge gradient scrim. Shared elements: eyebrow (`text-xs uppercase tracking-[0.18em] text-muted` + `w-6 h-px bg-muted/50` rule — the signature motif), `h1 font-display text-3xl font-medium tracking-tight`, `bb-input h-11` fields with uppercase micro-labels, divider ("or continue with"), Google button (`h-11 rounded-md border border-border`), password strength meter (3 animated color bars), error banner (`border-error/40 bg-error/10` with shake animation on submit), primary CTA `bb-btn bb-btn-primary w-full` with arrow that nudges right on hover.

### 4.3 Projects home (`/projects`) — the app home
Background layers: `forge-bg-glow` + `forge-bg-grid` + `forge-bg-vignette` (absolute, z-0). Content `mx-auto px-4 pb-16 md:px-8`.
- **Hero**: eyebrow icon chip (`h-7 w-7 rounded-lg bg-accent/10 text-accent` + `text-xs font-medium tracking-wide text-muted`), H1 `font-display text-3xl font-semibold leading-[1.08] tracking-tight md:text-[2.75rem]` with a gradient span `bg-gradient-to-r from-accent to-secondary bg-clip-text text-transparent`, 3 stat cards (`rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 backdrop-blur-xl`, icon chip + count-up value + `text-[11px]` label + teal trend), and an animated visual (breathing glow blob, orbiting rings with glowing dots, floating particles, glass tile with live status pill).
- **Build command bar**: `apple-glass-strong rounded-2xl p-2` with rocket tile (`h-10 w-10 rounded-xl bg-gradient-to-br from-accent/25 to-accent/10`), transparent prompt input, teal submit button (`h-11 rounded-xl bg-accent px-6 font-semibold shadow-[0_8px_24px_-12px_rgba(20,184,166,0.45)]`), suggestion chips (`rounded-xl border border-white/10 bg-white/[0.04] hover:border-accent/40 hover:bg-accent/10`).
- **Library toolbar**: `border-b border-white/[0.06] px-4 py-2.5` with accent uppercase label, pill search input (`h-9 rounded-full bg-panel-alt`), pill selects, and a segmented view toggle (`rounded-full bg-panel-alt p-0.5`, active segment `bg-accent-soft text-accent`).
- **Project cards**: icon grid card `rounded-3xl border border-white/[0.08] bg-white/[0.02] p-4` with gradient cover tile that lifts on hover; list row `rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3` with 12px cover tile + meta + status dot (live = `bg-ok` with `animate-ping` halo).
- Empty state: centered icon tile `w-16 h-16 rounded-2xl glass`, title, description, primary + secondary buttons.

### 4.4 Flow (`/flow`) — agent orchestration
- Hero: eyebrow chip (Activity icon), H1 "Ship software faster with AI agents", subline, CTA `rounded-xl bg-accent px-6 h-11` + "No credit card required" caption.
- Stats row: 3 glass cards (builds completed / uptime / avg pipeline run) with trend badges.
- Stage nav: pipeline chips (Discovery `#0071E3` → Definition `#BF5AF2` → Planning `#FF9F0A` → Execution `#30D158`), each `rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2` with colored dot + agent count, ChevronRight separators, and a Graph | Timeline segmented toggle.
- Main panel: `rounded-2xl border border-white/[0.08] bg-panel/95 shadow-m3-2 backdrop-blur-xl` containing the interactive **agent fleet graph** (see 5.6), with an optional guided-tour banner above it.

### 4.5 Workspace / build IDE (`/build/...`)
Full-viewport 3-pane IDE: `h-screen flex flex-col` — TopBar, `grid grid-cols-[340px_minmax(0,1fr)_320px] gap-3 p-3` (Chat | Editor | Preview), StatusBar. Mobile: single panel + bottom tab bar (active `text-accent`). All three panels are `glass-strong rounded-xl` (see 5.8).

### 4.6 Standard content pages (Marketplace, Reviews, Billing, Settings, admin tools)
- **Centered scroll pages**: `mx-auto max-w-5xl px-4 py-6 md:px-8` (Marketplace/Reviews), `max-w-4xl` (Billing), `max-w-2xl` (Settings), `max-w-7xl` (admin). Page entrance: `{opacity:0, y:10} → 0.35s ease [0.16,1,0.3,1]`.
- **Page header**: `Heading level="h2"` (`font-display text-2xl font-semibold tracking-tight`) + description `text-muted mt-1 max-w-2xl`.
- **Section eyebrow**: `flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted mb-5` + `w-6 h-px bg-muted/50`.
- **Filter chips**: `Button variant="chip" size="sm"`, active = `border-accent/40 bg-accent/10 text-ink`.
- **Cards**: `border border-border bg-panel shadow-m3` radius 16px, hover lift `-translate-y-0.5 shadow-m3-2`.
- **Hairline grids**: `grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border` with `bg-base` cells (stat tiles, summary chips, plan cards).
- **Tables** (admin dialect): `table w-full text-left`; thead `th px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide`; rows `border-t border-border-soft`, hover `bg-panel-alt`; mono numerics; empty state `py-6 text-center text-sm text-faint`.
- **Admin pages** (Optimization, LLM Management, Prompt Studio) use a utilitarian **slate dialect**: `text-slate-200` base, `border-slate-800 bg-slate-900/70` panels, emerald `#10B981` primary buttons, `bg-slate-800` secondary — same layout grammar, flat palette.
- **Settings**: vertical sections `max-w-2xl space-y-10`, each `border border-border rounded-lg` panel with icon header (`Icon size={13} text-muted` + `text-sm font-medium`), Row component (label + description left, control right, `border-t border-border-soft` dividers), Toggle switches, segmented radios (active `border-ink text-ink`), inline inputs `h-9 rounded-md border-border bg-transparent text-xs`.

## 5. Component library (exact specs)

### 5.1 Button
Base: `inline-flex cursor-pointer items-center justify-center gap-2 font-medium transition-colors focus-visible:ring-2 focus-visible:ring-accent/40` — radius 16px. Variants: `primary` = `bg-accent text-white hover:opacity-90`; `secondary` = `border border-border bg-panel text-ink hover:bg-panel-alt`; `chip` = `border border-border bg-panel text-muted hover:border-accent/40 hover:text-ink` radius 9999. Sizes: `sm h-8 px-3 text-xs`, `md h-10 px-4 text-sm`, `lg h-12 px-6 text-sm`. Hover `scale:1.03` spring 400/20, tap `0.96`.

### 5.2 StatusPill
`text-[10px] font-medium px-2 py-0.5 rounded-full` with inline `background: {color}1A` (10% alpha) + full-color text. Map: complete→ok, running→accent, debugging→warn, failed→error, pending→muted. Springs in `scale 0.5→1 back.out(2)`, hover 1.1, tap 0.95.

### 5.3 SummaryChip (metric tile)
`bg-base px-4 py-3.5 rounded-lg border border-border`; label `text-[10px] uppercase tracking-[0.1em] text-faint mb-1.5`; value `font-mono text-base font-medium` (`text-warn` when warn, else `text-ink`).

### 5.4 RunStatusPill (agent runs)
`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium`: running = `text-accent border-accent/30 bg-accent-soft` with pulsing dot; needs_review = `text-warn border-warn/30 bg-warn/10`; done = `text-ok border-ok/30 bg-ok/10`.

### 5.5 Pipelines (vertical agent rails)
Row: `flex gap-3` — 34px tile column + 2px connector + label. Tile: idle `rounded-lg border border-border`; active = ink/teal fill + `animate-ping` ring + spinning Loader2; done = teal-tinted border (`{ACCENT}44`) + Check; failed = `bg-error/[0.08] border-error/25` + X; debugging = `bg-warn/[0.08] border-warn/25`. Connector: `w-0.5` min-h 18px, `bg-ink/40` when done else `bg-border`. Labels: idle `text-faint`, debugging `text-warn`, active `text-ink`. GSAP entrance `{opacity:0, x:-16, scale:0.92}` stagger 0.07s `power3.out`. Accent variant (reviews) uses teal with glow `boxShadow: 0 0 14px {ACCENT}55` on the active tile.

### 5.6 Agent fleet graph (ReactFlow)
Panel: `rounded-2xl border border-white/[0.08] bg-panel/95 shadow-m3-2 backdrop-blur-xl h-[75vh]`. Header: icon badge + agent-count chip (`rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px]`). Node: `min-w-[180px] rounded-2xl border bg-white/[0.04] px-4 py-3` with per-hue glow `boxShadow: inset 0 0 0 1px {hue}22` + corner wash `linear-gradient(135deg, {hue}14, transparent 50%)`, icon tile `h-10 w-10 rounded-xl` with `linear-gradient(135deg, {hue}24, {hue}10)` + hue icon. Edges: `smoothstep` animated, lane stroke `rgba(255,255,255,0.15)` w 1.5, gateway lane teal `rgba(20,184,166,0.3)`. Background grid `#22222E` gap 20. Detail drawer slides in from right (`x:20`), info blocks `rounded-xl border border-white/[0.06] bg-white/[0.02] p-4`.

### 5.7 App chrome components
- **CommandPalette (⌘K)**: backdrop `bg-black/60 backdrop-blur-sm`; dialog `max-w-lg rounded-2xl bg-panel border-border shadow-apple-lg` at `pt-[15vh]`; search row with border-b; rows `rounded-lg px-3 py-2` active `bg-accent-soft text-ink`; section labels `text-[10px] uppercase tracking-[0.12em] text-faint`; footer with mono kbd hints. Entrance `{opacity:0, y:-8, scale:0.98}` 0.2s.
- **NotificationsBell**: `w-8 h-8 rounded-md` + ink unread dot (`w-1.5 h-1.5 rounded-full bg-ink`); dropdown `w-80 glass rounded-lg shadow-xl`, rows `px-4 py-3 border-b border-border-soft`, unread hover `bg-panel-alt`.
- **ThemeToggle**: cycles dark → light → high-contrast; segmented variant uses `bb-chip`/`bb-chip-selected`.
- **Toggle**: track `h-5 w-9 rounded-full p-0.5` — on `bg-ink`, off `bg-border`; knob `h-4 w-4 rounded-full`, spring 500/30, tap scale 0.9.

### 5.8 Build workspace panels (glass-strong)
- **TopBar**: `h-14 bg-base/70 backdrop-blur border-b border-border`, logo tile `w-7 h-7 rounded-md gradient-ember` + Sparkles, breadcrumb, status pill (`rounded-full border-border bg-panel/60` with pulsing dot: Ready `bg-faint`, Building `bg-ember` pulse, Refining `bg-warn` pulse, Live `bg-ok`, Failed `bg-error`), DeployButton.
- **ChatPanel**: pipeline strip (`grid grid-cols-6 gap-1.5` tiles `h-9 w-9 rounded-lg` per-agent hues via `color-mix(in oklab, {hue} X%, transparent)`, active tile glows `boxShadow: 0 0 16px -4px {hue}55`), auto-approve row, gate approval card (`rounded-lg border border-ember/30 bg-ember/10 p-3`), transcript with user bubbles (`rounded-2xl rounded-tr-sm border-ember/30 bg-ember/10`), agent messages with hue icon tiles (`h-5 w-5 rounded` bg `color-mix(hue 14%, transparent)` + `text-[10px] uppercase tracking-wider` hue label), composer with `gradient-ember` circular send button (ArrowUp).
- **EditorPanel**: `grid grid-cols-[220px_minmax(0,1fr)]`, file tree with 2px ember left-rail on active file (`border-ember text-ink bg-ember/5`), tabs, "Writing" chip (`rounded-full bg-ember/15 text-ember` + blinking dot), Monaco `vs-dark` fontSize 13. Loading: dashed orbit spinner (`rounded-full border-2 border-dashed border-ember/40 animate-spin` 6s) + shimmering skeleton lines.
- **PreviewPanel**: macOS browser frame (`bg-[#fafafa]` light chrome — traffic lights `#ec6a5e`/`#f4bf4f`/`#61c454`), Live chip `bg-ok/15 text-ok`, QA gauge (SVG circle `stroke #34D399`, score + `/ 100`).
- **StatusBar**: `h-8 bg-base/70 backdrop-blur border-t` with connection dot (pulsing glow), debug/error indicators, mono counters (`font-mono tabular-nums` + Cpu/Zap icons).

### 5.9 Agent run panels (PM tabs)
- **AgentRunShell**: `bb-panel overflow-hidden`; header with per-hue icon tile (`h-9 w-9 rounded-lg` bg `{hue}24`); body `grid md:grid-cols-[1fr_220px]`; right rail with `text-[10px] uppercase tracking-wider text-faint` labels, mono metric rows, `h-[3px]` progress bar with teal fill, mono log lines with colored timestamps.
- **RunCard**: `rounded-lg border p-3.5`; accent variant `border-accent/30 bg-accent-soft`. Section label: `text-[10px] font-medium uppercase tracking-wider text-faint`.
- **Badges**: story count `rounded border border-border px-2 py-0.5 text-[10.5px] text-muted`; priority P0 `text-warn border-warn/30`.

### 5.10 Charts (recharts)
- **ChartContainer**: ResponsiveContainer, default 220px, grows in `{opacity:0, scaleY:0.85, origin bottom}` 0.6s.
- **ChartTooltip**: `rounded-lg glass px-3 py-2 text-xs` with 8px color dots + mono values.
- Styling: grid `#22222E`, axis `#5A5A6B` fontSize 10 no ticks; bars `radius [0,3,3,0]`; revenue area `#E8823C` strokeWidth 2 fillOpacity 0.15; stacked success `#34D399` / fail `#EF4444`; per-series colors from the agent hue cycle.

## 6. Motion language (uniform rules)

- **Entrances**: framer-motion variants `fadeUp {y:24}`, `fadeIn`, `scaleIn {scale:0.92}`, `slideInLeft {x:-32}`, `slideInRight {x:32}`, `flipIn`; `staggerContainer` (staggerChildren 0.06, delayChildren 0.1) + `staggerItem {opacity:0, y:16, scale:0.97}`. Page fade `{opacity:0, y:10→16}` 0.35–0.5s, ease `[0.16,1,0.3,1]` or `[0.22,1,0.36,1]`.
- **Springs**: stiffness 300–500, damping 15–32. Buttons hover 1.03/tap 0.96; cards hover `{y:-4, scale:1.01}`; pills `back.out(2)`.
- **GSAP**: list staggers 0.03–0.08s (`power2/3.out`, `back.out`), count-ups (`power2.out` 800–900ms), infinite pulses gated on reduced motion.
- **Every animation** respects `prefers-reduced-motion` — disable when set.
- **Micro-labels** are always `text-[10px] uppercase tracking-wider/widest text-faint`; status colors on pills at 10–15% alpha backgrounds.

## 7. Tech stack to implement in

- React + Vite, Tailwind CSS v3 (CSS vars + `rgb(var(--x) / <alpha-value>)`), lucide-react icons, framer-motion (`motion/react`), gsap for entrances/count-ups, recharts for charts, ReactFlow for the fleet graph, optional three-globe/cobe for the launch globe.
- Semantic classes only: `bg-base`, `bg-panel`, `bg-panel-alt`, `text-ink`, `text-muted`, `text-faint`, `text-accent`, `bg-accent/10`, `bg-accent-soft`, `border-outline`, `shadow-m3`, `shadow-m3-2`, `glass`, `glass-strong`, `gradient-ember`, `bb-btn bb-btn-primary`, `bb-input`, `bb-chip`.
- Responsive: `mx-auto px-4 md:px-8` containers, `grid-cols-1 sm:grid-cols-3` stat grids, dock/panels collapse to bottom tab bars on mobile.

Build the full shell first (tokens → CSS classes → shell → page layout), then the components, then populate pages. Match classes verbatim.