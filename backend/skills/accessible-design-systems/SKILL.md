---
name: accessible-design-systems
version: 1.0.0
domain: design_tools
description: Semantic design tokens, WCAG AA contrast, keyboard navigation, and responsive grid layouts.
keywords: [ui, ux, design, token, component, layout, accessibility, wcag, dashboard, tailwind]
dependencies: []
permissions: [read_repo]
departments: [design, engineering]
---
Use semantic CSS tokens instead of hardcoded colors, enforce WCAG AA contrast, and ensure full keyboard navigability.

## Tokens & components
- [ ] Three token layers: primitives (`blue-600`), semantic (`color-action-primary`), component (`button-bg`).
- [ ] Components reference semantic tokens only; no raw hex values or magic pixel numbers.
- [ ] Spacing and type follow a fixed scale; dark mode is a token swap, not a fork.
- [ ] Each component documents variants, states, props, and do/don't usage.
- [ ] Reuse existing components before creating new ones; extend via variants.

## Accessibility
- [ ] Text contrast >= 4.5:1 (3:1 for large text and UI boundaries) in every theme.
- [ ] Every interactive element is reachable and operable by keyboard with a visible focus ring.
- [ ] Use native elements (`button`, `a`, `label`) before ARIA; add ARIA only to fill gaps.
- [ ] Inputs have associated labels; errors are announced and linked to fields.
- [ ] Dialogs trap focus, close on Escape, and return focus to the trigger.
- [ ] Do not convey meaning with color alone; respect `prefers-reduced-motion`.
- [ ] Touch targets are at least 24x24 CSS px (44 recommended).

## Pitfalls
- `div` click handlers with no role, tab stop, or key handling.
- Placeholder text used as the only label.
