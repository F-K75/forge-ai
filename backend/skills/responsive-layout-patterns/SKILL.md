---
name: responsive-layout-patterns
version: 1.0.0
domain: design_tools
description: Mobile-first responsive layouts with CSS grid/flexbox, breakpoints, container queries, and fluid typography.
keywords: [responsive, mobile, mobile-first, breakpoint, css grid, flexbox, viewport, container query, sidebar, overflow, fluid typography, tablet]
dependencies: [accessible-design-systems]
permissions: [read_repo]
departments: [design, engineering]
---
Design the smallest screen first, let content decide breakpoints, and make layouts flex rather than snap between fixed widths.

## Checklist
- [ ] Start from a single-column mobile layout; add columns as space allows.
- [ ] Use flexbox for one-dimensional rows/stacks and grid for two-dimensional layouts.
- [ ] Pick breakpoints where content breaks, using the design system's shared values.
- [ ] Use container queries for components that live in variable-width slots.
- [ ] Size with relative units (`rem`, `%`, `fr`, `minmax`, `clamp`) instead of fixed pixels.
- [ ] Collapse sidebars into drawers and wide tables into cards or horizontal scroll with a hint.
- [ ] Keep line length readable (45-80 characters) at every width.
- [ ] Prevent overflow: long words, URLs, and code blocks wrap or scroll inside their box.
- [ ] Test at 320px width, 200% zoom, and both orientations; nothing is cut off.
- [ ] Images use `srcset`/`sizes` and reserve space to avoid layout shift.

## Pitfalls
- Hiding essential actions on mobile instead of reorganizing them.
- Hover-only interactions with no touch equivalent.
